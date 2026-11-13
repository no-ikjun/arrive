package com.arrivetogether.domain

import org.junit.Assert.*
import org.junit.Test

class ArrivalAssistTest {
    private val dropoff = Trip("visit", stage = TripStage.TO_DROPOFF)
    private fun fix(trip: Trip, now: Long) = VehicleFix(navigationTarget(trip)!!.coordinate!!, now)
    private fun evaluate(policy: ArrivalAssist, trip: Trip, now: Long, park: Boolean = true) =
        policy.evaluate(trip, fix(trip, now), ParkObservation(park, now), now)

    @Test fun `requires continuous six seconds in P and near selected point`() {
        val policy = ArrivalAssist()
        for (t in 0L..5_000L step 1_000) assertEquals(ArrivalCue.NEARBY, evaluate(policy, dropoff, t))
        assertEquals(ArrivalCue.CONFIRM_DROPOFF, evaluate(policy, dropoff, 6_000))
        assertEquals(TripStage.TO_DROPOFF, dropoff.stage)
    }
    @Test fun `P away from the venue never implies arrival`() {
        val policy = ArrivalAssist()
        val away = VehicleFix(Coordinate(37.5, 127.0), 8_000)
        assertEquals(ArrivalCue.NONE, policy.evaluate(dropoff, away, ParkObservation(true, 8_000), 8_000))
    }
    @Test fun `stale future and missing location reset dwell`() {
        for (bad in listOf(null, fix(dropoff, 0), fix(dropoff, 20_000))) {
            val policy = ArrivalAssist()
            for (t in 0L..6_000L step 1_000) evaluate(policy, dropoff, t)
            assertEquals(ArrivalCue.NONE, policy.evaluate(dropoff, bad, ParkObservation(true, 12_000), 12_000))
            assertEquals(ArrivalCue.NEARBY, evaluate(policy, dropoff, 13_000))
        }
    }
    @Test fun `leaving P stale gear and interruptions restart six seconds`() {
        val policy = ArrivalAssist()
        for (t in 0L..6_000L step 1_000) evaluate(policy, dropoff, t)
        assertEquals(ArrivalCue.NEARBY, evaluate(policy, dropoff, 7_000, false))
        assertEquals(ArrivalCue.NEARBY, evaluate(policy, dropoff, 8_000))
        assertEquals(ArrivalCue.NEARBY, policy.evaluate(dropoff, fix(dropoff, 9_000), ParkObservation(true, 0), 9_000))
        for (t in 10_000L..16_000L step 1_000) evaluate(policy, dropoff, t)
        assertEquals(ArrivalCue.NEARBY, evaluate(policy, dropoff, 20_000))
    }
    @Test fun `changing target visit or walking stage cannot inherit arrival`() {
        val policy = ArrivalAssist()
        for (t in 0L..6_000L step 1_000) evaluate(policy, dropoff, t)
        val parking = dropoff.copy(stage = TripStage.TO_PARKING)
        assertEquals(ArrivalCue.NEARBY, evaluate(policy, parking, 7_000))
        for (t in 8_000L..13_000L step 1_000) evaluate(policy, parking, t)
        assertEquals(ArrivalCue.CONFIRM_PARKED, evaluate(policy, parking, 14_000))
        assertEquals(ArrivalCue.NEARBY, evaluate(policy, parking.copy(id = "other"), 15_000))
        assertEquals(ArrivalCue.NONE, policy.evaluate(parking.copy(stage = TripStage.WALKING_TO_MEETING), fix(parking, 16_000), ParkObservation(true, 16_000), 16_000))
    }
    @Test fun `hysteresis tolerates small boundary noise but exits at 65 meters`() {
        val p = navigationTarget(dropoff)!!.coordinate!!
        fun point(meters: Double, time: Long) = VehicleFix(p.copy(latitude = p.latitude + meters / 111_195.0), time)
        val policy = ArrivalAssist()
        assertEquals(ArrivalCue.NONE, policy.evaluate(dropoff, point(50.0, 0), null, 0))
        assertEquals(ArrivalCue.NEARBY, policy.evaluate(dropoff, point(40.0, 1_000), null, 1_000))
        assertEquals(ArrivalCue.NEARBY, policy.evaluate(dropoff, point(50.0, 2_000), null, 2_000))
        assertEquals(ArrivalCue.NONE, policy.evaluate(dropoff, point(70.0, 3_000), null, 3_000))
    }
    @Test fun `wrong parking and missing gear cannot produce parking confirmation`() {
        val trip = dropoff.copy(stage = TripStage.TO_PARKING)
        val policy = ArrivalAssist()
        for (t in 0L..8_000L step 1_000) {
            assertEquals(ArrivalCue.NEARBY, policy.evaluate(trip, fix(trip, t), null, t))
            assertEquals(ArrivalCue.NONE, policy.evaluate(trip,
                VehicleFix(OryongDemo.parking.last().coordinate!!, t), ParkObservation(true, t), t))
        }
    }
    @Test fun `handoff is one shot and only follows explicit accepted transition`() {
        val queue = RouteHandoff()
        assertTrue(queue.update(dropoff, false, 0))
        assertNull(queue.take(1, true, true))
        val parking = dropoff.copy(stage = TripStage.TO_PARKING)
        assertTrue(queue.update(parking, true, 2))
        assertFalse(queue.update(parking, false, 3))
        assertNull(queue.take(4, false, true))
        assertEquals(parking.parking, queue.take(5, true, true))
        assertNull(queue.take(6, true, true))
    }
    @Test fun `handoff expires cancels and never routes to a changed or walking target`() {
        for (cancel in listOf("expire", "restrict", "background", "remote", "walking")) {
            val queue = RouteHandoff(); queue.update(dropoff, true, 0)
            when (cancel) {
                "expire" -> assertNull(queue.take(10_000, true, true))
                "restrict" -> assertNull(queue.take(1, true, false))
                "background" -> queue.cancel()
                "remote" -> queue.update(dropoff.copy(id = "other"), false, 1)
                "walking" -> queue.update(dropoff.copy(stage = TripStage.WALKING_TO_MEETING), true, 1)
            }
            assertNull(queue.take(if (cancel == "expire") 10_001 else 2, true, true))
        }
    }
}
