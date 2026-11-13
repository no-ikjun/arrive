package com.arrivetogether.domain

/** Local-only observations. Times are monotonic milliseconds, never persisted or sent to the server. */
data class VehicleFix(val coordinate: Coordinate, val observedAt: Long)
data class ParkObservation(val inPark: Boolean, val observedAt: Long)
enum class ArrivalCue { NONE, NEARBY, CONFIRM_DROPOFF, CONFIRM_PARKED }

/** Suggests a confirmation only. Never changes a Trip or asserts a passenger's actions. */
class ArrivalAssist {
    private var targetKey: String? = null
    private var nearby = false
    private var stoppedSince: Long? = null
    private var lastCheck: Long? = null
    fun reset() { targetKey = null; nearby = false; stoppedSince = null; lastCheck = null }
    fun evaluate(trip: Trip, fix: VehicleFix?, gear: ParkObservation?, now: Long): ArrivalCue {
        val target = navigationTarget(trip)
        val key = "${trip.id}:${trip.stage}:${target?.id}"
        if (targetKey != key) { reset(); targetKey = key }
        val position = target?.coordinate
        if (position == null || fix == null || now - fix.observedAt !in 0..10_000) {
            nearby = false; stoppedSince = null; lastCheck = null; return ArrivalCue.NONE
        }
        val distance = distanceMeters(position, fix.coordinate)
        nearby = distance <= if (nearby) 65.0 else 45.0
        if (!nearby) { stoppedSince = null; lastCheck = null; return ArrivalCue.NONE }
        val continuous = lastCheck?.let { now - it in 0..2_500 } ?: false
        lastCheck = now
        if (gear == null || !gear.inPark || now - gear.observedAt !in 0..2_500) {
            stoppedSince = null; return ArrivalCue.NEARBY
        }
        if (!continuous || stoppedSince == null) stoppedSince = now
        if (now - stoppedSince!! < 6_000) return ArrivalCue.NEARBY
        return if (trip.stage == TripStage.TO_DROPOFF) ArrivalCue.CONFIRM_DROPOFF else ArrivalCue.CONFIRM_PARKED
    }
}

/** A short-lived, one-shot intent tied to a successful user transition, not server polling. */
class RouteHandoff {
    private var key: String? = null
    private var pending: Place? = null
    private var expires = 0L
    fun cancel() { pending = null }
    fun update(trip: Trip, userInitiated: Boolean, now: Long): Boolean {
        val next = "${trip.id}:${trip.stage}:${trip.parkingId}"
        if (next == key) return false
        key = next; pending = if (userInitiated) navigationTarget(trip) else null; expires = now + 10_000
        return true
    }
    fun take(now: Long, ready: Boolean, allowed: Boolean): Place? {
        if (now >= expires || !allowed) { cancel(); return null }
        if (!ready) return null
        return pending.also { pending = null }
    }
}
