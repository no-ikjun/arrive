package com.arrivetogether.app

import android.app.Application
import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.compose.runtime.*

import ai.pleos.playground.location.fused.FusedLocation
import ai.pleos.playground.location.fused.listener.FusedLocationListener
import ai.pleos.playground.location.fused.model.LocationData
import com.arrivetogether.domain.*
import kotlinx.coroutines.*

internal const val LOCATION_PERMISSION = "pleos.car.permission.FUSED_LOCATION"

/** One process-scoped sensor connection shared by the visible screen and active-visit service. */
class VehicleTelemetry private constructor(application: Application) {
    companion object {
        private var instance: VehicleTelemetry? = null
        fun get(application: Application): VehicleTelemetry = instance ?: VehicleTelemetry(application).also { instance = it }
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var visible = false
    internal var serviceRunning by mutableStateOf(false); private set
    internal var monitorMessage by mutableStateOf("")
    private var trip: Trip? = null
    private val assist = ArrivalAssist()
    internal var cue by mutableStateOf(ArrivalCue.NONE); private set
    internal fun setVisible(value: Boolean) { visible = value; reconcile() }
    internal fun setTrip(value: Trip) { trip = value; updateCue(); reconcile() }
    internal fun setService(value: Boolean) { serviceRunning = value; reconcile() }
    private fun reconcile() {
        if (serviceRunning || (visible && trip?.stage in listOf(TripStage.PLANNED, TripStage.TO_DROPOFF, TripStage.TO_PARKING))) start() else stop()
    }
    private fun updateCue() { cue = trip?.let { assist.evaluate(it, fix, gear, now) } ?: ArrivalCue.NONE }

    private val context = application
    internal var fix by mutableStateOf<VehicleFix?>(null); private set
    internal var gear by mutableStateOf<ParkObservation?>(null); private set
    internal var now by mutableLongStateOf(SystemClock.elapsedRealtime()); private set
    internal var locationStatus by mutableStateOf("차량 위치 연결 전"); private set
    internal var gearStatus by mutableStateOf("변속 상태 연결 전"); private set
    internal var needsPermission by mutableStateOf(false); private set
    private var sdk: FusedLocation? = null
    private var listener: FusedLocationListener? = null
    private var car: Car? = null
    private var properties: CarPropertyManager? = null
    private var generation = 0
    private var active = false
    private var polling: Job? = null
    private val handler = Handler(Looper.getMainLooper())
    private var lastSourceTime = 0L
    internal val freshFix: VehicleFix? get() = fix?.takeIf { now - it.observedAt in 0..10_000 }

    internal fun start() {
        if (active) return
        active = true
        val owner = ++generation
        now = SystemClock.elapsedRealtime()
        gearStatus = "변속 상태 확인 중"
        startLocation(owner)
        if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) {
            try {
                car = Car.createCar(context, handler, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connected, ready ->
                    if (!active || owner != generation) return@createCar
                    properties = if (ready) runCatching { connected.getCarManager(Car.PROPERTY_SERVICE) as CarPropertyManager }.getOrNull() else null
                    if (properties == null) { gear = null; gearStatus = "변속 상태를 받지 못했어요" }
                }
            } catch (_: Exception) { gearStatus = "변속 상태를 지원하지 않아요" }
              catch (_: LinkageError) { gearStatus = "변속 상태를 지원하지 않아요" }
        } else gearStatus = "차량에서 변속 상태를 확인해요"
        polling = scope.launch {
            while (active && owner == generation) {
                now = SystemClock.elapsedRealtime()
                val manager = properties
                val value = if (manager == null) null else withContext(Dispatchers.IO) {
                    runCatching { manager.getProperty(Int::class.javaObjectType, VehiclePropertyIds.GEAR_SELECTION, 0) }
                        .getOrNull()?.takeIf { it.status == CarPropertyValue.STATUS_AVAILABLE }?.value
                }
                if (!active || owner != generation) break
                now = SystemClock.elapsedRealtime()
                gear = value?.let { ParkObservation(it == VehicleGear.GEAR_PARK, now) }
                if (manager != null) gearStatus = when (value) {
                    null -> "변속 상태를 받지 못했어요"
                    VehicleGear.GEAR_PARK -> "P 확인됨"
                    else -> "P 이외의 변속 상태"
                }
                updateCue()
                delay(1_000)
            }
        }
    }
    private fun startLocation(owner: Int) {
        needsPermission = false
        try {
            val location = FusedLocation(context)
            if (!location.isSupported()) { locationStatus = "차량 위치 서비스를 지원하지 않아요"; return }
            needsPermission = context.checkSelfPermission(LOCATION_PERMISSION) != PackageManager.PERMISSION_GRANTED
            if (needsPermission) { locationStatus = "차량 위치 허용 필요"; return }
            sdk = location
            val callback = object : FusedLocationListener {
                override fun onChanged(location: LocationData?) {
                    handler.post {
                        if (!active || owner != generation) return@post
                        // Never turn a cached/replayed fix into a fresh observation.
                        val age = location?.let { System.currentTimeMillis() - it.timestampMillis }
                        val coordinate = location?.let { runCatching { Coordinate(it.latitude, it.longitude) }.getOrNull() }
                        if (location == null || coordinate == null || age == null || age !in 0..10_000) {
                            fix = null; locationStatus = "새 차량 위치를 기다리는 중"; return@post
                        }
                        if (location.timestampMillis <= lastSourceTime) return@post
                        lastSourceTime = location.timestampMillis
                        now = SystemClock.elapsedRealtime()
                        fix = VehicleFix(coordinate, now - age)
                        locationStatus = "Pleos 차량 위치 수신 중"
                    }
                }
                override fun onError(exception: Exception) {
                    handler.post { if (active && owner == generation) { fix = null; locationStatus = "차량 위치를 받지 못했어요 · 권한·위치 설정 확인" } }
                }
            }
            listener = callback
            location.initialize()
            location.registerFusedLocationCallback(callback)
            locationStatus = "새 차량 위치를 기다리는 중"
        } catch (_: Exception) { locationStatus = "차량 위치 연결 실패 · 다시 연결해 주세요" }
          catch (_: LinkageError) { locationStatus = "차량 위치 서비스를 지원하지 않아요" }
    }
    internal fun restart() { stop(); reconcile() }
    internal fun stop() {
        active = false; generation++; polling?.cancel(); polling = null
        listener?.let { runCatching { sdk?.unregisterFusedLocationCallback(it) } }
        runCatching { sdk?.release() }; sdk = null; listener = null
        runCatching { car?.disconnect() }; car = null; properties = null
        fix = null; gear = null; lastSourceTime = 0; cue = ArrivalCue.NONE; assist.reset()
        handler.removeCallbacksAndMessages(null)
    }

}
