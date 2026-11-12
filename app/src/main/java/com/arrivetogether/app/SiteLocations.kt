package com.arrivetogether.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.arrivetogether.domain.*
import java.util.Locale
import kotlin.math.cos

private val MapMint = Color(0xFFA9F3D2)
private val MapMuted = Color(0xFFB5C4D3)
private val MapAmber = Color(0xFFFFD392)

internal fun coordinateLabel(place: Place): String = place.coordinate?.let {
    String.format(Locale.US, "%.5f, %.5f", it.latitude, it.longitude)
} ?: "위치 미등록"

@Composable
internal fun SiteLocationsDialog(trip: Trip, onDismiss: () -> Unit) {
    val places = listOf(OryongDemo.dropoff, OryongDemo.meeting) + OryongDemo.parking
    val labels = listOf("하차", "만남", "P1", "P2", "P3", "P4")
    val selectedId = when (trip.stage) {
        TripStage.PLANNED, TripStage.TO_DROPOFF -> OryongDemo.dropoff.id
        TripStage.TO_PARKING -> trip.parkingId
        TripStage.WALKING_TO_MEETING, TripStage.REUNITED -> OryongDemo.meeting.id
        TripStage.CANCELLED -> null
    }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.padding(16.dp).widthIn(max = 760.dp).fillMaxWidth().fillMaxHeight(.94f),
            shape = RoundedCornerShape(24.dp), color = Color(0xFF1A2939)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("장소 위치", fontSize = 23.sp, fontWeight = FontWeight.Bold)
                    TextButton(onClick = onDismiss) { Text("닫기") }
                }
                Text("위성사진에서 추정한 위치 · 실제 길안내 없음", color = MapAmber, fontSize = 14.sp)
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SitePointPlot(places, labels, selectedId, trip.excludedParkingIds)
                    Text("북쪽 ↑ · 위치 배치도예요. 도로와 이동 경로는 표시하지 않아요.", color = MapMuted, fontSize = 13.sp)
                    places.forEachIndexed { index, place ->
                        val state = when {
                            place.id in trip.excludedParkingIds -> "이번 방문에서 제외"
                            place.id == selectedId -> "현재 확인할 곳"
                            place.id == OryongDemo.meeting.id -> "주차 장소가 바뀌어도 유지"
                            else -> null
                        }
                        Column(Modifier.fillMaxWidth().background(Color(0xFF101B28), RoundedCornerShape(12.dp)).padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("${labels[index]} · ${place.name}", fontWeight = FontWeight.SemiBold)
                            state?.let { Text(it, color = if (place.id == selectedId) MapMint else MapMuted, fontSize = 13.sp) }
                            Text(coordinateLabel(place), color = MapMint, fontSize = 14.sp)
                            Text(place.description, color = MapMuted, fontSize = 13.sp)
                        }
                    }
                    Text("주차 표시는 구역 대표점이에요. 차량 진입구와 이용 조건은 현장 확인이 필요해요.", color = MapAmber, fontSize = 13.sp)
                }
            }
        }
    }
}

/** Equal metres on both axes. No straight connecting lines that could imply a route. */
@Composable
private fun SitePointPlot(places: List<Place>, labels: List<String>, selectedId: String?, excluded: Set<String>) {
    val coordinates = places.mapNotNull { it.coordinate }
    if (coordinates.isEmpty()) return
    val centerLat = coordinates.map { it.latitude }.average()
    val centerLon = coordinates.map { it.longitude }.average()
    val longitudeScale = cos(Math.toRadians(centerLat))
    val points = places.map { place -> place.coordinate?.let {
        Offset(((it.longitude - centerLon) * longitudeScale * 111320).toFloat(),
            ((centerLat - it.latitude) * 111320).toFloat())
    } }
    val valid = points.filterNotNull()
    val left = valid.minOf { it.x }; val right = valid.maxOf { it.x }
    val top = valid.minOf { it.y }; val bottom = valid.maxOf { it.y }
    Canvas(Modifier.fillMaxWidth().height(260.dp).background(Color(0xFF101B28), RoundedCornerShape(16.dp))
        .semantics { contentDescription = "하차 지점, 고정 만남 장소, 주차장 네 곳의 좌표 기반 배치도. 북쪽이 위이며 경로 안내가 아닙니다." }) {
        val padding = 40.dp.toPx()
        val scale = minOf((size.width - padding * 2) / (right - left).coerceAtLeast(1f),
            (size.height - padding * 2) / (bottom - top).coerceAtLeast(1f)).coerceAtLeast(.01f)
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            textSize = 12.sp.toPx(); textAlign = android.graphics.Paint.Align.CENTER; isFakeBoldText = true
        }
        points.forEachIndexed { index, point ->
            if (point == null) return@forEachIndexed
            val place = places[index]
            val screen = Offset(size.width / 2 + (point.x - (left + right) / 2) * scale,
                size.height / 2 + (point.y - (top + bottom) / 2) * scale)
            val color = when {
                place.id in excluded -> Color(0xFF647487)
                place.id == OryongDemo.meeting.id -> MapMint
                place.id == OryongDemo.dropoff.id -> MapAmber
                else -> Color(0xFF9CBFFF)
            }
            if (place.id == selectedId) drawCircle(color.copy(alpha = .25f), 16.dp.toPx(), screen)
            drawCircle(color, 7.dp.toPx(), screen)
            paint.color = android.graphics.Color.WHITE
            // The meeting and dropoff are close: put their labels on opposite sides.
            val labelY = if (place.id == OryongDemo.meeting.id) screen.y + 24.dp.toPx() else screen.y - 14.dp.toPx()
            drawContext.canvas.nativeCanvas.drawText(labels[index], screen.x, labelY, paint)
        }
    }
}
