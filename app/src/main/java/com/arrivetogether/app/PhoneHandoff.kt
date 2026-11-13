package com.arrivetogether.app

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@Composable
internal fun PhoneHandoffDialog(visit: VisitViewModel, close: () -> Unit) {
    LaunchedEffect(Unit) { visit.prepareHandoff() }
    val url = visit.handoffUrl
    val qr = remember(url) { url?.let { value -> runCatching {
        val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 384, 384)
        Bitmap.createBitmap(384, 384, Bitmap.Config.ARGB_8888).apply {
            setPixels(IntArray(384 * 384) { i -> if (matrix[i % 384, i / 384]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }, 0, 384, 0, 0, 384, 384)
        }.asImageBitmap()
    }.getOrNull() } }
    AlertDialog(onDismissRequest = close, title = { Text("휴대폰으로 이어가기") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("내리기 전에 QR을 스캔하세요. 입구 안내를 보고, 실제 만난 뒤 휴대폰에서 합류를 확인할 수 있어요.")
            if (qr != null) {
                Image(qr, "운전자 휴대폰 연결 QR", Modifier.size(260.dp))
                Text("이 QR에는 이번 방문의 합류 확인 권한이 있어요. 본인 휴대폰으로 연결하세요.")
            } else {
                Text(visit.handoffMessage.ifEmpty { "휴대폰 연결을 준비하고 있어요" })
                if (visit.handoffBusy) LinearProgressIndicator(Modifier.fillMaxWidth())
                else DriverButton("다시 연결", R.drawable.ic_retry) { visit.prepareHandoff() }
            }
        }
    }, confirmButton = { DriverButton("닫기", R.drawable.ic_close, onClick = close) })
}
