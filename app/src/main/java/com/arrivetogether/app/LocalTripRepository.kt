package com.arrivetogether.app

import android.content.Context
import com.arrivetogether.domain.*
import org.json.JSONArray
import org.json.JSONObject

class LocalTripRepository(context: Context) : TripRepository {
    private val preferences = context.getSharedPreferences("arrival-demo", Context.MODE_PRIVATE)

    override fun load(): Trip? {
        val encoded = preferences.getString("trip", null) ?: return null
        return runCatching {
            val data = JSONObject(encoded)
            require(data.getString("catalogVersion") == OryongDemo.catalogVersion)
            val parkingId = if (data.isNull("parkingId")) null else data.getString("parkingId")
            require(parkingId == null || OryongDemo.parking.any { it.id == parkingId })
            val excluded = data.getJSONArray("excludedParkingIds")
            Trip(
                id = data.getString("id"), stage = TripStage.valueOf(data.getString("stage")),
                parkingId = parkingId,
                excludedParkingIds = (0 until excluded.length()).map { excluded.getString(it) }.toSet(),
                meetingPointId = data.getString("meetingPointId"), revision = data.getInt("revision"),
            ).also { trip ->
                require(trip.meetingPointId == OryongDemo.meeting.id)
                require(trip.revision >= 1)
                require(trip.excludedParkingIds.all { id -> OryongDemo.parking.any { it.id == id } })
                require(trip.parkingId !in trip.excludedParkingIds)
            }
        }.getOrNull()
    }

    override fun save(trip: Trip) {
        val encoded = JSONObject().apply {
            put("catalogVersion", OryongDemo.catalogVersion)
            put("id", trip.id)
            put("stage", trip.stage.name)
            put("parkingId", trip.parkingId ?: JSONObject.NULL)
            put("excludedParkingIds", JSONArray(trip.excludedParkingIds.toList()))
            put("meetingPointId", trip.meetingPointId)
            put("revision", trip.revision)
        }
        preferences.edit().putString("trip", encoded.toString()).apply()
    }
}

