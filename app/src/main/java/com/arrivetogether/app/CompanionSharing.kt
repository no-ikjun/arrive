package com.arrivetogether.app

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@Composable
internal fun CompanionSharingDialog(visit: VisitViewModel, onDismiss: () -> Unit) {
    val url = visit.shareUrl
    val qr = remember(url) { url?.let { value -> runCatching {
        val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 384, 384)
        Bitmap.createBitmap(384, 384, Bitmap.Config.ARGB_8888).apply {
            setPixels(IntArray(384 * 384) { i -> if (matrix[i % 384, i / 384]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }, 0, 384, 0, 0, 384, 384)
        }.asImageBitmap()
    }.getOrNull() } }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("동승자 공유") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("휴대폰 카메라로 QR을 스캔하세요.")
            if (visit.connectionMessage.isNotEmpty()) Text(visit.connectionMessage)
            visit.state.notice?.let { Text(it) }
            when {
                AppConfiguration.companionBaseUrl == null -> Text("동승자 웹 주소를 설정하면 QR로 연결할 수 있어요. 현재 방문은 차량에 저장돼요.")
                !visit.shared -> {
                    Text("건물 입구 지도와 주차 상태를 공유합니다.")
                    DriverButton("QR 만들기", R.drawable.ic_share, Modifier.fillMaxWidth(), primary = true, enabled = visit.actionsAllowed && !visit.trip.terminal, onClick = visit::connectCompanion)
                }
                qr != null -> {
                    Image(qr, "arrive 동승자 연결 QR", Modifier.sizeIn(maxWidth = 280.dp, maxHeight = 280.dp).aspectRatio(1f))
                    Text("별도 앱 설치 없이 확인할 수 있어요.")
                    Text("링크는 방문 생성 후 24시간 동안 유효해요. 링크를 가진 사람은 이 방문의 진행 상황을 볼 수 있어요.")
                }
                url != null -> Text("QR을 표시하지 못했어요. 창을 닫고 다시 열어 주세요.")
                else -> Text("서버 연결이 완료되면 QR을 표시해요.")
            }
            if (visit.shared && !visit.state.unavailable) DriverButton("다시 연결", R.drawable.ic_retry, enabled = !visit.busy, onClick = visit::retry)
        }
    }, confirmButton = { DriverButton("닫기", R.drawable.ic_close, onClick = onDismiss) })
}
