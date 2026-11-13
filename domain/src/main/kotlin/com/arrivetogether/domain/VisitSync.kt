package com.arrivetogether.domain

/** Persist this key before sending; retries must keep both key and expectedRevision. */
data class PendingChange(val key: String, val event: String, val expectedRevision: Int)

data class VisitQueue(val trip: Trip, val pending: List<PendingChange> = emptyList()) {
    fun enqueue(action: TripAction, key: String, allowed: Boolean): VisitQueue {
        val result = TripReducer.apply(trip, action, allowed)
        require(result is TripResult.Updated) { (result as TripResult.Rejected).message }
        return copy(trip = result.trip, pending = pending + PendingChange(key, action.wireName(), trip.revision))
    }
    fun acknowledge(key: String, remote: Trip): VisitQueue {
        val head = pending.firstOrNull() ?: error("No pending event")
        require(head.key == key && remote.revision == head.expectedRevision + 1)
        val rest = pending.drop(1)
        return VisitQueue(if (rest.isEmpty()) remote else trip.copy(id = remote.id), rest)
    }
}

fun TripAction.wireName(): String = when (this) {
    TripAction.Start -> "START"
    TripAction.ConfirmDropoff -> "CONFIRM_DROPOFF"
    TripAction.RejectParking -> "REJECT_PARKING"
    TripAction.ConfirmParked -> "CONFIRM_PARKED"
    TripAction.ConfirmReunion -> "CONFIRM_REUNION"
    TripAction.Cancel -> "CANCEL"
}

/** Reconstruct the existing local visit using the same fixed catalog and reducer. */
fun sharingHistory(trip: Trip): List<TripAction> {
    require(!trip.terminal) { "종료된 방문은 새 방문에서 공유해 주세요." }
    val actions = mutableListOf<TripAction>()
    if (trip.stage != TripStage.PLANNED) actions += TripAction.Start
    if (trip.stage in setOf(TripStage.TO_PARKING, TripStage.WALKING_TO_MEETING)) {
        actions += TripAction.ConfirmDropoff
        repeat(trip.excludedParkingIds.size) { actions += TripAction.RejectParking }
    }
    if (trip.stage == TripStage.WALKING_TO_MEETING) actions += TripAction.ConfirmParked
    var replay = Trip(trip.id)
    actions.forEach { replay = (TripReducer.apply(replay, it, true) as TripResult.Updated).trip }
    require(replay.stage == trip.stage && replay.parkingId == trip.parkingId &&
        replay.excludedParkingIds == trip.excludedParkingIds && replay.meetingPointId == trip.meetingPointId)
    return actions
}
