package com.arrivetogether.domain

import org.junit.Assert.*
import org.junit.Test

class CatalogTest {
    @Test fun `image coordinates remain unverified and retain the selected locations`() {
        assertEquals("DEMO_UNVERIFIED", OryongDemo.verification)
        assertEquals("oryong-demo-v2", OryongDemo.catalogVersion)
        val points = listOf(OryongDemo.dropoff, OryongDemo.meeting) + OryongDemo.parking
        assertEquals(6, points.map { it.id }.toSet().size)
        points.forEach {
            val c = requireNotNull(it.coordinate)
            assertTrue(c.latitude in 35.224..35.2285)
            assertTrue(c.longitude in 126.8365..126.841)
        }
        assertEquals(Coordinate(35.22648, 126.83947), OryongDemo.meeting.coordinate)
        assertTrue(OryongDemo.parking[0].coordinate!!.longitude > OryongDemo.parking[1].coordinate!!.longitude)
        assertTrue(OryongDemo.dropoff.coordinate!!.latitude > OryongDemo.meeting.coordinate!!.latitude)
        assertTrue(OryongDemo.parking[2].coordinate!!.latitude < OryongDemo.meeting.coordinate!!.latitude)
    }

    @Test fun `invalid coordinates cannot enter the model`() {
        listOf(91.0 to 126.0, 35.0 to 181.0, Double.NaN to 126.0, 35.0 to Double.POSITIVE_INFINITY).forEach { (lat, lon) ->
            assertThrows(IllegalArgumentException::class.java) { Coordinate(lat, lon) }
        }
    }
}
