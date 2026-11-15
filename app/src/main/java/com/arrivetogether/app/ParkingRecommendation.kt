package com.arrivetogether.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.arrivetogether.domain.*

/** Presentation of the catalog order, not a vacancy prediction or a new ranking source. */
@Composable
internal fun ParkingRecommendation(trip: Trip, venue: VisitPlace, modifier: Modifier, compact: Boolean, prominent: Boolean) {
    val candidates = venue.parkingCandidates
    val rejected = candidates.filter { it.id in trip.excludedParkingIds }
    val current = candidates.firstOrNull { it.id == trip.parkingId }
    val otherCount = candidates.count { it.id != current?.id && it.id !in trip.excludedParkingIds }
    val headline = when {
        current == null -> "다른 주차 후보가 없어요"
        rejected.isEmpty() -> "추천 주차장"
        else -> "다음 주차장을 추천했어요"
    }
    BoxWithConstraints(modifier) {
        val dense = compact || maxHeight < 280.dp
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
            verticalArrangement = if (dense) Arrangement.Center else Arrangement.spacedBy(24.dp, Alignment.CenterVertically)) {
            Text(headline, fontSize = if (prominent && !dense) 26.sp else 19.sp, color = ArriveMuted)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                if (current != null) Surface(color = ArriveInk, shape = RoundedCornerShape(16.dp)) {
                    Text("P", Modifier.padding(horizontal = 18.dp, vertical = 12.dp), color = Color.White,
                        fontWeight = FontWeight.Bold, fontSize = if (dense) 28.sp else 40.sp)
                }
                Text(current?.let(venue::localName) ?: "현장 안내를 확인해 주세요",
                    fontSize = if (prominent && !dense) 44.sp else 28.sp,
                    lineHeight = if (prominent && !dense) 56.sp else 36.sp,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            }
            if (!dense) {
                Text(when {
                    current == null -> "이미 제외한 주차장은 다시 추천하지 않아요.\n주차 가능 구역은 현장 안내에 따라 확인해 주세요."
                    rejected.isEmpty() -> "자리가 없으면 ‘자리 없어요’를 눌러 주세요.\n다음 후보는 arrive가 골라드려요."
                    else -> "이미 확인한 곳은 제외했어요.\n이곳으로 이동해 주차할 수 있는지 확인해 주세요."
                }, color = ArriveMuted, fontSize = 22.sp, lineHeight = 32.sp)
                HorizontalDivider(color = ArriveLine)
                // A visit summary scales with the supplied candidate list; no fixed venue course.
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("이번 방문 · ${rejected.size}곳 제외", fontSize = 21.sp, fontWeight = FontWeight.Medium)
                    Text(if (current == null) "현장 안내에 따라 주차 가능 구역을 확인해 주세요"
                        else if (otherCount == 0) "현재 안내할 수 있는 마지막 후보예요"
                        else "다른 주차 후보 ${otherCount}곳이 있어요",
                        fontSize = 19.sp, color = ArriveMuted)
                }
                Text("등록된 순서 기준 · 실시간 빈자리 미확인", fontSize = 17.sp, color = ArriveMuted)
            } else {
                Text(if (current == null) "제외한 ${rejected.size}곳은 다시 추천하지 않아요"
                    else if (rejected.isEmpty()) "자리 없으면 다음 후보 추천 · 빈자리 미확인"
                    else "${rejected.size}곳 제외 · 다음 후보 추천 · 빈자리 미확인",
                    fontSize = 17.sp, color = ArriveMuted)
            }
        }
    }
}

@Composable
internal fun ParkingRouteAction(navigation: PleosNavigation, trip: Trip, simulatedRestricted: Boolean, modifier: Modifier = Modifier) {
    val target = trip.parking ?: return
    val failed = navigation.connection == NaviConnection.FAILED || navigation.attempt.phase in listOf(RoutePhase.FAILED, RoutePhase.TIMED_OUT)
    val confirmed = navigation.attempt.phase == RoutePhase.CONFIRMED
    val permitted = interactionAllowed(navigation.automotive, navigation.realRestricted, simulatedRestricted)
    val label = when {
        !navigation.routeTestingEnabled -> "길안내는 에뮬레이터에서 확인"
        failed -> "길안내 다시 연결"
        navigation.attempt.pending -> "길안내 연결 중"
        confirmed -> "내비 목적지 설정됨"
        navigation.connection != NaviConnection.READY -> "내비 연결 중"
        else -> "이곳으로 길안내"
    }
    DriverButton(label, R.drawable.ic_arrow, modifier.fillMaxWidth(), primary = true,
        enabled = navigation.routeTestingEnabled && permitted &&
            (failed || navigation.connection == NaviConnection.READY && navigation.attempt.phase == RoutePhase.IDLE)) {
        if (failed) navigation.reconnect() else navigation.request(target, simulatedRestricted)
    }
}
