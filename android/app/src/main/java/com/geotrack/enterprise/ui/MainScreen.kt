package com.geotrack.enterprise.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geotrack.enterprise.data.preferences.AppPreferences
import com.geotrack.enterprise.ui.screens.*
import com.geotrack.enterprise.ui.theme.*
import kotlinx.coroutines.launch

enum class MainTab {
    TRACKER,
    SUBMIT_REPORT,
    HISTORY,
    PROFILE
}

@Composable
fun MainScreen(
    preferences: AppPreferences,
    onLogout: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    val userProfile by preferences.userProfileFlow.collectAsState(initial = null)
    var currentTab by remember { mutableStateOf(MainTab.TRACKER) }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = DarkSurface,
                tonalElevation = 8.dp
            ) {
                NavigationBarItem(
                    selected = currentTab == MainTab.TRACKER,
                    onClick = { currentTab = MainTab.TRACKER },
                    icon = { Icon(Icons.Default.Speed, contentDescription = null) },
                    label = { Text("Shift", fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = DarkBackground,
                        selectedTextColor = CyanPrimary,
                        indicatorColor = CyanPrimary,
                        unselectedIconColor = TextSecondary,
                        unselectedTextColor = TextSecondary
                    )
                )

                NavigationBarItem(
                    selected = currentTab == MainTab.SUBMIT_REPORT,
                    onClick = { currentTab = MainTab.SUBMIT_REPORT },
                    icon = { Icon(Icons.Default.ReceiptLong, contentDescription = null) },
                    label = { Text("Claim", fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = DarkBackground,
                        selectedTextColor = CyanPrimary,
                        indicatorColor = CyanPrimary,
                        unselectedIconColor = TextSecondary,
                        unselectedTextColor = TextSecondary
                    )
                )

                NavigationBarItem(
                    selected = currentTab == MainTab.HISTORY,
                    onClick = { currentTab = MainTab.HISTORY },
                    icon = { Icon(Icons.Default.History, contentDescription = null) },
                    label = { Text("History", fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = DarkBackground,
                        selectedTextColor = CyanPrimary,
                        indicatorColor = CyanPrimary,
                        unselectedIconColor = TextSecondary,
                        unselectedTextColor = TextSecondary
                    )
                )

                NavigationBarItem(
                    selected = currentTab == MainTab.PROFILE,
                    onClick = { currentTab = MainTab.PROFILE },
                    icon = { Icon(Icons.Default.Person, contentDescription = null) },
                    label = { Text("Agent", fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = DarkBackground,
                        selectedTextColor = CyanPrimary,
                        indicatorColor = CyanPrimary,
                        unselectedIconColor = TextSecondary,
                        unselectedTextColor = TextSecondary
                    )
                )
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (currentTab) {
                MainTab.TRACKER -> {
                    TrackerScreen(
                        userProfile = userProfile,
                        onNavigateToSubmitReport = { currentTab = MainTab.SUBMIT_REPORT }
                    )
                }
                MainTab.SUBMIT_REPORT -> {
                    SubmitReportScreen(
                        userProfile = userProfile,
                        preferences = preferences,
                        onReportSubmitted = { currentTab = MainTab.HISTORY }
                    )
                }
                MainTab.HISTORY -> {
                    ReportsHistoryScreen(preferences = preferences)
                }
                MainTab.PROFILE -> {
                    AgentProfileScreen(
                        userProfile = userProfile,
                        onLogout = {
                            coroutineScope.launch {
                                preferences.clearSession()
                                onLogout()
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun AgentProfileScreen(
    userProfile: com.geotrack.enterprise.data.model.UserProfile?,
    onLogout: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp)
    ) {
        Text(text = "Agent Profile", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Spacer(modifier = Modifier.height(20.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = userProfile?.fullName ?: "Field Agent", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                Text(text = userProfile?.email ?: "", fontSize = 13.sp, color = TextSecondary)
                Spacer(modifier = Modifier.height(14.dp))
                ReportMetricRow(label = "Employee Code:", value = userProfile?.employeeCode ?: "EMP-104")
                ReportMetricRow(label = "Assigned Vehicle:", value = userProfile?.vehicleRegistration ?: "MH-02-CB-8842")
                ReportMetricRow(label = "Vehicle Type:", value = userProfile?.vehicleType ?: "Motorcycle")
                ReportMetricRow(label = "Fuel Mileage Std:", value = "${userProfile?.fuelEfficiencyKmL ?: 35.0} km/L")
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        Button(
            onClick = onLogout,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            colors = ButtonDefaults.buttonColors(containerColor = AccentRed.copy(alpha = 0.85f)),
            shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
        ) {
            Icon(Icons.Default.ExitToApp, contentDescription = null, tint = TextPrimary)
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = "Sign Out", color = TextPrimary, fontWeight = FontWeight.Bold)
        }
    }
}
