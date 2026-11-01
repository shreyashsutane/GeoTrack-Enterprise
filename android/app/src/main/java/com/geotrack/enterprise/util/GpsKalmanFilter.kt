package com.geotrack.enterprise.util

class GpsKalmanFilter(
    private val qMetresPerSecond: Float = 3f
) {
    private var timestampMs: Long = 0
    private var lat: Double = 0.0
    private var lng: Double = 0.0
    private var variance: Float = -1f

    val isInitialized: Boolean
        get() = variance >= 0f

    fun reset() {
        variance = -1f
        lat = 0.0
        lng = 0.0
        timestampMs = 0
    }

    fun filter(
        newLat: Double,
        newLng: Double,
        newAccuracy: Float,
        newTimestampMs: Long
    ): Pair<Double, Double> {
        val accuracy = if (newAccuracy < 1f) 1f else newAccuracy

        if (variance < 0f) {
            this.timestampMs = newTimestampMs
            this.lat = newLat
            this.lng = newLng
            this.variance = accuracy * accuracy
            return Pair(newLat, newLng)
        }

        val durationMs = newTimestampMs - this.timestampMs
        if (durationMs > 0) {
            this.variance += (durationMs / 1000f) * qMetresPerSecond * qMetresPerSecond
            this.timestampMs = newTimestampMs
        }

        val k = this.variance / (this.variance + accuracy * accuracy)
        this.lat += k * (newLat - this.lat)
        this.lng += k * (newLng - this.lng)
        this.variance = (1f - k) * this.variance

        return Pair(this.lat, this.lng)
    }
}
