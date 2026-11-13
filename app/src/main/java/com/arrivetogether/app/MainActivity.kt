package com.arrivetogether.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModelProvider
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.arrivetogether.domain.*

class MainActivity : ComponentActivity() {
    private lateinit var navigation: PleosNavigation
    private lateinit var telemetry: VehicleTelemetry
    private val locationPermission = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()) {
        telemetry.restart(); ArrivalMonitor.update(this, visit.trip)
    }
    private lateinit var visit: VisitViewModel
    override fun onStart() { super.onStart(); navigation.start(); telemetry.setVisible(true); ArrivalMonitor.update(this, visit.trip); visit.setForeground(true) }
    override fun onStop() { visit.setForeground(false); telemetry.setVisible(false); navigation.background(); super.onStop() }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        visit = ViewModelProvider(this)[VisitViewModel::class.java]
        navigation = ViewModelProvider(this)[PleosNavigationViewModel::class.java].navigation
        telemetry = VehicleTelemetry.get(application)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(
                primary = ArriveInk, onPrimary = Color.White, background = ArriveBackground,
                surface = ArrivePanel, surfaceContainerHigh = ArrivePanel,
                onSurface = ArriveInk, onBackground = ArriveInk, onSurfaceVariant = ArriveMuted,
                outline = ArriveLine, secondary = ArriveInk, surfaceTint = Color.Transparent,
            )) { ArrivalApp(visit, navigation, telemetry) { locationPermission.launch(ArrivalMonitor.permissions()) } }
        }
    }
}

