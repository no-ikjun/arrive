package com.arrivetogether.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.arrivetogether.domain.*
import java.util.UUID

private val Ink = Color(0xFF101B28)
private val Panel = Color(0xFF1A2939)
private val Mint = Color(0xFFA9F3D2)
private val Muted = Color(0xFFB5C4D3)
private val Amber = Color(0xFFFFD392)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = LocalTripRepository(applicationContext)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(
                primary = Mint, onPrimary = Ink, background = Ink, surface = Panel,
                onSurface = Color.White, onBackground = Color.White,
            )) {
                ArrivalApp(repository)
            }
        }
    }
}

@Composable
private fun ArrivalApp(repository: TripRepository) {
    var trip by remember { mutableStateOf(repository.load() ?: Trip(UUID.randomUUID().toString())) }
    // A test control, deliberately not a claim about real vehicle state.
    var restricted by rememberSaveable { mutableStateOf(false) }
    var locationsOpen by rememberSaveable { mutableStateOf(false) }
    var cardOpen by rememberSaveable { mutableStateOf(false) }
    var resetOpen by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    fun dispatch(action: TripAction) {
        when (val result = TripReducer.apply(trip, action, !restricted)) {
            is TripResult.Updated -> {
                trip = result.trip
                repository.save(trip)
                message = null
            }
            is TripResult.Rejected -> message = result.message
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = Ink) {
        Column(Modifier.windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 24.dp, vertical = 16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("함께 도착", fontSize = 27.sp, fontWeight = FontWeight.Bold)
                    Text("GIST 오룡관 · 동승자 먼저 내리기", color = Muted, fontSize = 15.sp)
                }
                TextButton(onClick = { resetOpen = true }, enabled = !restricted) { Text("처음부터") }
            }
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth().background(Color(0xFF30302B), RoundedCornerShape(12.dp)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("시연 모드 · 실제 길안내 없음", color = Amber, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text("이미지 기반 추정 위치 / 서버 연결 없음", color = Muted, fontSize = 13.sp)
                }
                Text(if (restricted) "주행 제한" else "정차 시연", fontSize = 14.sp)
                Switch(checked = restricted, onCheckedChange = { restricted = it; if (it) { cardOpen = false; locationsOpen = false } })
            }
            Spacer(Modifier.height(16.dp))
            if (restricted) {
                RestrictedView(trip)
            } else {
                BoxWithConstraints(Modifier.weight(1f)) {
                    if (maxWidth >= 840.dp) {
                        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                            Column(Modifier.weight(1.2f).verticalScroll(rememberScrollState())) {
                                CurrentStep(trip, ::dispatch)
                                message?.let { Text(it, color = Amber, modifier = Modifier.padding(top = 8.dp)) }
                            }
                            Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                                PlanSummary(trip) { locationsOpen = true }
                                Spacer(Modifier.height(16.dp))
                                CompanionPanel(trip) { cardOpen = true }
                            }
                        }
                    } else {
                        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            CurrentStep(trip, ::dispatch)
                            message?.let { Text(it, color = Amber) }
                            PlanSummary(trip) { locationsOpen = true }
                            CompanionPanel(trip) { cardOpen = true }
                        }
                    }
                }
            }
        }
    }
    if (locationsOpen && !restricted) {
        SiteLocationsDialog(trip) { locationsOpen = false }
    }
    if (cardOpen && !restricted) {
        AlertDialog(
            onDismissRequest = { cardOpen = false },
            title = { Text("동승자 카드 미리보기") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("같은 장소에서 다시 만나요", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text(OryongDemo.meeting.name, color = Mint, fontSize = 20.sp)
                    Text("추정 위치 · ${coordinateLabel(OryongDemo.meeting)}", color = Muted)
                    Text(companionMessage(trip))
                    Text("현재 주차 후보: ${trip.parking?.name ?: "없음"}")
                    Text("이 화면은 차량 안의 미리보기예요. 실제 공유 링크와 기기 간 갱신은 백엔드 연결 후 제공해요.", color = Amber)
                    Text("만남 장소의 사진과 보행 경로는 현장 확인 후 추가해요.", color = Muted)
                }
            },
            confirmButton = { TextButton(onClick = { cardOpen = false }) { Text("닫기") } },
        )
    }
    if (resetOpen && !restricted) {
        AlertDialog(
            onDismissRequest = { resetOpen = false }, title = { Text("새 시연을 시작할까요?") },
            text = { Text("현재 방문 단계와 제외한 주차 후보를 초기화해요.") },
            confirmButton = { TextButton(onClick = {
                trip = Trip(UUID.randomUUID().toString()); repository.save(trip)
                message = null; resetOpen = false
            }) { Text("새로 시작") } },
            dismissButton = { TextButton(onClick = { resetOpen = false }) { Text("계속하기") } },
        )
    }
}

