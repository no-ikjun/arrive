package com.arrivetogether.domain

import kotlin.math.*

enum class RoutePhase { IDLE, REQUESTING, CHECKING_DESTINATION, CONFIRMED, FAILED, TIMED_OUT }

/** SDK callbacks carry no request ID. The adapter additionally isolates connection generations. */
data class RouteAttempt(
    val target: Place? = null,
    val phase: RoutePhase = RoutePhase.IDLE,
    val message: String = "경로 요청 전",
) {
    val pending: Boolean get() = phase == RoutePhase.REQUESTING || phase == RoutePhase.CHECKING_DESTINATION
    fun completed(): RouteAttempt = if (phase == RoutePhase.REQUESTING)
        copy(phase = RoutePhase.CHECKING_DESTINATION, message = "탐색 완료 콜백 수신 · 목적지 대조 중") else this
    fun destination(coordinate: Coordinate): RouteAttempt {
        if (phase != RoutePhase.CHECKING_DESTINATION) return this
        val expected = target?.coordinate ?: return failed("요청 좌표가 없어요.")
        return if (distanceMeters(expected, coordinate) <= 3.0)
            copy(phase = RoutePhase.CONFIRMED, message = "탐색 완료 콜백 수신 · 요청한 목적지 좌표 일치")
        else failed("내비게이션 목적지가 요청한 위치와 달라요. 경로를 직접 확인해 주세요.")
    }
    // Connect 2.1.0 can emit cancellation for the previous route during replacement.
    // There is no request ID: keep the new request pending until completion + coordinate match or timeout.
    fun cancelled(): RouteAttempt = when (phase) {
        RoutePhase.REQUESTING -> copy(message = "경로 변경 신호 수신 · 새 목적지 확인 중")
        RoutePhase.CHECKING_DESTINATION, RoutePhase.CONFIRMED -> failed("내비게이션 경로가 취소됐어요.")
        else -> this
    }
    fun timeout(): RouteAttempt = if (pending) copy(phase = RoutePhase.TIMED_OUT,
        message = "응답 시간이 초과됐어요. 길안내 성공 여부를 확인할 수 없어요.") else this
    fun failed(reason: String): RouteAttempt = copy(phase = RoutePhase.FAILED, message = reason)
    companion object {
        fun start(place: Place): RouteAttempt {
            requireNotNull(place.coordinate)
            return RouteAttempt(place, RoutePhase.REQUESTING, "경로 요청 전송 · 결과 대기 중")
        }
    }
}

fun navigationTarget(trip: Trip): Place? = when (trip.stage) {
    TripStage.TO_DROPOFF -> OryongDemo.dropoff
    TripStage.TO_PARKING -> trip.parking
    else -> null // Walking/reunion must never request a driving route.
}

fun interactionAllowed(automotive: Boolean, realRestricted: Boolean?, simulatedRestricted: Boolean): Boolean =
    !simulatedRestricted && (!automotive || realRestricted == false)

fun distanceMeters(a: Coordinate, b: Coordinate): Double {
    val dLat = Math.toRadians(b.latitude - a.latitude)
    val dLon = Math.toRadians(b.longitude - a.longitude)
    val h = sin(dLat / 2).pow(2) + cos(Math.toRadians(a.latitude)) * cos(Math.toRadians(b.latitude)) * sin(dLon / 2).pow(2)
    return 6371000 * 2 * asin(sqrt(h.coerceIn(0.0, 1.0)))
}