@Composable
private fun ArrivalApp(visit: VisitViewModel, navigation: PleosNavigation, telemetry: VehicleTelemetry, requestLocation: () -> Unit) {
    val trip = visit.trip
    val venue = currentVisitPlace
    val context = LocalContext.current
    val guide = remember(context) { readArrivalGuide(context) }
    var simulatedRestricted by rememberSaveable { mutableStateOf(false) }
    val restricted = !interactionAllowed(navigation.automotive, navigation.realRestricted, simulatedRestricted)
    var locationsOpen by rememberSaveable { mutableStateOf(false) }
    var cardOpen by rememberSaveable { mutableStateOf(false) }
    var phoneOpen by rememberSaveable { mutableStateOf(false) }
    var infoOpen by rememberSaveable { mutableStateOf(false) }
    var resetOpen by remember { mutableStateOf(false) }
    var cancelOpen by remember { mutableStateOf(false) }
    val cue = telemetry.cue
    LaunchedEffect(restricted) {
        if (restricted) navigation.cancelHandoff()
        if (restricted) { phoneOpen = false; cardOpen = false; locationsOpen = false; resetOpen = false; infoOpen = false; cancelOpen = false }
    }
    fun dispatch(action: TripAction) {
        if (visit.dispatch(action, !restricted)) {
            ArrivalMonitor.update(context, visit.trip)
            navigation.followTrip(visit.trip, userInitiated = true)
            if (action == TripAction.ConfirmParked) phoneOpen = true
        }
    }
    LaunchedEffect(trip.id, trip.stage, trip.parkingId) {
        if (trip.stage != TripStage.WALKING_TO_MEETING) phoneOpen = false
        navigation.followTrip(trip)
        if ((context as? ComponentActivity)?.lifecycle?.currentState?.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED) == true)
            ArrivalMonitor.update(context, trip)
    }

    Surface(Modifier.fillMaxSize(), color = ArriveBackground) {
        BoxWithConstraints(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
            val wide = maxWidth >= 900.dp
            val compact = maxHeight < 620.dp
            val gutter = if (wide) 32.dp else 20.dp
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = gutter, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    Image(painterResource(R.drawable.arrive_logo_mint), "arrive",
                        Modifier.width(if (wide) 132.dp else 88.dp).height(44.dp), colorFilter = ColorFilter.tint(ArriveInk))
                    if (wide) {
                        VerticalDivider(Modifier.height(28.dp), color = ArriveLine)
                        Text(venue.name, fontSize = 21.sp, modifier = Modifier.weight(1f))
                        SmallLabel("시연 · 추정 위치")
                    } else Spacer(Modifier.weight(1f))
                    DriverButton("더 보기", R.drawable.ic_more, enabled = !restricted, onClick = { infoOpen = true })
                }
                HorizontalDivider(color = ArriveLine)
                if (!wide && !compact) Row(Modifier.fillMaxWidth().padding(horizontal = gutter, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(venue.name, fontSize = 18.sp)
                    Text("시연 · 추정 위치", fontSize = 14.sp, color = ArriveMuted)
                }
                if (restricted) {
                    RestrictedView(navigation, Modifier.weight(1f).padding(gutter))
                } else {
                    if (wide) {
                        Row(Modifier.weight(1f).padding(gutter), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                            Surface(Modifier.weight(.9f).fillMaxHeight(), shape = RoundedCornerShape(24.dp), color = ArrivePanel) {
                                Column(Modifier.padding(if (compact) 20.dp else 28.dp)) {
                                    JourneyProgress(trip.stage)
                                    if (trip.stage in listOf(TripStage.PLANNED, TripStage.TO_DROPOFF, TripStage.TO_PARKING) && !ArrivalMonitor.permitted(context)) {
                                        Text("내비 사용 중 도착 안내", fontSize = 18.sp, modifier = Modifier.padding(top = 12.dp))
                                        DriverButton("알림·위치 허용", R.drawable.ic_pin, onClick = requestLocation)
                                    }
                                    CurrentDestination(trip, venue, navigation, simulatedRestricted,
                                        Modifier.weight(1f).fillMaxWidth(), compact = compact, prominent = !compact, entranceName = guide?.entranceName)
                                    ActionDock(trip, visit, Modifier.fillMaxWidth(), ::dispatch, { resetOpen = true }, prominent = !compact, cue = cue, autoRoute = navigation.routeTestingEnabled, onPhone = { phoneOpen = true })
                                }
                            }
                            Column(Modifier.weight(1.4f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                ArrivalMapPanel(trip, Modifier.weight(1f).fillMaxWidth(), telemetry.freshFix)
                                DriverButton("입구 안내 공유", R.drawable.ic_share, Modifier.fillMaxWidth()) { cardOpen = true }
                            }
                        }
                    } else {
                        JourneyProgress(trip.stage, Modifier.padding(horizontal = gutter, vertical = if (compact) 8.dp else 12.dp), dense = compact)
                        ArrivalMapPanel(trip, Modifier.weight(1f).fillMaxWidth().padding(horizontal = gutter), telemetry.freshFix)
                        CurrentDestination(trip, venue, navigation, simulatedRestricted,
                            Modifier.height(if (compact) 90.dp else 140.dp).fillMaxWidth().padding(horizontal = gutter),
                            compact = true, entranceName = guide?.entranceName)
                        // Confirmation remains visible even in a short or split application window.
                        ActionDock(trip, visit, Modifier.padding(horizontal = gutter, vertical = 12.dp),
                            ::dispatch, { resetOpen = true }, cue = cue, autoRoute = navigation.routeTestingEnabled, onPhone = { phoneOpen = true })
                    }
                }
                if (!navigation.automotive) Row(Modifier.padding(horizontal = gutter), verticalAlignment = Alignment.CenterVertically) {
                    SmallLabel("주행 제한 미리보기", Modifier.weight(1f))
                    Switch(checked = simulatedRestricted, onCheckedChange = { simulatedRestricted = it })
                }
            }
        }
    }
    if (locationsOpen && !restricted) SiteLocationsDialog(trip) { locationsOpen = false }
    if (phoneOpen && !restricted) PhoneHandoffDialog(visit) { phoneOpen = false }
    if (cardOpen && !restricted) CompanionSharingDialog(visit) { cardOpen = false }
    if (infoOpen && !restricted) AlertDialog(onDismissRequest = { infoOpen = false }, title = { Text("방문 정보") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(venue.name, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            SmallLabel("동승자가 들어갈 곳")
            Text(guide?.entranceName ?: "건물 입구 확인 중", fontSize = 20.sp)
            guide?.let { Text(it.instructions, color = ArriveMuted) }
            if (trip.stage == TripStage.WALKING_TO_MEETING) {
                DriverButton("휴대폰으로 이어가기", R.drawable.ic_share, Modifier.fillMaxWidth()) { infoOpen = false; phoneOpen = true }
                DriverButton("합류 완료 직접 확인", R.drawable.ic_check, Modifier.fillMaxWidth()) { dispatch(TripAction.ConfirmReunion); infoOpen = false }
            }
            DriverButton("동승자 공유", R.drawable.ic_share, Modifier.fillMaxWidth()) { infoOpen = false; cardOpen = true }
            DriverButton("장소 정보", R.drawable.ic_pin, Modifier.fillMaxWidth()) { infoOpen = false; locationsOpen = true }
            HorizontalDivider(color = ArriveLine)
            Text(visit.syncLabel)
            if (visit.connectionMessage.isNotEmpty()) Text(visit.connectionMessage, color = ArriveWarning)
            visit.state.notice?.let { Text(it, color = ArriveWarning) }
            if (visit.shared && (visit.pendingCount > 0 || visit.connectionMessage.isNotEmpty()))
                DriverButton("다시 연결", R.drawable.ic_retry, Modifier.fillMaxWidth(), enabled = !visit.busy) { visit.retry() }
            NavigationAction(navigation, trip, simulatedRestricted)
            NavigationPanel(navigation, trip, simulatedRestricted)
            HorizontalDivider(color = ArriveLine)
            Text("내비 사용 중 도착 안내", fontSize = 20.sp)
            Text(telemetry.monitorMessage.ifEmpty { "알림을 누르면 arrive로 돌아와 하차·주차를 확인할 수 있어요" }, color = ArriveMuted)
            Text(if (telemetry.fix != null && telemetry.freshFix == null) "차량 위치 갱신 대기" else telemetry.locationStatus, color = ArriveMuted)
            Text(telemetry.gearStatus, color = ArriveMuted)
            Text("지점 근처에서 P가 6초 유지되면 하차·주차 확인을 제안해요. 위치는 이 차량에서만 사용해요.", color = ArriveMuted)
            DriverButton(if (!ArrivalMonitor.permitted(context)) "알림·위치 허용" else "차량 위치 다시 연결", R.drawable.ic_pin, Modifier.fillMaxWidth()) {
                if (!ArrivalMonitor.permitted(context)) requestLocation() else { telemetry.restart(); ArrivalMonitor.update(context, trip) }
            }
            Text("현재 지원 장소는 한 곳입니다.", color = ArriveMuted)
            Text(venue.notice, color = ArriveMuted)
            Text("빈자리 정보는 제공하지 않아요. 동승자에게는 확인한 방문 단계만 공유해요.", color = ArriveMuted)
            DriverButton("새 방문", R.drawable.ic_add, Modifier.fillMaxWidth(), enabled = !visit.storageFailed && !visit.state.deleting) { infoOpen = false; resetOpen = true }
            if (!trip.terminal) DriverButton("방문 종료", R.drawable.ic_close, Modifier.fillMaxWidth(), enabled = visit.actionsAllowed) { infoOpen = false; cancelOpen = true }
        } }, confirmButton = { DriverButton("닫기", R.drawable.ic_close) { infoOpen = false } })
    if (resetOpen && !restricted) AlertDialog(onDismissRequest = { resetOpen = false }, title = { Text("새 방문을 시작할까요?") },
        text = { Text(if (visit.shared) "현재 공유 링크와 방문 기록을 종료합니다." else "현재 방문 단계를 초기화합니다.") },
        confirmButton = { DriverButton("새로 시작", R.drawable.ic_add, primary = true, enabled = !visit.storageFailed && !visit.state.deleting) {
            navigation.cancelHandoff(); navigation.clearAttempt(); visit.reset(); resetOpen = false
        } }, dismissButton = { DriverButton("취소", R.drawable.ic_close) { resetOpen = false } })
    if (cancelOpen && !restricted) AlertDialog(onDismissRequest = { cancelOpen = false }, title = { Text("방문을 종료할까요?") },
        text = { Text("종료 후에는 이 방문을 이어갈 수 없습니다.") },
        confirmButton = { DriverButton("종료", R.drawable.ic_close, primary = true, enabled = visit.actionsAllowed) { dispatch(TripAction.Cancel); cancelOpen = false } },
        dismissButton = { DriverButton("계속하기", R.drawable.ic_arrow) { cancelOpen = false } })
}

