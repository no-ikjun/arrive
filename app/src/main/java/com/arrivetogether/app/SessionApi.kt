package com.arrivetogether.app

import com.arrivetogether.domain.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.time.Instant

internal data class RemoteVisit(val trip: Trip, val updatedAt: String, val expiresAt: String)
internal data class PhoneCredential(val token: String, val expiresAt: String)
internal data class SessionCredentials(val remote: RemoteVisit, val owner: String, val share: String)
internal class ApiFailure(val status: Int, val code: String, val retrySeconds: Long = 5) : Exception("Session API $status $code")

/** Blocking calls are only invoked on Dispatchers.IO. Redirects never receive bearer tokens. */
internal class SessionApi(private val base: String) {
    fun create(key: String): SessionCredentials {
        val body = JSONObject().put("venueId", OryongDemo.venueId).put("catalogVersion", OryongDemo.catalogVersion)
        val json = request("POST", "/v1/sessions", body = body, key = key)!!
        val owner = json.getString("ownerToken"); val share = json.getString("shareToken")
        require(owner.matches(Regex("[A-Za-z0-9_-]{43,256}")) && share.matches(Regex("[A-Za-z0-9_-]{43,256}")) && owner != share)
        return SessionCredentials(parseRemote(json.getJSONObject("session")), owner, share)
    }
    fun get(id: String, owner: String) = parseRemote(request("GET", "/v1/sessions/${safeId(id)}", owner)!!)
    fun event(id: String, owner: String, change: PendingChange): RemoteVisit = parseRemote(request("POST",
        "/v1/sessions/${safeId(id)}/events", owner,
        JSONObject().put("expectedRevision", change.expectedRevision).put("event", change.event), change.key)!!)
    fun handoff(id: String, owner: String, share: String?, key: String): PhoneCredential {
        val j = request("POST", "/v1/sessions/${safeId(id)}/handoffs", owner, JSONObject(), key)!!
        require(j.getString("sessionId") == id)
        val token = j.getString("handoffToken")
        require(token.matches(Regex("[A-Za-z0-9_-]{43,256}")) && token != owner && token != share)
        val expires = j.getString("expiresAt")
        require(Instant.parse(expires).isAfter(Instant.now()))
        return PhoneCredential(token, expires)
    }
    fun delete(id: String, owner: String) { request("DELETE", "/v1/sessions/${safeId(id)}", owner) }
    private fun safeId(id: String): String = java.util.UUID.fromString(id).toString()
    private fun request(method: String, path: String, token: String? = null, body: JSONObject? = null, key: String? = null): JSONObject? {
        val url = URI(base.trimEnd('/') + path)
        require(url.scheme == "https" || (BuildConfig.DEBUG && url.scheme == "http"))
        val c = url.toURL().openConnection() as HttpURLConnection
        try {
            c.requestMethod = method; c.instanceFollowRedirects = false
            c.connectTimeout = 8_000; c.readTimeout = 8_000
            c.setRequestProperty("Accept", "application/json")
            token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            key?.let { c.setRequestProperty("Idempotency-Key", it) }
            body?.let {
                c.doOutput = true; c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { out -> out.write(it.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = c.responseCode
            if (status == 204) return null
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            val bytes = stream?.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(out.size() + count <= 262_144)
                    out.write(buffer, 0, count)
                }
                out.toByteArray()
            } ?: byteArrayOf()
            require(bytes.size <= 262_144)
            val json = runCatching { JSONObject(bytes.toString(Charsets.UTF_8)) }.getOrNull()
            if (status !in 200..299) throw ApiFailure(status, json?.optString("code") ?: "HTTP_ERROR",
                c.getHeaderField("Retry-After")?.toLongOrNull()?.coerceIn(5, 300) ?: 5)
            return requireNotNull(json)
        } finally { c.disconnect() }
    }
}

internal fun parseRemote(j: JSONObject): RemoteVisit {
    require(j.getString("venueId") == OryongDemo.venueId && j.getString("catalogVersion") == OryongDemo.catalogVersion)
    // This APK carries an image-estimated catalog; server data may not upgrade it to verified.
    require(j.getString("dataMode") == "DEMO")
    val excluded = j.getJSONArray("excludedParkingIds")
    val trip = Trip(j.getString("id"), TripStage.valueOf(j.getString("stage")),
        if (j.isNull("parkingId")) null else j.getString("parkingId"),
        (0 until excluded.length()).map { excluded.getString(it) }.toSet(), j.getString("meetingPointId"), j.getInt("revision"))
    java.util.UUID.fromString(trip.id)
    require(trip.revision > 0 && trip.meetingPointId == OryongDemo.meeting.id)
    require(trip.parkingId == null || OryongDemo.parking.any { it.id == trip.parkingId })
    require(trip.excludedParkingIds.all { id -> OryongDemo.parking.any { it.id == id } } && trip.parkingId !in trip.excludedParkingIds)
    val updated = j.getString("updatedAt"); val expires = j.getString("expiresAt")
    Instant.parse(updated); Instant.parse(expires)
    return RemoteVisit(trip, updated, expires)
}
