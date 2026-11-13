import java.net.URI

plugins {
    id("com.android.application")
    kotlin("android")
    id("org.jetbrains.kotlin.plugin.compose")
}
// Only these public addresses are eligible for embedding in the APK.
// Pleos project metadata and client credentials stay local and are never BuildConfig fields.
val publicKeys = setOf("ARRIVAL_API_BASE_URL", "ARRIVAL_COMPANION_BASE_URL")
val publicLocalSettings = rootProject.file(".env.local").takeIf { it.isFile }
    ?.readLines(Charsets.UTF_8)?.mapNotNull { raw ->
        val line = raw.trim()
        if (line.isEmpty() || line.startsWith("#") || !line.contains("=")) return@mapNotNull null
        val key = line.substringBefore("=").trim()
        if (key !in publicKeys) return@mapNotNull null
        val value = line.substringAfter("=").trim()
        val unquoted = if (value.length >= 2 &&
            ((value.first() == '\"' && value.last() == '\"') ||
             (value.first() == '\'' && value.last() == '\''))) value.substring(1, value.length - 1) else value
        key to unquoted
    }?.toMap().orEmpty()

fun publicAddress(key: String, fallback: String): String {
    val value = providers.environmentVariable(key).orNull ?: publicLocalSettings[key] ?: fallback
    if (value.isBlank()) return fallback
    val uri = runCatching { URI(value) }.getOrNull()
    require(uri != null && uri.scheme in setOf("http", "https") && !uri.host.isNullOrBlank() &&
        uri.userInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
        (uri.port == -1 || uri.port in 1..65535)) {
        "$key must be an HTTP(S) base URL without credentials, query, or fragment."
    }
    return value.trimEnd('/')
}

fun javaString(value: String): String = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
val apiBaseUrl = publicAddress("ARRIVAL_API_BASE_URL", "http://10.0.2.2:8080")
val companionBaseUrl = publicAddress("ARRIVAL_COMPANION_BASE_URL", "")

android {
    namespace = "com.arrivetogether.app"
    compileSdk = 35
    useLibrary("android.car", false)
    defaultConfig {
        applicationId = "com.arrivetogether.app"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-demo"
        buildConfigField("String", "ARRIVAL_API_BASE_URL", javaString(apiBaseUrl))
        buildConfigField("String", "ARRIVAL_COMPANION_BASE_URL", javaString(companionBaseUrl))
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation(project(":domain"))
    implementation("com.google.zxing:core:3.5.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("ai.pleos.playground:NaviHelper:3.0.5")
    implementation("ai.pleos.playground:FusedLocation:1.1.3")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    debugImplementation("androidx.compose.ui:ui-tooling")
}


// Bundle the same public map and entrance guide used by Cloudflare Pages; no remote app scripts.
val arrivalMapAssetDir = layout.buildDirectory.dir("generated/arrivalMapAssets")
val prepareArrivalMapAssets by tasks.registering(Sync::class) {
    from(rootProject.file("companion/public/map")) { into("map") }
    from(rootProject.file("companion/public/guides")) { into("guides") }
    from(rootProject.file("contracts/oryong-demo.json")) { into("catalog") }
    into(arrivalMapAssetDir)
}
android.sourceSets.getByName("main").assets.srcDir(arrivalMapAssetDir)
tasks.named("preBuild").configure { dependsOn(prepareArrivalMapAssets) }
