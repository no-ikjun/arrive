package com.arrivetogether.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val ArriveBackground = Color(0xFFF3F4F6)
internal val ArriveInk = Color(0xFF181A1E)
internal val ArrivePanel = Color.White
internal val ArriveMuted = Color(0xFF626872)
internal val ArriveLine = Color(0xFFD6D9DF)
internal val ArriveWarning = Color(0xFF85520F)

/** Text always accompanies action icons; shape and fill also distinguish priority. */
@Composable
internal fun DriverButton(label: String, icon: Int, modifier: Modifier = Modifier, primary: Boolean = false,
                          enabled: Boolean = true, prominent: Boolean = false, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled,
        modifier = modifier.heightIn(min = if (prominent) 104.dp else 80.dp).widthIn(min = 80.dp), shape = RoundedCornerShape(12.dp),
        border = if (primary) null else BorderStroke(1.5.dp, if (enabled) Color(0xFF969CA5) else ArriveLine),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (primary) ArriveInk else ArrivePanel,
            contentColor = if (primary) Color.White else ArriveInk,
            disabledContainerColor = Color(0xFFE6E8EC), disabledContentColor = Color(0xFF777D86)),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp)) {
        Icon(painterResource(icon), null, Modifier.size(if (prominent) 40.dp else 32.dp))
        Spacer(Modifier.width(12.dp))
        Text(label, fontSize = if (prominent) 30.sp else 24.sp, lineHeight = if (prominent) 38.sp else 32.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
internal fun SmallLabel(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier, color = ArriveMuted, fontSize = 17.sp, lineHeight = 24.sp)
}
