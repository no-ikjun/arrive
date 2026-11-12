package com.arrivetogether.domain

import org.junit.Assert.*
import org.junit.Test

class TripReducerTest {
    private fun advance(trip: Trip, action: TripAction): Trip =
        (TripReducer.apply(trip, action, true) as TripResult.Updated).trip

    private fun parkingTrip(): Trip = advance(advance(Trip("test"), TripAction.Start), TripAction.ConfirmDropoff)

    @Test fun `parking fallback keeps reunion point and excludes earlier choices`() {
        val original = parkingTrip()
        val changed = advance(original, TripAction.RejectParking)
        assertEquals(OryongDemo.parking[1].id, changed.parkingId)
        assertEquals(original.meetingPointId, changed.meetingPointId)
        assertTrue(original.parkingId in changed.excludedParkingIds)
        assertEquals(original.revision + 1, changed.revision)
    }

    @Test fun `exhausted candidates never loop back or allow parking confirmation`() {
        var trip = parkingTrip()
        repeat(OryongDemo.parking.size) { trip = advance(trip, TripAction.RejectParking) }
        assertEquals(OryongDemo.meeting.id, trip.meetingPointId)
        assertNull(trip.parkingId)
        assertEquals(OryongDemo.parking.size, trip.excludedParkingIds.size)
        assertTrue(TripReducer.apply(trip, TripAction.ConfirmParked, true) is TripResult.Rejected)
        assertTrue(TripReducer.apply(trip, TripAction.RejectParking, true) is TripResult.Rejected)
    }

    @Test fun `restricted state blocks every mutation`() {
        val trip = parkingTrip()
        listOf(TripAction.Start, TripAction.ConfirmDropoff, TripAction.RejectParking,
            TripAction.ConfirmParked, TripAction.ConfirmReunion, TripAction.Cancel).forEach {
            assertTrue(TripReducer.apply(trip, it, false) is TripResult.Rejected)
        }
    }

    @Test fun `cannot skip dropoff or assert reunion before parking`() {
        assertTrue(TripReducer.apply(Trip("test"), TripAction.ConfirmParked, true) is TripResult.Rejected)
        assertTrue(TripReducer.apply(parkingTrip(), TripAction.ConfirmReunion, true) is TripResult.Rejected)
    }

    @Test fun `complete trip is immutable and revision increments per accepted transition`() {
        var trip = parkingTrip()
        trip = advance(trip, TripAction.ConfirmParked)
        trip = advance(trip, TripAction.ConfirmReunion)
        assertEquals(TripStage.REUNITED, trip.stage)
        assertEquals(5, trip.revision)
        assertTrue(TripReducer.apply(trip, TripAction.Cancel, true) is TripResult.Rejected)
    }

    @Test fun `cancellation stops an active trip`() {
        val trip = advance(parkingTrip(), TripAction.Cancel)
        assertEquals(TripStage.CANCELLED, trip.stage)
        assertTrue(TripReducer.apply(trip, TripAction.ConfirmParked, true) is TripResult.Rejected)
    }
}
