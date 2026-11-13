package com.arrivetogether.app

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.arrivetogether.domain.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream

internal data class ArrivalGuide(val entranceName: String, val instructions: String)
internal fun readArrivalGuide(context: Context): ArrivalGuide? = runCatching {
    val guide = JSONObject(context.assets.open("guides/${OryongDemo.venueId}.${OryongDemo.catalogVersion}.json").bufferedReader().use { it.readText() })
    require(guide.getString("venueId") == OryongDemo.venueId && guide.getString("catalogVersion") == OryongDemo.catalogVersion)
    guide.getJSONObject("entrance").let { ArrivalGuide(it.getString("name"), it.getString("instructions")) }
}.getOrNull()

@Composable
internal fun ArrivalMapPanel(trip: Trip, modifier: Modifier = Modifier, fix: VehicleFix? = null) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AndroidView(factory = { ArrivalMapView(it).apply { showTrip(trip, fix) } },
            update = { it.showTrip(trip, fix) },
            onRelease = { it.stopLoading(); it.destroy() },
            modifier = Modifier.weight(1f).fillMaxWidth())
        Text("하차 · 주차 후보 · 건물 입구", fontSize = 19.sp)
        Text(if (fix != null) "파란 점 · 차량 위치 / 장소 핀 · 추정 위치 / 빈자리 정보 없음" else "차량 위치 수신 대기 · 장소 핀은 추정 위치", fontSize = 15.sp, color = ArriveMuted)
    }
}

/** Local map assets plus optional foreground vehicle fix. No bridge or session credentials. */
@SuppressLint("SetJavaScriptEnabled")
private class ArrivalMapView(context: Context) : WebView(context) {
    private val origin = "https://arrive.ikjun.com"
    private var ready = false
    private var payload = ""
    private val venue = JSONObject(context.assets.open("catalog/oryong-demo.json").bufferedReader().use { it.readText() })
    private val guide = runCatching { JSONObject(context.assets.open("guides/${OryongDemo.venueId}.${OryongDemo.catalogVersion}.json").bufferedReader().use { it.readText() }) }.getOrNull()
    init {
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) android.util.Log.d("ArrivalMap", message.message())
                return true
            }
        }
        settings.javaScriptEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.domStorageEnabled = false
        settings.setGeolocationEnabled(false)
        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.userAgentString += " arrive/0.1 (+https://arrive.ikjun.com)"
        settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        setBackgroundColor(android.graphics.Color.rgb(232, 233, 235))
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == "tile.openstreetmap.org" &&
                    uri.path.orEmpty().matches(Regex("/[0-9]+/[0-9]+/[0-9]+\\.png"))) return null
                val path = uri.path.orEmpty().removePrefix("/")
                if (uri.scheme == "https" && uri.host == "arrive.ikjun.com" && path.startsWith("map/") && !path.contains("..")) {
                    return runCatching {
                        val type = when (path.substringAfterLast('.')) { "html" -> "text/html"; "js" -> "text/javascript"; "css" -> "text/css"; else -> "text/plain" }
                        WebResourceResponse(type, "UTF-8", context.assets.open(path))
                    }.getOrElse { blocked() }
                }
                return blocked()
            }
            override fun onPageFinished(view: WebView, url: String) { ready = true; render() }
        }
        loadUrl("$origin/map/driver.html")
    }
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (ready) post { evaluateJavascript("window.arriveMap && window.arriveMap.resize()", null) }
    }
    private fun blocked() = WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
    fun showTrip(trip: Trip, fix: VehicleFix?) {
        val next = JSONObject().put("venue", venue).put("guide", guide ?: JSONObject.NULL).put("state", JSONObject()
            .put("stage", trip.stage.name).put("parkingId", trip.parkingId ?: JSONObject.NULL)
            .put("excludedParkingIds", JSONArray(trip.excludedParkingIds.toList())))
            .put("vehicle", fix?.let { JSONObject().put("latitude", it.coordinate.latitude).put("longitude", it.coordinate.longitude) } ?: JSONObject.NULL).toString()
        if (next == payload) return
        payload = next
        render()
    }
    private fun render() {
        if (ready && payload.isNotEmpty()) evaluateJavascript("window.arriveMap && window.arriveMap.render(JSON.parse(${JSONObject.quote(payload)}))", null)
    }
}
