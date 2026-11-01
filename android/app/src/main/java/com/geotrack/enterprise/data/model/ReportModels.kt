package com.geotrack.enterprise.data.model

enum class ReportStatus {
    SUBMITTED,
    APPROVED,
    REJECTED,
    PAID
}

data class ReportSubmitRequest(
    val reportDate: String,
    val startTime: String,
    val endTime: String,
    val totalDistanceKm: Double,
    val totalMovingTimeMins: Int,
    val totalIdleTimeMins: Int,
    val calculatedFuelLiters: Double,
    val fuelRateApplied: Double,
    val totalFuelAmount: Double,
    val extraTollAmount: Double = 0.0,
    val extraParkingAmount: Double = 0.0,
    val totalClaimAmount: Double,
    val agentNotes: String = ""
)

data class ReportItem(
    val id: String,
    val reportNumber: String,
    val reportDate: String,
    val totalDistanceKm: Double,
    val totalFuelAmount: Double,
    val extraTollAmount: Double,
    val extraParkingAmount: Double,
    val totalClaimAmount: Double,
    val status: ReportStatus,
    val agentNotes: String? = null,
    val rejectionReason: String? = null,
    val submittedAt: String
)
