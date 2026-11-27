package com.geotrack.enterprise.service

import android.Manifest
import android.annotation.SuppressLint
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.*
import com.geotrack.enterprise.MainActivity
import com.geotrack.enterprise.R
import com.geotrack.enterprise.data.model.LocationTelemetry
import com.geotrack.enterprise.data.preferences.AppPreferences
import com.geotrack.enterprise.data.remote.ApiClient
import com.geotrack.enterprise.data.remote.AuthExpiredException
import com.geotrack.enterprise.util.GpsKalmanFilter
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.firstOrNull
import java.text.SimpleDateFormat
import java.util.*

class LocationTrackingService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var batteryProvider: BatteryTelemetryProvider
    private lateinit var preferences: AppPreferences
    private val apiClient = ApiClient()
    private val kalmanFilter = GpsKalmanFilter(qMetresPerSecond = 2.5f)

    private var previousLocation: Location? = null
    private var lastMovingSecondTimestamp = System.currentTimeMillis()

    companion object {
        const val NOTIFICATION_ID = 8842
        const val CHANNEL_ID = "geotrack_shift_channel"
        const val ACTION_START = "ACTION_START_SHIFT"
        const val ACTION_STOP = "ACTION_STOP_SHIFT"
    }

    override fun onCreate() {
        super.onCreate()
        preferences = AppPreferences(applicationContext)
        batteryProvider = BatteryTelemetryProvider(applicationContext)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        createNotificationChannel()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                for (location in result.locations) {
                    processLocationUpdate(location)
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                startForegroundTracking()
            }
            ACTION_STOP -> {
                stopForegroundTracking()
            }
        }
        return START_STICKY
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    @SuppressLint("MissingPermission")
    private fun startForegroundTracking() {
        if (!hasLocationPermission()) {
            LocationStateHolder.setSyncStatus("Location permission required")
            LocationStateHolder.setTracking(false)
            stopSelf()
            return
        }

        LocationStateHolder.setTracking(true)
        LocationStateHolder.setSyncStatus("Acquiring GPS fix...")

        val notification = buildNotification("Starting Shift...", "Connecting to GPS satellites")
        startForeground(NOTIFICATION_ID, notification)

        // Send immediate initial position if available so manager map updates right away
        fusedLocationClient.lastLocation.addOnSuccessListener { lastLoc ->
            if (lastLoc != null) {
                processLocationUpdate(lastLoc)
            }
        }

        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1500L)
            .setMinUpdateIntervalMillis(1000L)
            .setMinUpdateDistanceMeters(0.5f)
            .setWaitForAccurateLocation(false)
            .build()

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )
    }

    private fun processLocationUpdate(location: Location) {
        if (location.accuracy > 150f) return

        val nowMs = System.currentTimeMillis()
        val (filteredLat, filteredLng) = kalmanFilter.filter(
            location.latitude,
            location.longitude,
            location.accuracy,
            nowMs
        )

        // Calculate delta distance (only count high-precision fixes for odometer accuracy)
        var isMoving = false
        val speedKmh = location.speed * 3.6f
        if (speedKmh > 2.5f) {
            isMoving = true
        }

        if (location.accuracy <= 45f) {
            previousLocation?.let { prev ->
                val results = FloatArray(1)
                Location.distanceBetween(prev.latitude, prev.longitude, filteredLat, filteredLng, results)
                val distMeters = results[0]

                if (distMeters in 2.0..300.0) {
                    val deltaKm = distMeters / 1000.0
                    LocationStateHolder.addDistance(deltaKm)
                }
            }

            previousLocation = Location("filtered").apply {
                latitude = filteredLat
                longitude = filteredLng
            }
        }

        val elapsedSec = ((nowMs - lastMovingSecondTimestamp) / 1000).coerceAtLeast(1)
        lastMovingSecondTimestamp = nowMs
        LocationStateHolder.addSeconds(isMoving, elapsedSec)

        val (batteryPct, isCharging) = batteryProvider.getBatteryInfo()
        val deviceId = preferences.getHardwareDeviceId()
        val timeStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(nowMs))

        serviceScope.launch {
            val user = preferences.userProfileFlow.firstOrNull()
            val agentName = user?.fullName ?: "Field Agent"
            val empCode = user?.employeeCode ?: ""
            val agentId = user?.id ?: ""
            val token = preferences.authTokenFlow.firstOrNull()
            val apiUrl = preferences.apiUrlFlow.firstOrNull() ?: AppPreferences.DEFAULT_API_URL

            if (token.isNullOrBlank() || preferences.isTokenExpired(token)) {
                preferences.clearSession()
                LocationStateHolder.setSyncStatus("Session expired — please sign in again")
                withContext(Dispatchers.Main) { stopForegroundTracking() }
                return@launch
            }

            val telemetry = LocationTelemetry(
                deviceId = deviceId,
                agentName = agentName,
                employeeCode = empCode,
                agentId = agentId,
                lat = filteredLat,
                lng = filteredLng,
                speedKmh = speedKmh,
                bearing = location.bearing,
                altitude = location.altitude,
                accuracy = location.accuracy,
                batteryPct = batteryPct,
                isCharging = isCharging,
                timestamp = nowMs,
                timeFormatted = timeStr
            )

            LocationStateHolder.updateTelemetry(telemetry)

            // Stream to backend API and reflect sync status
            val syncResult = apiClient.sendTelemetry(apiUrl, token, telemetry)
            syncResult.onSuccess {
                LocationStateHolder.setSyncStatus("Synced to Manager • $timeStr")
            }.onFailure { err ->
                if (err is AuthExpiredException) {
                    preferences.clearSession()
                    LocationStateHolder.setSyncStatus("Session expired — please sign in again")
                    withContext(Dispatchers.Main) { stopForegroundTracking() }
                    return@launch
                }
                LocationStateHolder.setSyncStatus("Sync retrying (${err.message ?: "network"})")
            }

            // Update Notification
            val odo = LocationStateHolder.odometerKm.value
            updateNotification(
                "Shift Active: ${"%.1f".format(odo)} km",
                "Speed: ${speedKmh.toInt()} km/h • Battery: $batteryPct%"
            )
        }
    }

    private fun stopForegroundTracking() {
        LocationStateHolder.setTracking(false)
        fusedLocationClient.removeLocationUpdates(locationCallback)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.tracking_notification_channel),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.tracking_notification_desc)
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(title: String, content: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(title: String, content: String) {
        val notification = buildNotification(title, content)
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
