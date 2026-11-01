package com.geotrack.enterprise.data.preferences

import android.content.Context
import android.provider.Settings
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.geotrack.enterprise.data.model.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "geotrack_enterprise_prefs")

class AppPreferences(private val context: Context) {
    private val gson = Gson()

    companion object {
        private val KEY_AUTH_TOKEN = stringPreferencesKey("auth_jwt_token")
        private val KEY_API_URL = stringPreferencesKey("backend_api_url")
        private val KEY_USER_PROFILE = stringPreferencesKey("logged_user_profile")
        private val KEY_DEVICE_ID = stringPreferencesKey("hardware_device_id")
        const val DEFAULT_API_URL = "http://10.0.2.2:8080"
    }

    val authTokenFlow: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_AUTH_TOKEN]
    }

    val apiUrlFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_API_URL] ?: DEFAULT_API_URL
    }

    val userProfileFlow: Flow<UserProfile?> = context.dataStore.data.map { prefs ->
        val json = prefs[KEY_USER_PROFILE]
        if (!json.isNullOrBlank()) {
            try {
                gson.fromJson(json, UserProfile::class.java)
            } catch (e: Exception) {
                null
            }
        } else {
            null
        }
    }

    suspend fun saveAuthSession(token: String, user: UserProfile) {
        context.dataStore.edit { prefs ->
            prefs[KEY_AUTH_TOKEN] = token
            prefs[KEY_USER_PROFILE] = gson.toJson(user)
        }
    }

    suspend fun setApiUrl(url: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_API_URL] = url.trim().trimEnd('/')
        }
    }

    suspend fun clearSession() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_AUTH_TOKEN)
            prefs.remove(KEY_USER_PROFILE)
        }
    }

    fun getHardwareDeviceId(): String {
        return try {
            val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
                androidId
            } else {
                "dev-" + UUID.randomUUID().toString().substring(0, 8)
            }
        } catch (e: Exception) {
            "dev-fallback"
        }
    }
}
