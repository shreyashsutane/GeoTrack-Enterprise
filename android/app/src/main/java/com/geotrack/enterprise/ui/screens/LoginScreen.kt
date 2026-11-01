package com.geotrack.enterprise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.geotrack.enterprise.data.model.LoginRequest
import com.geotrack.enterprise.data.model.UserProfile
import com.geotrack.enterprise.data.preferences.AppPreferences
import com.geotrack.enterprise.data.remote.ApiClient
import com.geotrack.enterprise.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    preferences: AppPreferences,
    onLoginSuccess: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    val apiClient = remember { ApiClient() }

    var emailOrCode by remember { mutableStateOf("EMP-104") }
    var password by remember { mutableStateOf("AgentPass123!") }
    var passwordVisible by remember { mutableStateOf(false) }

    val savedApiUrl by preferences.apiUrlFlow.collectAsState(initial = AppPreferences.DEFAULT_API_URL)
    var apiUrl by remember(savedApiUrl) { mutableStateOf(savedApiUrl) }
    var showServerConfig by remember { mutableStateOf(false) }

    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // App Branding Icon
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .background(
                        Brush.linearGradient(listOf(CyanPrimary, DarkSurfaceVariant)),
                        RoundedCornerShape(20.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = DarkBackground,
                    modifier = Modifier.size(40.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "GeoTrack Enterprise",
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )

            Text(
                text = "Field Agent Shift & Telematics",
                fontSize = 14.sp,
                color = TextSecondary
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Login Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(16.dp),
                border = CardDefaults.outlinedCardBorder().copy(brush = Brush.linearGradient(listOf(DarkBorder, CyanPrimary.copy(alpha = 0.3f))))
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "Agent Sign In",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    OutlinedTextField(
                        value = emailOrCode,
                        onValueChange = { emailOrCode = it },
                        label = { Text("Employee Code or Email") },
                        leadingIcon = { Icon(Icons.Default.Badge, contentDescription = null, tint = CyanPrimary) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = CyanPrimary,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password (Argon2id)") },
                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = CyanPrimary) },
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    imageVector = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                    contentDescription = null,
                                    tint = TextSecondary
                                )
                            }
                        },
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = CyanPrimary,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )

                    if (errorMessage != null) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = errorMessage ?: "",
                            color = AccentRed,
                            fontSize = 13.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            coroutineScope.launch {
                                isLoading = true
                                errorMessage = null
                                preferences.setApiUrl(apiUrl)

                                val result = apiClient.login(apiUrl, LoginRequest(emailOrCode.trim(), password))
                                result.onSuccess { resp ->
                                    if (resp.success && resp.token != null && resp.user != null) {
                                        preferences.saveAuthSession(resp.token, resp.user)
                                        onLoginSuccess()
                                    } else {
                                        errorMessage = resp.message ?: "Authentication failed."
                                    }
                                }.onFailure { err ->
                                    // Provide clear feedback with fallback demo option
                                    errorMessage = "Could not reach server: ${err.localizedMessage}"
                                }
                                isLoading = false
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = CyanPrimary),
                        enabled = !isLoading && emailOrCode.isNotBlank() && password.isNotBlank()
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(color = DarkBackground, modifier = Modifier.size(24.dp))
                        } else {
                            Text(
                                text = "Sign In & Start Shift",
                                color = DarkBackground,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Offline Demo Bypass
                    OutlinedButton(
                        onClick = {
                            coroutineScope.launch {
                                val demoUser = UserProfile(
                                    id = "demo-agent-104",
                                    fullName = "Rahul Sharma",
                                    email = "rahul.sharma@geotrack.com",
                                    role = "FIELD_AGENT",
                                    employeeCode = "EMP-104",
                                    vehicleRegistration = "MH-02-CB-8842",
                                    vehicleType = "Motorcycle",
                                    fuelEfficiencyKmL = 38.0,
                                    fuelRatePerLiter = 105.0
                                )
                                preferences.saveAuthSession("demo-jwt-token-offline", demoUser)
                                onLoginSuccess()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecondary),
                        border = ButtonDefaults.outlinedButtonBorder().copy(brush = Brush.linearGradient(listOf(DarkBorder, DarkBorder)))
                    ) {
                        Icon(Icons.Default.Bolt, contentDescription = null, modifier = Modifier.size(16.dp), tint = AccentOrange)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Instant Offline Demo Mode", fontSize = 13.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Collapsible Server URL Config
            TextButton(onClick = { showServerConfig = !showServerConfig }) {
                Icon(Icons.Default.Settings, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (showServerConfig) "Hide Server URL" else "Configure Backend API URL",
                    color = TextMuted,
                    fontSize = 12.sp
                )
            }

            if (showServerConfig) {
                OutlinedTextField(
                    value = apiUrl,
                    onValueChange = { apiUrl = it },
                    label = { Text("Go Backend URL (Stack A)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = CyanPrimary,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            }
        }
    }
}
