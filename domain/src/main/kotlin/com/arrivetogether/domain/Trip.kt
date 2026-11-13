package com.arrivetogether.domain

enum class TripStage { PLANNED, TO_DROPOFF, TO_PARKING, WALKING_TO_MEETING, REUNITED, CANCELLED }

/** WGS84 coordinates; presence alone does not imply a verified entrance. */
data class Coordinate(val latitude: Double, val longitude: Double) {
    init {
        require(latitude.isFinite() && latitude in -90.0..90.0)
        require(longitude.isFinite() && longitude in -180.0..180.0)
    }
}

data class Place(
    val id: String,
    val name: String,
    val description: String,
    val coordinate: Coordinate? = null,
)
// OryongDemo is generated from contracts/oryong-demo.json by Gradle.

data class Trip(
    val id: String,
    val stage: TripStage = TripStage.PLANNED,
    val parkingId: String? = OryongDemo.parking.first().id,
    val excludedParkingIds: Set<String> = emptySet(),
    val meetingPointId: String = OryongDemo.meeting.id,
    val revision: Int = 1,
) {
    val parking: Place? get() = OryongDemo.parking.find { it.id == parkingId }
    val terminal: Boolean get() = stage == TripStage.REUNITED || stage == TripStage.CANCELLED
}

sealed interface TripAction {
    data object Start : TripAction
    data object ConfirmDropoff : TripAction
    data object RejectParking : TripAction
    data object ConfirmParked : TripAction
    data object ConfirmReunion : TripAction
    data object Cancel : TripAction
}

sealed interface TripResult {
    data class Updated(val trip: Trip) : TripResult
    data class Rejected(val message: String) : TripResult
}

/** Independent of car signals: a door/brake event cannot assert a person's arrival. */
object TripReducer {
    fun apply(trip: Trip, action: TripAction, interactionAllowed: Boolean): TripResult {
        if (!interactionAllowed) return TripResult.Rejected("조작 가능한 정차 상태에서 진행해 주세요.")
        if (trip.terminal) return TripResult.Rejected("이미 종료된 방문이에요.")
        val changed = when (action) {
            TripAction.Start -> if (trip.stage == TripStage.PLANNED) trip.copy(stage = TripStage.TO_DROPOFF) else null
            TripAction.ConfirmDropoff -> if (trip.stage == TripStage.TO_DROPOFF) trip.copy(stage = TripStage.TO_PARKING) else null
            TripAction.RejectParking -> if (trip.stage == TripStage.TO_PARKING && trip.parkingId != null) {
                val excluded = trip.excludedParkingIds + trip.parkingId
                trip.copy(
                    excludedParkingIds = excluded,
                    parkingId = OryongDemo.parking.firstOrNull { it.id !in excluded }?.id,
                )
            } else null
            TripAction.ConfirmParked -> if (trip.stage == TripStage.TO_PARKING && trip.parkingId != null) {
                trip.copy(stage = TripStage.WALKING_TO_MEETING)
            } else null
            TripAction.ConfirmReunion -> if (trip.stage == TripStage.WALKING_TO_MEETING) trip.copy(stage = TripStage.REUNITED) else null
            TripAction.Cancel -> trip.copy(stage = TripStage.CANCELLED)
        }
        return changed?.let { TripResult.Updated(it.copy(revision = trip.revision + 1)) }
            ?: TripResult.Rejected("현재 단계에서는 진행할 수 없어요.")
    }
}

/** Legacy local visit store; cloud migration reads it once when no shared snapshot exists. */
interface TripRepository {
    fun load(): Trip?
    fun save(trip: Trip)
}

