package com.geotrack.enterprise.data.remote

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.geotrack.enterprise.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class AuthExpiredException(message: String) : Exception(message)

enum class SessionStatus {
    VALID,
    UNAUTHORIZED,
    NETWORK_ERROR
}

class ApiClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private fun parseErrorMessage(responseStr: String, statusCode: Int, fallback: String): String {
        val extracted = try {
            val obj = gson.fromJson(responseStr, JsonObject::class.java)
            obj?.get("error")?.asString ?: obj?.get("message")?.asString
        } catch (e: Exception) {
            null
        }?.trim().orEmpty()

        return when {
            extracted.equals("invalid credentials", ignoreCase = true) ->
                "Invalid employee code, email, or password."
            extracted.isNotBlank() -> extracted.replaceFirstChar { it.uppercase() }
            statusCode == 401 -> "Invalid employee code, email, or password."
            statusCode == 403 -> "Account is suspended. Contact your administrator."
            statusCode == 429 -> "Too many failed login attempts. Try again later."
            else -> fallback
        }
    }

    suspend fun verifySession(baseUrl: String, token: String): SessionStatus = withContext(Dispatchers.IO) {
        try {
            val httpRequest = Request.Builder()
                .url("$baseUrl/api/v1/auth/me")
                .addHeader("Authorization", "Bearer $token")
                .get()
                .build()

            client.newCall(httpRequest).execute().use { response ->
                when {
                    response.isSuccessful -> SessionStatus.VALID
                    response.code == 401 || response.code == 403 -> SessionStatus.UNAUTHORIZED
                    else -> SessionStatus.NETWORK_ERROR
                }
            }
        } catch (e: Exception) {
            SessionStatus.NETWORK_ERROR
        }
    }

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
                    Result.failure(Exception(parseErrorMessage(responseStr, response.code, "Unable to sign in (HTTP ${response.code}).")))
                }
            }
        } catch (e: Exception) {
            Result.failure(Exception("Unable to reach server. Check your internet connection."))
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
                val responseStr = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    Result.success(true)
                } else {
                    Result.failure(Exception(parseErrorMessage(responseStr, response.code, "Report submission failed (HTTP ${response.code}).")))
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
                    Result.failure(Exception(parseErrorMessage(responseStr, response.code, "Failed to fetch reports (HTTP ${response.code}).")))
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
                val responseStr = response.body?.string() ?: ""
                when {
                    response.isSuccessful -> Result.success(true)
                    response.code == 401 -> Result.failure(AuthExpiredException("Session expired. Please sign in again."))
                    else -> Result.failure(Exception(parseErrorMessage(responseStr, response.code, "Sync failed (HTTP ${response.code})")))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
