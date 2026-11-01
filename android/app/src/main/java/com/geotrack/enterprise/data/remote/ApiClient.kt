package com.geotrack.enterprise.data.remote

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.geotrack.enterprise.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun login(baseUrl: String, request: LoginRequest): Result<LoginResponse> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/v1/auth/login"
            val body = gson.toJson(request).toRequestBody(jsonMediaType)
            val httpRequest = Request.Builder()
                .url(url)
                .post(body)
                .build()

            client.newCall(httpRequest).execute().use { response ->
                val responseStr = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    val loginResp = gson.fromJson(responseStr, LoginResponse::class.java)
                    Result.success(loginResp)
                } else {
                    Result.failure(Exception("Login failed (HTTP ${response.code}): $responseStr"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun submitReport(baseUrl: String, token: String, report: ReportSubmitRequest): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/v1/reports/submit"
            val body = gson.toJson(report).toRequestBody(jsonMediaType)
            val httpRequest = Request.Builder()
                .url(url)
                .addHeader("Authorization", "Bearer $token")
                .post(body)
                .build()

            client.newCall(httpRequest).execute().use { response ->
                if (response.isSuccessful) {
                    Result.success(true)
                } else {
                    Result.failure(Exception("Report submission failed (HTTP ${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchMyReports(baseUrl: String, token: String): Result<List<ReportItem>> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/v1/reports/my"
            val httpRequest = Request.Builder()
                .url(url)
                .addHeader("Authorization", "Bearer $token")
                .get()
                .build()

            client.newCall(httpRequest).execute().use { response ->
                val responseStr = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    val type = object : TypeToken<List<ReportItem>>() {}.type
                    val list = gson.fromJson<List<ReportItem>>(responseStr, type) ?: emptyList()
                    Result.success(list)
                } else {
                    Result.failure(Exception("Failed to fetch reports (HTTP ${response.code})"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendTelemetry(baseUrl: String, token: String?, telemetry: LocationTelemetry): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/v1/telematics/ping"
            val body = gson.toJson(telemetry).toRequestBody(jsonMediaType)
            val builder = Request.Builder()
                .url(url)
                .post(body)

            if (!token.isNullOrBlank()) {
                builder.addHeader("Authorization", "Bearer $token")
            }

            client.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    Result.success(true)
                } else {
                    Result.failure(Exception("Telemetry failed HTTP ${response.code}"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
