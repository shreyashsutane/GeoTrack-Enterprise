package com.geotrack.enterprise.ui.screens

import android.content.Context
import android.content.Intent
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geotrack.enterprise.data.model.UserProfile
import com.geotrack.enterprise.service.LocationStateHolder
import com.geotrack.enterprise.service.LocationTrackingService
import com.geotrack.enterprise.ui.theme.*

@Composable
fun TrackerScreen(
    userProfile: UserProfile?,
    onNavigateToSubmitReport: () -> Unit
) {
    val context = LocalContext.current
    val isTracking by LocationStateHolder.isTracking.collectAsState()
    val telemetry by LocationStateHolder.latestTelemetry.collectAsState()
    val odometerKm by LocationStateHolder.odometerKm.collectAsState()
    val movingSec by LocationStateHolder.movingTimeSeconds.collectAsState()
    val idleSec by LocationStateHolder.idleTimeSeconds.collectAsState()

    val movingHours = movingSec / 3600
    val movingMinutes = (movingSec % 3600) / 60
    val idleMinutes = idleSec / 60

    val animatedBorderColor by animateColorAsState(
        targetValue = if (isTracking) AccentGreen else CyanPrimary,
        label = "shift_border_color"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Agent Profile Header
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(16.dp),
            border = CardDefaults.outlinedCardBorder().copy(brush = Brush.linearGradient(listOf(DarkBorder, DarkSurfaceVariant)))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(DarkSurfaceVariant, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = CyanPrimary,
                        modifier = Modifier.size(28.dp)
                    )
                }

                Spacer(modifier = Modifier.width(14.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = userProfile?.fullName ?: "Field Agent",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Text(
                        text = "ID: ${userProfile?.employeeCode ?: "EMP-104"} • ${userProfile?.vehicleRegistration ?: "MH-02-CB-8842"}",
                        fontSize = 13.sp,
                        color = TextSecondary
                    )
                }

                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = if (isTracking) AccentGreen.copy(alpha = 0.15f) else DarkSurfaceVariant
                ) {
                    Text(
                        text = if (isTracking) "ON DUTY" else "OFF DUTY",
                        color = if (isTracking) AccentGreen else TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(28.dp))

        // Big Shift Start / Stop Button
        Box(
            modifier = Modifier
                .size(190.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            if (isTracking) AccentGreen.copy(alpha = 0.2f) else CyanPrimary.copy(alpha = 0.15f),
                            Color.Transparent
                        )
                    )
                )
                .border(3.dp, animatedBorderColor, CircleShape)
                .padding(12.dp),
            contentAlignment = Alignment.Center
        ) {
            Button(
                onClick = {
                    val intent = Intent(context, LocationTrackingService::class.java).apply {
                        action = if (isTracking) LocationTrackingService.ACTION_STOP else LocationTrackingService.ACTION_START
                    }
                    if (isTracking) {
                        context.startService(intent)
                    } else {
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                            context.startForegroundService(intent)
                        } else {
                            context.startService(intent)
                        }
                    }
                },
                modifier = Modifier.fillMaxSize(),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isTracking) AccentRed.copy(alpha = 0.85f) else CyanPrimary
                )
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = if (isTracking) Icons.Default.Stop else Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = DarkBackground,
                        modifier = Modifier.size(40.dp)
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = if (isTracking) "END SHIFT" else "START SHIFT",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = DarkBackground
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(28.dp))

        // Live Telemetry 4-Card Grid
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TelemetryMetricCard(
                title = "Today's Distance",
                value = "%.2f".format(odometerKm),
                unit = "km",
                icon = Icons.Default.Route,
                iconColor = CyanPrimary,
                modifier = Modifier.weight(1f)
            )

            TelemetryMetricCard(
                title = "Current Speed",
                value = telemetry?.speedKmh?.toInt()?.toString() ?: "0",
                unit = "km/h",
                icon = Icons.Default.Speed,
                iconColor = AccentGreen,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TelemetryMetricCard(
                title = "Moving Time",
                value = "%02d:%02d".format(movingHours, movingMinutes),
                unit = "hrs",
                icon = Icons.Default.Timer,
                iconColor = AccentOrange,
                modifier = Modifier.weight(1f)
            )

            TelemetryMetricCard(
                title = "Battery Level",
                value = "${telemetry?.batteryPct ?: 95}",
                unit = "%",
                icon = Icons.Default.BatteryChargingFull,
                iconColor = AccentPurple,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Quick Action: Submit Report after Shift
        Button(
            onClick = onNavigateToSubmitReport,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
            border = ButtonDefaults.outlinedButtonBorder().copy(brush = Brush.linearGradient(listOf(DarkBorder, CyanPrimary.copy(alpha = 0.5f))))
        ) {
            Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = CyanPrimary)
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "File Daily Trip & Fuel Claim",
                color = TextPrimary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp
            )
        }
    }
}

@Composable
fun TelemetryMetricCard(
    title: String,
    value: String,
    unit: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconColor: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(14.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.linearGradient(listOf(DarkBorder, DarkBorder)))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = title, fontSize = 12.sp, color = TextSecondary)
                Icon(imageVector = icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(18.dp))
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = value,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = unit,
                    fontSize = 12.sp,
                    color = TextMuted,
                    modifier = Modifier.padding(bottom = 3.dp)
                )
            }
        }
    }
}
