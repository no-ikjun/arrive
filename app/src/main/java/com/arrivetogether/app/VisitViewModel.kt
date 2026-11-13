package com.arrivetogether.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.compose.runtime.*
import com.arrivetogether.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import java.io.IOException
import java.util.UUID

class VisitViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SharedVisitStore(application)
    private val loaded = runCatching { store.load() }
    internal var state by mutableStateOf(loaded.getOrNull() ?: SharedVisit(VisitQueue(
        LocalTripRepository(application).load() ?: Trip(UUID.randomUUID().toString())))); private set
    var storageFailed by mutableStateOf(loaded.isFailure); private set
    var connectionMessage by mutableStateOf(if (loaded.isFailure) "저장된 방문을 읽지 못했어요. 앱을 다시 실행해 주세요." else ""); private set
    var busy by mutableStateOf(false); private set
    var handoffBusy by mutableStateOf(false); private set
    var handoffMessage by mutableStateOf(""); private set
    val handoffUrl: String? get() = if (state.unavailable || state.deleting || trip.stage !in listOf(TripStage.WALKING_TO_MEETING, TripStage.REUNITED)) null else
        state.handoffToken?.takeIf { runCatching { java.time.Instant.parse(state.handoffExpiresAt).isAfter(java.time.Instant.now()) }.getOrDefault(false) }
            ?.let { token -> AppConfiguration.companionBaseUrl?.let { "$it/#handoff=$token" } }
    fun prepareHandoff() {
        if (handoffBusy || handoffUrl != null || !actionsAllowed || trip.stage != TripStage.WALKING_TO_MEETING) return
        if (AppConfiguration.companionBaseUrl == null) { handoffMessage = "휴대폰 연결 주소를 아직 준비하지 못했어요"; return }
        handoffBusy = true; handoffMessage = "휴대폰에서 이어볼 안내를 준비하고 있어요"
        viewModelScope.launch {
            try {
                if (!shared) connectCompanion()
                withTimeout(20_000) { while (state.remote == null || pendingCount > 0 || busy) { if (!actionsAllowed) error("Unavailable"); delay(250) } }
                val current = state
                if (current.queue.trip.stage != TripStage.WALKING_TO_MEETING || !actionsAllowed) return@launch
                val key = current.handoffKey ?: UUID.randomUUID().toString()
                if (!save(current.copy(handoffKey = key))) return@launch
                val id = requireNotNull(current.remote).trip.id
                val credential = withContext(Dispatchers.IO) { SessionApi(requireNotNull(current.apiBase)).handoff(id, requireNotNull(current.owner), current.share, key) }
                if (state.remote?.trip?.id != id || !actionsAllowed || trip.terminal) return@launch
                require(!java.time.Instant.parse(credential.expiresAt).isAfter(java.time.Instant.parse(current.remote.expiresAt)))
                if (save(state.copy(handoffToken = credential.token, handoffExpiresAt = credential.expiresAt))) handoffMessage = ""
            } catch (e: TimeoutCancellationException) { handoffMessage = "방문 상태 전송을 기다리고 있어요. 잠시 후 다시 연결해 주세요" }
              catch (e: CancellationException) { throw e }
              catch (e: ApiFailure) {
                handoffMessage = when (e.status) {
                    404, 501 -> "휴대폰 이어가기를 아직 사용할 수 없어요. 지금은 차량의 입구 안내를 확인해 주세요"
                    401, 403 -> "휴대폰 연결 권한을 확인하지 못했어요. 다시 연결해 주세요"
                    409 -> "방문 상태가 변경됐어요. 최신 상태를 확인한 뒤 다시 연결해 주세요"
                    else -> "휴대폰 연결을 준비하지 못했어요. 인터넷 연결 후 다시 시도해 주세요"
                }
            } catch (_: Exception) { handoffMessage = "휴대폰 연결을 준비하지 못했어요. 잠시 후 다시 시도해 주세요" }
            finally { handoffBusy = false }
        }
    }
    private var foreground = false
    private var nextAttempt = 0L
    private val wake = Channel<Unit>(Channel.CONFLATED)
    val trip: Trip get() = state.queue.trip
    val actionsAllowed get() = !storageFailed && !state.deleting && !state.unavailable
    val shared get() = state.shared
    val pendingCount get() = state.queue.pending.size
    val shareUrl: String? get() = if (state.unavailable || state.deleting || state.remote == null) null else
        state.share?.let { token -> AppConfiguration.companionBaseUrl?.let { "$it/#token=$token" } }
    val syncLabel: String get() = when {
        storageFailed -> "저장 실패 · 변경을 진행할 수 없어요"
        state.unavailable -> "공유 기간이 끝났거나 링크가 폐기됐어요"
        state.deleting -> "이전 공유 링크를 종료하는 중이에요"
        !shared -> "이 차량에만 저장됨 · 동승자 연결 전"
        state.remote == null -> "연결 준비 중 · 아직 공유되지 않았어요"
        pendingCount > 0 -> "전송 대기 ${pendingCount}건 · 동승자 화면에는 이전 상태가 보여요"
        connectionMessage.isNotEmpty() -> "최근 서버 확인 실패 · 마지막 전송 상태를 표시해요"
        else -> "서버 반영 완료 · 동승자 카드에서 확인할 수 있어요"
    }
    init {
        viewModelScope.launch {
            while (isActive) {
                if (System.currentTimeMillis() >= nextAttempt && !storageFailed && state.shared &&
                    (!state.unavailable || state.deleting) && (foreground || pendingCount > 0 || state.remote == null || state.deleting)) {
                    sync()
                }
                withTimeoutOrNull(5_000) { wake.receive() }
            }
        }
    }
    fun setForeground(value: Boolean) { foreground = value; if (value) retry() }
    fun retry() { nextAttempt = 0; wake.trySend(Unit) }
    private fun save(next: SharedVisit): Boolean = try {
        store.save(next); state = next; true
    } catch (_: Exception) {
        storageFailed = true; connectionMessage = "방문을 저장하지 못했어요. 변경 내용은 전송하지 않았어요."; false
    }
    fun dispatch(action: TripAction, allowed: Boolean): Boolean {
        if (!actionsAllowed || !allowed) return false
        return try {
            val next = if (shared) state.queue.enqueue(action, UUID.randomUUID().toString(), true) else {
                val result = TripReducer.apply(trip, action, true)
                require(result is TripResult.Updated) { (result as TripResult.Rejected).message }
                VisitQueue(result.trip)
            }
            save(state.copy(queue = next, notice = null)).also { if (it) retry() }
        } catch (e: IllegalArgumentException) { connectionMessage = e.message ?: "현재 단계에서는 진행할 수 없어요."; false }
    }
    fun connectCompanion() {
        if (shared || !actionsAllowed || AppConfiguration.companionBaseUrl == null) return
        try {
            var queue = VisitQueue(Trip(trip.id))
            sharingHistory(trip).forEach { queue = queue.enqueue(it, UUID.randomUUID().toString(), true) }
            if (save(SharedVisit(queue, AppConfiguration.apiBaseUrl, UUID.randomUUID().toString()))) retry()
        } catch (_: IllegalArgumentException) { connectionMessage = "종료된 방문은 ‘새 방문’을 시작한 뒤 공유해 주세요." }
    }
    fun reset() {
        if (storageFailed) return
        if (!shared || state.unavailable) newLocalVisit()
        else if (save(state.copy(deleting = true))) retry()
    }
    private fun newLocalVisit() {
        if (save(SharedVisit(VisitQueue(Trip(UUID.randomUUID().toString()))))) connectionMessage = ""
    }
    private suspend fun sync() {
        busy = true
        try {
            val api = SessionApi(requireNotNull(state.apiBase))
            if (state.remote == null) {
                val created = withContext(Dispatchers.IO) { api.create(requireNotNull(state.createKey)) }
                require(created.remote.trip.stage == TripStage.PLANNED && created.remote.trip.revision == 1)
                if (!save(state.copy(queue = state.queue.copy(trip = state.queue.trip.copy(id = created.remote.trip.id)),
                    owner = created.owner, share = created.share, remote = created.remote))) return
            }
            while (!storageFailed) {
                val current = state
                val remote = requireNotNull(current.remote); val owner = requireNotNull(current.owner)
                if (current.deleting) {
                    try { withContext(Dispatchers.IO) { api.delete(remote.trip.id, owner) } }
                    catch (e: ApiFailure) { if (e.status != 404) throw e }
                    newLocalVisit(); return
                }
                val head = current.queue.pending.firstOrNull() ?: break
                val result = withContext(Dispatchers.IO) { api.event(remote.trip.id, owner, head) }
                require(result.trip.id == remote.trip.id)
                if (!save(state.copy(queue = state.queue.acknowledge(head.key, result.trip), remote = result))) return
            }
            // Reconcile on resume, including updates made with the same owner on another client.
            if (state.shared && !state.deleting) {
                val r = requireNotNull(state.remote); val owner = requireNotNull(state.owner)
                val fresh = withContext(Dispatchers.IO) { api.get(r.trip.id, owner) }
                require(fresh.trip.id == r.trip.id && fresh.trip.revision >= r.trip.revision)
                if (state.queue.pending.isEmpty()) save(state.copy(queue = VisitQueue(fresh.trip), remote = fresh))
                else if (fresh.trip.revision != r.trip.revision) reconcile(fresh)
            }
            connectionMessage = ""; nextAttempt = 0
        } catch (e: CancellationException) { throw e }
          catch (e: ApiFailure) {
            when {
                e.status == 404 && state.remote != null -> {
                    if (state.deleting) newLocalVisit()
                    else { save(state.copy(unavailable = true, notice = "공유가 만료되거나 삭제됐어요. 새 방문을 시작해 주세요.")); connectionMessage = "" }
                }
                e.status == 409 && e.code == "REVISION_CONFLICT" && state.remote != null -> {
                    try {
                        val r = state.remote!!; val api = SessionApi(state.apiBase!!); val owner = state.owner!!
                        val fresh = withContext(Dispatchers.IO) { api.get(r.trip.id, owner) }
                        reconcile(fresh); connectionMessage = ""
                    } catch (e: CancellationException) { throw e }
                    catch (_: Exception) { connectionMessage = "변경 충돌을 확인 중이에요. 연결 후 다시 시도해 주세요." }
                }
                else -> connectionMessage = when (e.status) {
                    401 -> "서버 접근 권한을 확인할 수 없어요. 서버 설정을 확인해 주세요."
                    429 -> "요청이 많아 잠시 기다린 뒤 다시 전송해요."
                    400, 404, 409 -> "서버가 변경을 수락하지 않았어요. 연결 설정과 방문 상태를 확인해 주세요."
                    else -> "서버에 연결하지 못했어요. 저장된 변경은 다시 전송해요."
                }
            }
            nextAttempt = System.currentTimeMillis() + if (e.status in listOf(400, 401, 409)) 60_000 else e.retrySeconds * 1000
        } catch (_: IOException) {
            connectionMessage = "인터넷 또는 서버 연결을 확인해 주세요. 변경 내용은 이 차량에 저장됐어요."
            nextAttempt = System.currentTimeMillis() + 5_000
        } catch (_: Exception) {
            connectionMessage = "서버 응답을 확인하지 못했어요. 방문 데이터와 앱 버전을 확인해 주세요."
            nextAttempt = System.currentTimeMillis() + 30_000
        } finally { busy = false }
    }
    private fun reconcile(fresh: RemoteVisit) {
        require(fresh.trip.id == state.remote?.trip?.id)
        save(state.copy(queue = VisitQueue(fresh.trip), remote = fresh,
            notice = "다른 변경과 충돌해 서버 상태를 불러왔어요. 전송 대기 항목은 적용하지 않았으니 현재 단계를 확인해 주세요."))
    }
}
