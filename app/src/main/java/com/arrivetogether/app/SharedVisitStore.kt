package com.arrivetogether.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.arrivetogether.domain.*
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class SharedVisit(
    val queue: VisitQueue,
    val apiBase: String? = null,
    val createKey: String? = null,
    val owner: String? = null,
    val share: String? = null,
    val remote: RemoteVisit? = null,
    val deleting: Boolean = false,
    val unavailable: Boolean = false,
    val notice: String? = null,
    val handoffKey: String? = null,
    val handoffToken: String? = null,
    val handoffExpiresAt: String? = null,
) { val shared get() = createKey != null }

/** One encrypted, atomic snapshot contains credentials AND outbox, including uncertain requests. */
internal class SharedVisitStore(context: Context) {
    private val prefs = context.getSharedPreferences("arrival-sync-v1", Context.MODE_PRIVATE)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("arrival-session-v1", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("arrival-session-v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun load(): SharedVisit? {
        val saved = prefs.getString("snapshot", null) ?: return null
        val parts = saved.split(':'); require(parts.size == 2)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
        val json = JSONObject(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
        require(json.getString("catalogVersion") == OryongDemo.catalogVersion)
        val t = json.getJSONObject("trip")
        val pending = json.getJSONArray("pending")
        val queue = VisitQueue(decodeTrip(t), (0 until pending.length()).map { i -> pending.getJSONObject(i).let {
            PendingChange(it.getString("key"), it.getString("event"), it.getInt("expectedRevision"))
        } })
        val r = json.optJSONObject("remote")?.let { RemoteVisit(decodeTrip(it.getJSONObject("trip")), it.getString("updatedAt"), it.getString("expiresAt")) }
        fun nullable(name: String) = if (!json.has(name) || json.isNull(name)) null else json.getString(name)
        return SharedVisit(queue, nullable("apiBase"), nullable("createKey"), nullable("owner"), nullable("share"), r,
            json.optBoolean("deleting"), json.optBoolean("unavailable"), nullable("notice"),
            nullable("handoffKey"), nullable("handoffToken"), nullable("handoffExpiresAt"))
    }
    fun save(s: SharedVisit) {
        val j = JSONObject().put("catalogVersion", OryongDemo.catalogVersion).put("trip", encodeTrip(s.queue.trip))
            .put("pending", JSONArray(s.queue.pending.map { JSONObject().put("key", it.key).put("event", it.event).put("expectedRevision", it.expectedRevision) }))
            .put("deleting", s.deleting).put("unavailable", s.unavailable)
        mapOf("apiBase" to s.apiBase, "createKey" to s.createKey, "owner" to s.owner, "share" to s.share, "notice" to s.notice, "handoffKey" to s.handoffKey,
            "handoffToken" to s.handoffToken, "handoffExpiresAt" to s.handoffExpiresAt)
            .forEach { (k,v) -> j.put(k, v ?: JSONObject.NULL) }
        s.remote?.let { j.put("remote", JSONObject().put("trip", encodeTrip(it.trip)).put("updatedAt", it.updatedAt).put("expiresAt", it.expiresAt)) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(j.toString().toByteArray(Charsets.UTF_8))
        check(prefs.edit().putString("snapshot", Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit())
    }
    private fun encodeTrip(t: Trip) = JSONObject().put("id", t.id).put("stage", t.stage.name)
        .put("parkingId", t.parkingId ?: JSONObject.NULL).put("excluded", JSONArray(t.excludedParkingIds.toList()))
        .put("meetingPointId", t.meetingPointId).put("revision", t.revision)
    private fun decodeTrip(j: JSONObject): Trip {
        val a = j.getJSONArray("excluded")
        return Trip(j.getString("id"), TripStage.valueOf(j.getString("stage")), if (j.isNull("parkingId")) null else j.getString("parkingId"),
            (0 until a.length()).map { a.getString(it) }.toSet(), j.getString("meetingPointId"), j.getInt("revision"))
    }
}
