package com.arrivetogether.domain

import org.junit.Assert.*
import org.junit.Test

class NavigationTest {
    @Test fun `replacement cancellation stays pending and still needs completion and matching destination`() {
        val pending = RouteAttempt.start(OryongDemo.parking.first()).cancelled()
        assertTrue(pending.pending)
        assertEquals(RoutePhase.REQUESTING, pending.destination(OryongDemo.parking.first().coordinate!!).phase)
        val confirmed = pending.completed().destination(OryongDemo.parking.first().coordinate!!)
        assertEquals(RoutePhase.CONFIRMED, confirmed.phase)
        assertEquals(RoutePhase.FAILED, confirmed.cancelled().phase)
        assertEquals(RoutePhase.TIMED_OUT, pending.timeout().phase)
        assertEquals(RoutePhase.FAILED, pending.completed().destination(OryongDemo.dropoff.coordinate!!).phase)
    }
    @Test fun `sending and even completion cannot claim destination match`() {
        val sent = RouteAttempt.start(OryongDemo.dropoff)
        assertEquals(RoutePhase.REQUESTING, sent.phase)
        assertEquals(sent, sent.destination(OryongDemo.dropoff.coordinate!!))
        assertEquals(RoutePhase.CHECKING_DESTINATION, sent.completed().phase)
        assertEquals(RoutePhase.CONFIRMED, sent.completed().destination(OryongDemo.dropoff.coordinate!!).phase)
    }
    @Test fun `duplicate legacy and current completion preserve destination check and terminal result`() {
        val checking = RouteAttempt.start(OryongDemo.dropoff).completed()
        assertEquals(checking, checking.completed())
        val confirmed = checking.destination(OryongDemo.dropoff.coordinate!!)
        assertEquals(confirmed, confirmed.completed())
        val failed = checking.destination(OryongDemo.meeting.coordinate!!)
        assertEquals(failed, failed.completed())
    }
    @Test fun `wrong destination or silence cannot become success`() {
        val sent = RouteAttempt.start(OryongDemo.dropoff)
        assertEquals(RoutePhase.FAILED, sent.completed().destination(OryongDemo.meeting.coordinate!!).phase)
        assertEquals(RoutePhase.TIMED_OUT, sent.timeout().phase)
        assertEquals(RoutePhase.TIMED_OUT, sent.completed().timeout().phase)
    }
    @Test fun `late callbacks after timeout or error cannot resurrect attempt`() {
        val expired = RouteAttempt.start(OryongDemo.dropoff).timeout()
        assertEquals(expired, expired.completed().destination(OryongDemo.dropoff.coordinate!!))
        val failed = RouteAttempt.start(OryongDemo.dropoff).failed("Disconnected")
        assertEquals(failed, failed.completed().destination(OryongDemo.dropoff.coordinate!!))
    }
    @Test fun `navigation target follows parking and stops when walking or exhausted`() {
        assertNull(navigationTarget(Trip("x")))
        assertEquals(OryongDemo.dropoff, navigationTarget(Trip("x", stage = TripStage.TO_DROPOFF)))
        assertEquals(OryongDemo.parking[1], navigationTarget(Trip("x", stage = TripStage.TO_PARKING, parkingId = OryongDemo.parking[1].id)))
        assertNull(navigationTarget(Trip("x", stage = TripStage.TO_PARKING, parkingId = null)))
        assertNull(navigationTarget(Trip("x", stage = TripStage.WALKING_TO_MEETING)))
        assertNull(navigationTarget(Trip("x", stage = TripStage.REUNITED)))
    }
    @Test fun `unknown automotive state stays blocked and simulator cannot override restriction`() {
        assertFalse(interactionAllowed(true, null, false))
        assertFalse(interactionAllowed(true, true, false))
        assertTrue(interactionAllowed(true, false, false))
        assertFalse(interactionAllowed(true, false, true))
        assertTrue(interactionAllowed(false, null, false))
    }
}
