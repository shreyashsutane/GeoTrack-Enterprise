package com.geotrack.enterprise

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.geotrack.enterprise.data.preferences.AppPreferences
import com.geotrack.enterprise.ui.MainScreen
import com.geotrack.enterprise.ui.screens.LoginScreen
import com.geotrack.enterprise.ui.theme.DarkBackground
import com.geotrack.enterprise.ui.theme.GeoTrackTheme

class MainActivity : ComponentActivity() {

    private lateinit var preferences: AppPreferences

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        // Permissions handled
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preferences = AppPreferences(applicationContext)

        checkAndRequestPermissions()

        setContent {
            GeoTrackTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = DarkBackground
                ) {
                    val authToken by preferences.authTokenFlow.collectAsState(initial = null)
                    var isLoggedIn by remember(authToken) { mutableStateOf(!authToken.isNullOrBlank()) }

                    if (isLoggedIn) {
                        MainScreen(
                            preferences = preferences,
                            onLogout = { isLoggedIn = false }
                        )
                    } else {
                        LoginScreen(
                            preferences = preferences,
                            onLoginSuccess = { isLoggedIn = true }
                        )
                    }
                }
            }
        }
    }

    private fun checkAndRequestPermissions() {
        val permissionsToRequest = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val missing = permissionsToRequest.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }
}