@Composable
private fun JourneyProgress(stage: TripStage, modifier: Modifier = Modifier, dense: Boolean = false) {
    val current = when (stage) { TripStage.PLANNED, TripStage.TO_DROPOFF -> 0; TripStage.TO_PARKING -> 1; else -> 2 }
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val small = dense || maxWidth < 500.dp
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(if (small) 8.dp else 16.dp)) {
            listOf("하차", "주차", "입장").forEachIndexed { index, label ->
                val selected = index == current && stage != TripStage.CANCELLED
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (!small) Surface(shape = RoundedCornerShape(10.dp), color = if (selected) ArriveInk else ArriveBackground) {
                        Text("${index + 1}", Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                            color = if (selected) Color.White else ArriveMuted, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Text(label, fontSize = if (small) 22.sp else 26.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal, color = if (selected) ArriveInk else ArriveMuted)
                }
                if (index < 2) HorizontalDivider(Modifier.weight(1f), color = ArriveLine)
            }
        }
    }
}

@Composable
private fun CurrentDestination(trip: Trip, venue: VisitPlace, navigation: PleosNavigation, simulatedRestricted: Boolean,
                               modifier: Modifier, compact: Boolean, prominent: Boolean = false, entranceName: String? = null) {
    val title = when (trip.stage) {
        TripStage.PLANNED, TripStage.TO_DROPOFF -> venue.localName(venue.dropoff)
        TripStage.TO_PARKING -> trip.parking?.let(venue::localName) ?: "주차 후보 없음"
        TripStage.WALKING_TO_MEETING -> entranceName ?: "건물 입구 확인"
        TripStage.REUNITED -> "함께 도착했어요"
        TripStage.CANCELLED -> "방문을 종료했어요"
    }
    val instruction = when (trip.stage) {
        TripStage.PLANNED -> "동승자가 먼저 내릴 곳"
        TripStage.TO_DROPOFF -> "동승자 하차 후 눌러 주세요"
        TripStage.TO_PARKING -> "운전자가 주차할 곳"
        TripStage.WALKING_TO_MEETING -> "건물로 이동할 차례"
        TripStage.REUNITED -> "방문 완료"
        TripStage.CANCELLED -> "방문 종료"
    }
    val note = when (trip.stage) {
        TripStage.PLANNED -> "동승자는 입구로 · 운전자는 주차장으로"
        TripStage.TO_DROPOFF -> "정차 가능 여부 확인"
        TripStage.TO_PARKING -> if (trip.parking == null) "현장 안내 확인" else "빈자리 정보 없음"
        TripStage.WALKING_TO_MEETING -> "동승자가 먼저 들어간 건물로 이동"
        TripStage.REUNITED, TripStage.CANCELLED -> "새 방문을 시작할 수 있어요"
    }
    val icon = when (trip.stage) {
        TripStage.PLANNED, TripStage.TO_DROPOFF -> R.drawable.ic_pin
        TripStage.TO_PARKING -> R.drawable.ic_parking
        else -> R.drawable.ic_people
    }
    BoxWithConstraints(modifier) {
        val short = compact || maxHeight < 340.dp
        val smallWidth = maxWidth < 500.dp
        if (compact && !smallWidth) {
            Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(title, fontSize = 32.sp, lineHeight = 42.sp, fontWeight = FontWeight.SemiBold)
                    Text(note, fontSize = 20.sp, lineHeight = 28.sp, color = ArriveMuted)
                }
                NavigationProgress(navigation)
            }
            return@BoxWithConstraints
        }
        val showNavigation = !short || maxHeight >= 200.dp
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
            verticalArrangement = if (short) Arrangement.Top else Arrangement.Center) {
            if (!short) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    Icon(painterResource(icon), null, Modifier.size(if (prominent) 80.dp else 48.dp), tint = ArriveInk)
                    Text(instruction, color = ArriveMuted, fontSize = if (prominent) 28.sp else 24.sp, lineHeight = 36.sp)
                }
                Spacer(Modifier.height(if (prominent) 28.dp else 20.dp))
            }
            Text(title, fontSize = if (prominent) 48.sp else 30.sp, lineHeight = if (prominent) 62.sp else 40.sp,
                fontWeight = FontWeight.SemiBold, letterSpacing = (-1).sp)
            Spacer(Modifier.height(if (short) 4.dp else 16.dp))
            Text(note, color = ArriveMuted, fontSize = if (prominent) 24.sp else 20.sp, lineHeight = 28.sp)
            if (navigationTarget(trip) != null && showNavigation) {
                Spacer(Modifier.height(if (short) 12.dp else 28.dp))
                NavigationProgress(navigation)
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}

