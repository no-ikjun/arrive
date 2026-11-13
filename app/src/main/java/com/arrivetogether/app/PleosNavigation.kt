package com.arrivetogether.app

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.data.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.arrivetogether.domain.*

internal enum class NaviConnection { UNSUPPORTED, CONNECTING, READY, FAILED, STOPPED }

/** All callbacks are marshalled to main and checked against the owning connection generation. */
internal class PleosNavigation(private val context: Context) {
    var connection by mutableStateOf(NaviConnection.STOPPED); private set
    var connectionMessage by mutableStateOf("SDK 연결 전"); private set
    var attempt by mutableStateOf(RouteAttempt()); private set
    var realRestricted by mutableStateOf<Boolean?>(null); private set
    val automotive = context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)
    // Current catalog is image-estimated. Requests are a debug emulator check, never a real-car feature.
    val routeTestingEnabled = BuildConfig.DEBUG &&
        (Build.HARDWARE in setOf("ranchu", "goldfish") || Build.FINGERPRINT.startsWith("generic"))
    private val handler = Handler(Looper.getMainLooper())
    private var helper: NaviHelper? = null
    private var listener: NaviHelperEventListener? = null
    private var epoch = 0
    private var active = false
    private var visible = false
    private var probePending = false
    private var restrictions: AutomotiveRestrictions? = null

    private val handoff = RouteHandoff()
    fun followTrip(trip: Trip, userInitiated: Boolean = false) {
        if (handoff.update(trip, userInitiated, android.os.SystemClock.elapsedRealtime())) clearAttempt()
        flushHandoff()
    }
    fun cancelHandoff() { handoff.cancel() }
    private fun flushHandoff() {
        if (automotive && realRestricted == null) return
        val target = handoff.take(android.os.SystemClock.elapsedRealtime(),
            connection == NaviConnection.READY && attempt.phase == RoutePhase.IDLE,
            visible && routeTestingEnabled && interactionAllowed(automotive, realRestricted, false)) ?: return
        request(target, false)
    }

    fun start() {
        if (visible) return
        visible = true
        active = true
        if (automotive) {
            try {
                restrictions = AutomotiveRestrictions(context) { realRestricted = it; flushHandoff() }.also { it.start() }
            } catch (_: LinkageError) { realRestricted = null }
        }
        // Navigation may take the foreground while a request is pending.
        // Keep that listener; reconnect only when the prior connection was released.
        if (helper == null) connect(resetAttempt = false)
    }
    fun background() {
        handoff.cancel()
        visible = false
        restrictions?.stop(); restrictions = null
        if (!attempt.pending) pauseConnection()
        // Pending requests retain their existing 25s deadline in the background.
    }
    fun dispose() {
        handoff.cancel()
        visible = false
        restrictions?.stop(); restrictions = null
        pauseConnection()
    }
    private fun pauseConnection() {
        active = false
        retire()
        connection = NaviConnection.STOPPED
        connectionMessage = "화면을 다시 열면 SDK를 연결해요."
    }
    private fun finishBackgroundAttempt() {
        if (!visible && !attempt.pending) pauseConnection()
    }
    fun reconnect() { if (active) connect() }
    fun clearAttempt() {
        if (attempt.phase != RoutePhase.IDLE) { attempt = RouteAttempt(); if (active) connect() }
    }
    private fun retire() {
        epoch++
        handler.removeCallbacksAndMessages(null)
        listener?.let { event -> runCatching { helper?.removeListener(event) } }
        runCatching { helper?.release() }
        helper = null; listener = null; probePending = false
    }
    private fun onMain(owner: Int, action: () -> Unit) {
        handler.post { if (active && owner == epoch) action() }
    }
    private fun fail(message: String) {
        handoff.cancel()
        if (attempt.pending || attempt.phase == RoutePhase.CONFIRMED) attempt = attempt.failed(message)
        retire()
        connection = NaviConnection.FAILED; connectionMessage = message
        if (!visible) active = false
    }
    private fun connect(resetAttempt: Boolean = true) {
        retire()
        if (resetAttempt) attempt = RouteAttempt()
        if (context.packageManager.queryIntentServices(Intent("ai.pleos.playground.intent.action.NAVI_START"), 0).isEmpty()) {
            connection = NaviConnection.UNSUPPORTED
            connectionMessage = "Pleos 내비게이션 서비스가 없어요. Pleos Connect 에뮬레이터에서 연결해 주세요."
            return
        }
        connection = NaviConnection.CONNECTING; connectionMessage = "Pleos 내비게이션 연결 중"
        val owner = epoch
        try {
            val sdk = NaviHelper(context); helper = sdk
            val events = object : NaviHelperEventListener {
                private fun routingCompleted() = onMain(owner) {
                    if (attempt.phase == RoutePhase.REQUESTING) {
                        attempt = attempt.completed()
                        guarded { sdk.getDestinationInfo() }
                    }
                }
                override fun onRoutingCompleted() = routingCompleted()
                // Connect 2.1.0 Navigation emits this legacy completion event.
                // Both callbacks mean search completion; neither alone proves the destination.
                @Suppress("OVERRIDE_DEPRECATION")
                override fun onRouteEnded() = routingCompleted()
                override fun onDestinationInfo(destinationInfo: DestinationInfo) = onMain(owner) {
                    if (attempt.phase == RoutePhase.CHECKING_DESTINATION) {
                        attempt = runCatching { attempt.destination(Coordinate(destinationInfo.latitude, destinationInfo.longitude)) }
                            .getOrElse { attempt.failed("내비게이션에서 유효하지 않은 목적지 좌표를 받았어요.") }
                        finishBackgroundAttempt()
                    }
                }
                override fun onRouteStateInfo(routeStateInfo: RouteStateInfo) = onMain(owner) { probePending = false }
                override fun onRouteCancelled() = onMain(owner) {
                    attempt = attempt.cancelled()
                    finishBackgroundAttempt()
                }
                override fun onDestinationChanged() = onMain(owner) {
                    // A confirmed result is only valid until the shared navigation destination changes.
                    if (attempt.phase == RoutePhase.CONFIRMED) attempt = attempt.failed("내비게이션 목적지가 변경됐어요. 다시 확인해 주세요.")
                }
                override fun onError(errorCode: NaviErrorCode) = onMain(owner) {
                    fail("내비게이션 오류: ${errorCode.name}")
                }
            }
            listener = events
            sdk.initialize(onConnected = {
                onMain(owner) {
                    guarded {
                        sdk.addListener(events)
                        connection = NaviConnection.READY; connectionMessage = "Pleos SDK 연결됨"
                        flushHandoff()
                        heartbeat(owner)
                    }
                }
            }, onFailed = { onMain(owner) { fail("Pleos 서비스 연결에 실패했어요. 에뮬레이터와 권한을 확인해 주세요.") } })
            handler.postDelayed({ if (owner == epoch && connection == NaviConnection.CONNECTING) fail("Pleos 연결 시간이 초과됐어요.") }, 30_000)
        } catch (_: SecurityException) { fail("Pleos 내비게이션 권한이 허용되지 않았어요.") }
          catch (_: Exception) { fail("Pleos SDK 초기화에 실패했어요.") }
    }
    private fun heartbeat(owner: Int) {
        if (owner != epoch || connection != NaviConnection.READY) return
        probePending = true
        guarded { helper?.getRouteStateInfo() }
        handler.postDelayed({
            if (owner == epoch && connection == NaviConnection.READY) {
                if (probePending) fail("Pleos 서비스 응답을 확인할 수 없어요. 다시 연결해 주세요.")
                else handler.postDelayed({ heartbeat(owner) }, 10_000)
            }
        }, 8_000)
    }
    private fun guarded(block: () -> Unit) {
        try { block() }
        catch (_: SecurityException) { fail("Pleos 내비게이션 권한이 허용되지 않았어요.") }
        catch (_: Exception) { fail("Pleos 요청에 실패했어요. 다시 연결해 주세요.") }
    }
    fun request(place: Place, simulatedRestricted: Boolean) {
        if (!routeTestingEnabled || !interactionAllowed(automotive, realRestricted, simulatedRestricted) ||
            connection != NaviConnection.READY || attempt.pending) return
        val position = place.coordinate ?: return
        // A new attempt gets a fresh listener generation; previous terminal attempts require reconnect first.
        if (attempt.phase != RoutePhase.IDLE) return
        attempt = RouteAttempt.start(place)
        val owner = epoch
        guarded {
            helper!!.requestRoute(RouteInfo(latitude = position.latitude, longitude = position.longitude,
                poiName = place.name, poiId = "", address = "", poiSubId = ""))
        }
        handler.postDelayed({
            if (owner == epoch && attempt.pending) {
                attempt = attempt.timeout()
                retire(); connection = NaviConnection.FAILED
                connectionMessage = "경로 응답이 없어 연결을 정리했어요. 다시 연결한 후 재시도할 수 있어요."
                if (!visible) active = false
            }
        }, 25_000)
    }
}
