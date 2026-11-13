package com.arrivetogether.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.arrivetogether.domain.*

@Composable
internal fun NavigationAction(navigation: PleosNavigation, trip: Trip, simulatedRestricted: Boolean, showStatus: Boolean = true) {
    // After parking, the entrance is a pedestrian destination, not a vehicle route to the legacy meeting point.
    if (trip.stage == TripStage.WALKING_TO_MEETING || trip.terminal) return
    val target = navigationTarget(trip) ?: return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        DriverButton("내비로 보기", R.drawable.ic_arrow,
            enabled = navigation.routeTestingEnabled && navigation.connection == NaviConnection.READY &&
                navigation.attempt.phase == RoutePhase.IDLE && interactionAllowed(navigation.automotive, navigation.realRestricted, simulatedRestricted),
            onClick = { navigation.request(target, simulatedRestricted) })
        if (showStatus) Text(when {
            navigation.attempt.pending -> "경로 확인 중"
            navigation.attempt.phase == RoutePhase.CONFIRMED -> "내비 목적지 설정됨"
            navigation.attempt.phase in listOf(RoutePhase.FAILED, RoutePhase.TIMED_OUT) -> "경로 확인 실패 · 더 보기에서 재연결"
            navigation.connection == NaviConnection.FAILED -> "내비 연결 실패 · 더 보기에서 재연결"
            !navigation.routeTestingEnabled -> "에뮬레이터에서만 사용 가능"
            navigation.connection != NaviConnection.READY -> "내비 연결 중"
            else -> "시연용 · 추정 위치"
        }, color = ArriveMuted, fontSize = 16.sp)
    }
}

/** Diagnostics are available only in the parked detail dialog. */
@Composable
internal fun NavigationPanel(navigation: PleosNavigation, trip: Trip, simulatedRestricted: Boolean) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HorizontalDivider(color = ArriveLine)
        Text("차량 연결", fontSize = 20.sp)
        Text(navigation.connectionMessage, color = ArriveMuted)
        if (navigation.automotive) Text(when (navigation.realRestricted) {
            null -> "차량 상태 확인 중"; true -> "주행 제한 적용 중"; false -> "차량 조작 가능"
        }, color = ArriveMuted)
        navigationTarget(trip)?.let { Text("요청 위치 · ${it.name}", color = ArriveMuted) }
        if (navigation.attempt.target != null) Text(navigation.attempt.message, color = ArriveMuted)
        if (navigation.connection == NaviConnection.FAILED ||
            (navigation.connection == NaviConnection.READY && !navigation.attempt.pending && navigation.attempt.phase != RoutePhase.IDLE)) {
            DriverButton("내비 재연결", R.drawable.ic_retry, Modifier.fillMaxWidth(),
                enabled = interactionAllowed(navigation.automotive, navigation.realRestricted, simulatedRestricted)) { navigation.reconnect() }
        }
    }
}

@Composable
internal fun NavigationProgress(navigation: PleosNavigation) {
    Text(when {
        navigation.attempt.pending -> "길안내 연결 중"
        navigation.attempt.phase == RoutePhase.CONFIRMED -> "내비 목적지 설정됨"
        navigation.attempt.phase in listOf(RoutePhase.FAILED, RoutePhase.TIMED_OUT) || navigation.connection == NaviConnection.FAILED -> "길안내 연결 확인 · 더 보기"
        !navigation.routeTestingEnabled -> "추정 지점 · 현장 안내를 확인해 주세요"
        else -> "확인하면 다음 길안내가 이어져요"
    }, color = ArriveMuted, fontSize = 16.sp)
}
