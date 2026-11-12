package com.arrivetogether.app

/** Public endpoint configuration only. No project credentials belong in an Android APK. */
object AppConfiguration {
    val apiBaseUrl: String = BuildConfig.ARRIVAL_API_BASE_URL
    val companionBaseUrl: String? = BuildConfig.ARRIVAL_COMPANION_BASE_URL.takeIf { it.isNotBlank() }
}
