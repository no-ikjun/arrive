package com.arrivetogether.app

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.LocationManager
import android.os.*
import com.arrivetogether.domain.*
import kotlinx.coroutines.*

internal object ArrivalMonitor {
    fun permissions(): Array<String> = arrayOf(LOCATION_PERMISSION, Manifest.permission.ACCESS_COARSE_LOCATION) +
        if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.POST_NOTIFICATIONS) else emptyArray()
    fun permitted(context: Context) = permissions().all { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED } &&
        context.getSystemService(NotificationManager::class.java).areNotificationsEnabled() &&
        context.getSystemService(LocationManager::class.java).isLocationEnabled
    fun driving(trip: Trip) = trip.stage in listOf(TripStage.TO_DROPOFF, TripStage.TO_PARKING) && navigationTarget(trip) != null
    // Called only from the visible activity, before handing foreground to navigation.
    fun update(context: Context, trip: Trip) {
        val telemetry = VehicleTelemetry.get(context.applicationContext as Application)
        telemetry.setTrip(trip)
        if (!driving(trip) || !permitted(context)) {
            context.stopService(Intent(context, ArrivalMonitorService::class.java))
            telemetry.monitorMessage = if (driving(trip)) "내비 사용 중 도착 안내를 받으려면 알림과 위치를 허용해 주세요" else ""
            return
        }
        try {
            context.startForegroundService(Intent(context, ArrivalMonitorService::class.java)
                .putExtra("tripId", trip.id).putExtra("stage", trip.stage.name).putExtra("parkingId", trip.parkingId))
            telemetry.monitorMessage = "내비 사용 중에도 도착 안내 · 알림을 누르면 arrive로 돌아와요"
        } catch (_: Exception) { telemetry.monitorMessage = "도착 알림을 시작하지 못했어요. 정차 후 arrive를 다시 열어 주세요" }
    }
}

/** Foreground location service; no background-start, restart, boot receiver or automatic trip writes. */
class ArrivalMonitorService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var telemetry: VehicleTelemetry
    private lateinit var notifications: NotificationManager
    private var trip: Trip? = null
    private var restrictions: AutomotiveRestrictions? = null
    private var restricted: Boolean? = null
    private var lastContent = ""
    private var lastTripId: String? = null
    private val notified = mutableSetOf<String>()
    private val started = SystemClock.elapsedRealtime()
    override fun onBind(intent: Intent?) = null
    override fun onCreate() {
        super.onCreate()
        telemetry = VehicleTelemetry.get(application)
        notifications = getSystemService(NotificationManager::class.java)
        notifications.createNotificationChannel(NotificationChannel("arrive-visit", "진행 중인 방문", NotificationManager.IMPORTANCE_LOW))
        notifications.createNotificationChannel(NotificationChannel("arrive-arrival", "하차·주차 지점 도착", NotificationManager.IMPORTANCE_DEFAULT))
        if (packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) {
            runCatching { restrictions = AutomotiveRestrictions(this) { restricted = it }.also { it.start() } }
        } else restricted = false
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "stop") { telemetry.monitorMessage = "도착 알림을 껐어요. 정차 후 arrive에서 이어갈 수 있어요"; stopSelf(); return START_NOT_STICKY }
        val incoming = runCatching {
            Trip(requireNotNull(intent?.getStringExtra("tripId")), TripStage.valueOf(requireNotNull(intent.getStringExtra("stage"))),
                intent.getStringExtra("parkingId"))
        }.getOrNull()
        if (incoming == null || !ArrivalMonitor.driving(incoming) || !ArrivalMonitor.permitted(this)) { stopSelf(); return START_NOT_STICKY }
        if (trip?.stage != incoming.stage || trip?.parkingId != incoming.parkingId) notifications.cancel(411)
        trip = incoming
        if (lastTripId != incoming.id) { notified.clear(); lastTripId = incoming.id }
        telemetry.setTrip(incoming)
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(410, ongoing("방문 안내를 이어가고 있어요"), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            else startForeground(410, ongoing("방문 안내를 이어가고 있어요"))
        } catch (_: Exception) { telemetry.monitorMessage = "도착 알림을 시작하지 못했어요. arrive에서 수동으로 확인해 주세요"; stopSelf(); return START_NOT_STICKY }
        lastContent = "" // Refresh the ongoing message after startForeground replaces it.
        if (!telemetry.serviceRunning) {
            telemetry.setService(true)
            scope.launch {
                while (isActive) {
                    if (!ArrivalMonitor.permitted(this@ArrivalMonitorService) || SystemClock.elapsedRealtime() - started > 2 * 60 * 60 * 1000L) {
                        telemetry.monitorMessage = "도착 알림이 종료됐어요. arrive를 열어 다시 연결해 주세요"; stopSelf(); break
                    }
                    val current = trip ?: break
                    val cue = telemetry.cue
                    val label = when (cue) {
                        ArrivalCue.CONFIRM_DROPOFF -> "하차 지점 근처예요 · 정차 후 하차를 확인하세요"
                        ArrivalCue.CONFIRM_PARKED -> "주차장 근처예요 · 주차를 마쳤다면 확인하세요"
                        else -> if (telemetry.freshFix == null) "차량 위치 확인 중 · 눌러서 방문으로 돌아가기" else "${navigationTarget(current)?.name} 안내 중 · 눌러서 돌아가기"
                    }
                    if (label != lastContent) { lastContent = label; notifications.notify(410, ongoing(label)) }
                    val key = "${current.id}:${current.stage}:${current.parkingId}"
                    if (cue in listOf(ArrivalCue.CONFIRM_DROPOFF, ArrivalCue.CONFIRM_PARKED) && restricted == false && notified.add(key)) {
                        notifications.notify(411, Notification.Builder(this@ArrivalMonitorService, "arrive-arrival")
                            .setSmallIcon(R.drawable.ic_car).setContentTitle("arrive · 도착 확인")
                            .setContentText(label).setContentIntent(openVisit()).setAutoCancel(true)
                            .setCategory(Notification.CATEGORY_NAVIGATION).build())
                    }
                    delay(1_000)
                }
            }
        }
        return START_NOT_STICKY
    }
    private fun openVisit() = PendingIntent.getActivity(this, 410,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun ongoing(message: String): Notification = Notification.Builder(this, "arrive-visit")
        .setSmallIcon(R.drawable.ic_car).setContentTitle("arrive · 방문 진행 중").setContentText(message)
        .setContentIntent(openVisit()).setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_STATUS)
        .addAction(Notification.Action.Builder(null, "도착 알림 끄기", PendingIntent.getService(this, 412,
            Intent(this, ArrivalMonitorService::class.java).setAction("stop"), PendingIntent.FLAG_IMMUTABLE)).build()).build()
    override fun onDestroy() {
        scope.cancel(); restrictions?.stop(); telemetry.setService(false)
        notifications.cancel(411); stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
