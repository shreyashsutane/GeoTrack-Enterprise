package com.geotrack.enterprise.data.model

data class LocationTelemetry(
    val deviceId: String,
    val agentName: String,
    val lat: Double,
    val lng: Double,
    val speedKmh: Float,
    val bearing: Float,
    val altitude: Double,
    val accuracy: Float,
    val batteryPct: Int,
    val isCharging: Boolean,
    val timestamp: Long,
    val timeFormatted: String
)