private fun shareStatus(visit: VisitViewModel): String = when {
    visit.storageFailed -> "저장 오류 · 더 보기에서 확인"
    visit.state.deleting -> "공유 종료 중"
    visit.state.unavailable -> "공유 만료 · 새 방문 필요"
    visit.state.notice != null -> "공유 상태 확인 필요"
    visit.pendingCount > 0 -> "변경 내용 전송 대기"
    visit.connectionMessage.isNotEmpty() -> "연결 확인 필요"
    visit.shareUrl != null -> "입구 안내 공유 중"
    visit.shared -> "공유 연결 중"
    else -> "공유 전"
}

@Composable
private fun ActionDock(trip: Trip, visit: VisitViewModel, modifier: Modifier, dispatch: (TripAction) -> Unit, onReset: () -> Unit, prominent: Boolean = false, cue: ArrivalCue = ArrivalCue.NONE, autoRoute: Boolean = false, onPhone: () -> Unit) {
    val hasAlternative = trip.stage == TripStage.TO_PARKING && trip.parking != null
    val label = when (trip.stage) {
        TripStage.PLANNED -> if (autoRoute) "시작 · 길안내" else "방문 시작"
        TripStage.TO_DROPOFF -> if (autoRoute) "하차 확인 · 주차 안내" else "하차 완료"
        TripStage.TO_PARKING -> if (trip.parking != null) "주차 완료" else "새 방문"
        TripStage.WALKING_TO_MEETING -> "휴대폰으로 이어가기"
        else -> "새 방문"
    }
    val action = when (trip.stage) {
        TripStage.PLANNED -> TripAction.Start
        TripStage.TO_DROPOFF -> TripAction.ConfirmDropoff
        TripStage.TO_PARKING -> if (trip.parking != null) TripAction.ConfirmParked else null
        TripStage.WALKING_TO_MEETING -> TripAction.ConfirmReunion
        else -> null
    }
    val icon = if (trip.stage == TripStage.WALKING_TO_MEETING) R.drawable.ic_share else if (action == null) R.drawable.ic_add else if (action == TripAction.Start) R.drawable.ic_arrow else R.drawable.ic_check
    val enabled = if (action == null) !visit.storageFailed && !visit.state.deleting else visit.actionsAllowed
    val confirm: () -> Unit = { if (trip.stage == TripStage.WALKING_TO_MEETING) onPhone() else if (action != null) dispatch(action) else onReset() }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val cueText = when (cue) {
            ArrivalCue.CONFIRM_DROPOFF -> "하차 지점 근처예요. 동승자가 내렸나요?"
            ArrivalCue.CONFIRM_PARKED -> "주차장 근처에서 P 확인. 주차를 마쳤나요?"
            ArrivalCue.NEARBY -> "안내 지점 근처예요 · 현장을 확인해 주세요"
            else -> null
        }
        cueText?.let { Text(it, fontSize = 20.sp, fontWeight = FontWeight.Medium) }
        if (!visit.actionsAllowed || visit.pendingCount > 0 || visit.connectionMessage.isNotEmpty() || visit.state.notice != null)
            Text(shareStatus(visit), color = ArriveWarning, fontSize = 17.sp)
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            if (maxWidth < 440.dp && hasAlternative) Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                DriverButton(label, icon, Modifier.fillMaxWidth(), primary = true, enabled = enabled, prominent = prominent, onClick = confirm)
                DriverButton("다른 주차장", R.drawable.ic_retry, Modifier.fillMaxWidth(), enabled = visit.actionsAllowed, prominent = prominent) { dispatch(TripAction.RejectParking) }
            } else Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                DriverButton(label, icon, Modifier.weight(1f), primary = true, enabled = enabled, prominent = prominent, onClick = confirm)
                if (hasAlternative) DriverButton("다른 주차장", R.drawable.ic_retry, Modifier.weight(1f), enabled = visit.actionsAllowed, prominent = prominent) { dispatch(TripAction.RejectParking) }
            }
        }
    }
}

@Composable
private fun RestrictedView(navigation: PleosNavigation, modifier: Modifier) {
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.Center) {
        Icon(painterResource(R.drawable.ic_lock), null, Modifier.size(60.dp))
        Spacer(Modifier.height(28.dp))
        Text(if (navigation.automotive && navigation.realRestricted == null) "차량 상태 확인 중" else "정차 후 이용해 주세요",
            fontSize = 34.sp, lineHeight = 46.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(16.dp))
        SmallLabel(if (!navigation.automotive) "주행 제한 미리보기" else "조작 가능한 상태에서 다시 표시됩니다")
    }
}