@Composable
private fun PanelBox(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Panel, RoundedCornerShape(24.dp)).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp), content = content,
    )
}

@Composable
private fun CurrentStep(trip: Trip, dispatch: (TripAction) -> Unit) {
    PanelBox {
        Text(stageLabel(trip.stage), color = Mint, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        val title = when (trip.stage) {
            TripStage.PLANNED -> "먼저 편하게 내리고,\n같은 곳에서 다시 만나요"
            TripStage.TO_DROPOFF -> "동승자가 내릴 곳으로"
            TripStage.TO_PARKING -> if (trip.parking == null) "안내할 주차 후보가 없어요" else "이제 주차하러 갈게요"
            TripStage.WALKING_TO_MEETING -> "주차했어요.\n약속한 곳에서 만나요"
            TripStage.REUNITED -> "함께 도착했어요"
            TripStage.CANCELLED -> "이번 방문을 종료했어요"
        }
        Text(title, fontSize = 30.sp, lineHeight = 39.sp, fontWeight = FontWeight.Bold)
        Text(when (trip.stage) {
            TripStage.PLANNED -> "동승자가 내릴 곳, 운전자가 주차할 곳, 다시 만날 곳을 출발 전에 확인해요."
            TripStage.TO_DROPOFF -> "${OryongDemo.dropoff.name}\n${OryongDemo.dropoff.description}"
            TripStage.TO_PARKING -> if (trip.parking == null) "이번 방문에서 모든 후보를 제외했어요. 현장 안내를 확인해 주세요. 동승자와 만날 장소는 유지돼요." else "${trip.parking!!.name}\n현재 빈자리 정보는 없어요. 이용하지 못하면 다음 후보를 확인해요."
            TripStage.WALKING_TO_MEETING -> "${trip.parking?.name}\n→ ${OryongDemo.meeting.name}\n실제 보행 경로와 출입구 사진은 확인 예정이에요."
            TripStage.REUNITED -> "운전자와 동승자가 다시 만났음을 확인했어요."
            TripStage.CANCELLED -> "새 시연은 상단의 ‘처음부터’에서 시작할 수 있어요."
        }, color = Muted, fontSize = 17.sp, lineHeight = 27.sp)
        when (trip.stage) {
            TripStage.PLANNED -> PrimaryAction("방문 흐름 시연하기") { dispatch(TripAction.Start) }
            TripStage.TO_DROPOFF -> PrimaryAction("동승자 하차 확인") { dispatch(TripAction.ConfirmDropoff) }
            TripStage.TO_PARKING -> {
                if (trip.parking != null) {
                    PrimaryAction("이곳에 주차했어요") { dispatch(TripAction.ConfirmParked) }
                    OutlinedButton(
                        onClick = { dispatch(TripAction.RejectParking) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp), shape = RoundedCornerShape(16.dp),
                    ) { Text("이곳은 이용할 수 없어요", fontSize = 18.sp) }
                }
            }
            TripStage.WALKING_TO_MEETING -> PrimaryAction("다시 만났어요") { dispatch(TripAction.ConfirmReunion) }
            else -> Unit
        }
        if (!trip.terminal) {
            TextButton(onClick = { dispatch(TripAction.Cancel) }) { Text("이번 방문 종료", color = Muted) }
        }
    }
}

@Composable
private fun PrimaryAction(label: String, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 68.dp), shape = RoundedCornerShape(16.dp)) {
        Text(label, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun PlanSummary(trip: Trip, onLocations: () -> Unit) {
    PanelBox {
        Text("오늘의 도착 계획", fontSize = 21.sp, fontWeight = FontWeight.Bold)
        PlanRow("01", "먼저 내릴 곳", OryongDemo.dropoff.name)
        HorizontalDivider(color = Color.White.copy(alpha = .10f))
        PlanRow("02", "운전자가 주차할 곳", trip.parking?.name ?: "후보 없음 · 현장 확인 필요")
        HorizontalDivider(color = Color.White.copy(alpha = .10f))
        PlanRow("03", "다시 만날 곳", OryongDemo.meeting.name)
        OutlinedButton(onClick = onLocations, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
            Text("장소 위치 보기")
        }
        Text("이미지에서 추정한 위치예요. 주차 후보 순서는 실제 이동 경로와 달라요.", color = Muted, fontSize = 13.sp)
        if (trip.excludedParkingIds.isNotEmpty()) {
            Text("이번 방문에서 제외한 후보 ${trip.excludedParkingIds.size}곳 · 다른 방문자에게 만차로 표시하지 않아요.", color = Muted, fontSize = 14.sp)
        }
    }
}

@Composable
private fun PlanRow(number: String, label: String, value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(number, color = Mint, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, color = Muted, fontSize = 14.sp)
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun CompanionPanel(trip: Trip, onOpen: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().border(1.dp, Mint.copy(alpha = .3f), RoundedCornerShape(24.dp)).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("동승자에게 보일 안내", color = Mint, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(companionMessage(trip), fontSize = 18.sp)
        OutlinedButton(onClick = onOpen, modifier = Modifier.fillMaxWidth().heightIn(min = 60.dp)) { Text("도착 카드 미리보기") }
    }
}

@Composable
private fun RestrictedView(trip: Trip) {
    PanelBox {
        Text("주행 제한 상태 시연", color = Mint, fontSize = 18.sp)
        Text("${stageLabel(trip.stage)}\n${trip.parking?.name ?: "주차 후보 없음"}", fontSize = 28.sp, lineHeight = 40.sp)
        Text("상세 계획과 단계 변경은 정차 시연으로 전환한 뒤 확인할 수 있어요.", color = Muted, fontSize = 18.sp)
        Text("실제 차량 상태 및 CarUxRestrictions 연동은 아직 적용되지 않았어요.", color = Amber)
    }
}

private fun stageLabel(stage: TripStage): String = when (stage) {
    TripStage.PLANNED -> "방문 준비"
    TripStage.TO_DROPOFF -> "01 · 하차 지점으로"
    TripStage.TO_PARKING -> "02 · 주차 장소로"
    TripStage.WALKING_TO_MEETING -> "03 · 다시 만날 곳으로"
    TripStage.REUNITED -> "방문 완료"
    TripStage.CANCELLED -> "방문 종료"
}

private fun companionMessage(trip: Trip): String = when (trip.stage) {
    TripStage.PLANNED, TripStage.TO_DROPOFF -> "내린 뒤에는 미리 정한 만남 장소에서 다시 만나요."
    TripStage.TO_PARKING -> "운전자는 주차 단계예요. 다시 만날 장소는 바뀌지 않았어요."
    TripStage.WALKING_TO_MEETING -> "운전자가 주차 완료를 확인했어요. 약속한 장소에서 다시 만나요."
    TripStage.REUNITED -> "다시 만났어요. 함께 방문을 이어가세요."
    TripStage.CANCELLED -> "방문 안내가 종료됐어요. 필요한 경우 운전자에게 연락해 주세요."
}
