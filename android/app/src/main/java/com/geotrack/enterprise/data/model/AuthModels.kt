package com.geotrack.enterprise.data.model

data class LoginRequest(
    val emailOrCode: String,
    val password: String
)

data class LoginResponse(
    val success: Boolean,
    val token: String? = null,
    val user: UserProfile? = null,
    val message: String? = null
)

data class UserProfile(
    val id: String,
    val fullName: String,
    val email: String,
    val role: String,
    val employeeCode: String,
    val vehicleRegistration: String? = null,
    val vehicleType: String? = "Motorcycle",
    val fuelEfficiencyKmL: Double = 35.0,
    val fuelRatePerLiter: Double = 105.0
)
