package com.arrivetogether.domain

import org.junit.Assert.*
import org.junit.Test

class VisitSyncTest {
    @Test fun `acknowledging in flight event preserves later offline changes`() {
        val q = VisitQueue(Trip("local")).enqueue(TripAction.Start, "one", true)
            .enqueue(TripAction.ConfirmDropoff, "two", true)
        val ack = q.acknowledge("one", Trip("server", stage = TripStage.TO_DROPOFF, revision = 2))
        assertEquals(TripStage.TO_PARKING, ack.trip.stage)
        assertEquals("server", ack.trip.id)
        assertEquals(listOf(PendingChange("two", "CONFIRM_DROPOFF", 2)), ack.pending)
        val done = ack.acknowledge("two", ack.trip)
        assertTrue(done.pending.isEmpty())
        assertEquals(3, done.trip.revision)
    }
    @Test fun `wrong key or stale server revision cannot drop pending events`() {
        val q = VisitQueue(Trip("local")).enqueue(TripAction.Start, "one", true)
        assertThrows(IllegalArgumentException::class.java) { q.acknowledge("other", q.trip) }
        assertThrows(IllegalArgumentException::class.java) { q.acknowledge("one", q.trip.copy(revision = 1)) }
    }
    @Test fun `existing local visit can be shared after parking changes`() {
        var trip = Trip("local")
        val actions = listOf(TripAction.Start, TripAction.ConfirmDropoff, TripAction.RejectParking,
            TripAction.RejectParking, TripAction.ConfirmParked)
        actions.forEach { trip = (TripReducer.apply(trip, it, true) as TripResult.Updated).trip }
        assertEquals(actions, sharingHistory(trip))
        assertEquals(OryongDemo.meeting.id, trip.meetingPointId)
    }
    @Test fun `exhausted candidates preserve fixed meeting when migrating`() {
        var trip = Trip("local", stage = TripStage.TO_PARKING, revision = 3)
        repeat(4) { trip = (TripReducer.apply(trip, TripAction.RejectParking, true) as TripResult.Updated).trip }
        assertEquals(6, sharingHistory(trip).size)
        assertNull(trip.parking)
    }
    @Test fun `restricted and terminal changes never enter outbox`() {
        assertThrows(IllegalArgumentException::class.java) { VisitQueue(Trip("local")).enqueue(TripAction.Start, "one", false) }
        assertThrows(IllegalArgumentException::class.java) { sharingHistory(Trip("local", stage = TripStage.CANCELLED)) }
    }
}
