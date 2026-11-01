package com.geotrack.enterprise.service

import com.geotrack.enterprise.data.model.LocationTelemetry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object LocationStateHolder {
    private val _isTracking = MutableStateFlow(false)
    val isTracking: StateFlow<Boolean> = _isTracking.asStateFlow()

    private val _latestTelemetry = MutableStateFlow<LocationTelemetry?>(null)
    val latestTelemetry: StateFlow<LocationTelemetry?> = _latestTelemetry.asStateFlow()

    private val _odometerKm = MutableStateFlow(0.0)
    val odometerKm: StateFlow<Double> = _odometerKm.asStateFlow()

    private val _movingTimeSeconds = MutableStateFlow(0L)
    val movingTimeSeconds: StateFlow<Long> = _movingTimeSeconds.asStateFlow()

    private val _idleTimeSeconds = MutableStateFlow(0L)
    val idleTimeSeconds: StateFlow<Long> = _idleTimeSeconds.asStateFlow()

    var shiftStartTimeMs: Long = 0L

    fun setTracking(active: Boolean) {
        _isTracking.value = active
        if (active && shiftStartTimeMs == 0L) {
            shiftStartTimeMs = System.currentTimeMillis()
        }
    }

    fun updateTelemetry(telemetry: LocationTelemetry) {
        _latestTelemetry.value = telemetry
    }

    fun addDistance(km: Double) {
        if (km > 0.001) {
            _odometerKm.value += km
        }
    }

    fun addSeconds(moving: Boolean, seconds: Long = 1) {
        if (moving) {
            _movingTimeSeconds.value += seconds
        } else {
            _idleTimeSeconds.value += seconds
        }
    }

    fun resetShift() {
        _odometerKm.value = 0.0
        _movingTimeSeconds.value = 0L
        _idleTimeSeconds.value = 0L
        shiftStartTimeMs = System.currentTimeMillis()
    }
}
