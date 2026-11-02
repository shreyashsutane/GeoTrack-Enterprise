package com.geotrack.enterprise.data.model

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    @SerializedName("email_or_code", alternate = ["emailOrCode"])
    val emailOrCode: String,
    @SerializedName("password")
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
    @SerializedName("full_name", alternate = ["fullName"])
    val fullName: String,
    val email: String,
    @SerializedName("role_name", alternate = ["role"])
    val role: String,
    @SerializedName("employee_code", alternate = ["employeeCode"])
    val employeeCode: String,
    @SerializedName("vehicle_registration", alternate = ["vehicleRegistration"])
    val vehicleRegistration: String? = null,
    @SerializedName("vehicle_type", alternate = ["vehicleType"])
    val vehicleType: String? = "Motorcycle",
    @SerializedName("fuel_efficiency_km_l", alternate = ["fuelEfficiencyKmL"])
    val fuelEfficiencyKmL: Double = 35.0,
    @SerializedName("fuel_rate_per_liter", alternate = ["fuelRatePerLiter"])
    val fuelRatePerLiter: Double = 105.0
)
