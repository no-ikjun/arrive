package com.arrivetogether.app

import com.arrivetogether.domain.OryongDemo
import com.arrivetogether.domain.Place

/** Presentation data belongs to the selected venue, not to the arrive brand. */
internal data class VisitPlace(val name: String, val dropoff: Place, val meeting: Place, val notice: String, val parkingCandidates: List<Place>) {
    // Short labels are local to this visit; full names remain in place details and navigation.
    fun localName(place: Place): String = place.name
        .removePrefix("$name ")
        .removePrefix("${name.substringAfterLast(' ')} ")
        .removeSuffix(" 만남 지점")
}

// One pilot venue is supported. Future selection must also switch the trip's server catalog.
internal val currentVisitPlace = VisitPlace(OryongDemo.name, OryongDemo.dropoff, OryongDemo.meeting, OryongDemo.notice, OryongDemo.parking)
