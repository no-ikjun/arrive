import { applyTripEvent, initialTrip, type TripEvent, type TripState } from './trip';

const parking = ['parking-oryong-demo', 'parking-football-demo', 'parking-dorm-demo'];
const meeting = 'meeting-demo';

function advance(state: TripState, event: TripEvent): TripState {
  const result = applyTripEvent(state, event, parking);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

function parkingTrip(): TripState {
  return advance(advance(initialTrip(meeting, parking[0]), 'START'), 'CONFIRM_DROPOFF');
}

describe('applyTripEvent', () => {
  it('parking fallback keeps reunion point and excludes earlier choices', () => {
    const original = parkingTrip();
    const changed = advance(original, 'REJECT_PARKING');
    expect(changed.parkingId).toBe(parking[1]);
    expect(changed.meetingPointId).toBe(original.meetingPointId);
    expect(changed.excludedParkingIds).toContain(original.parkingId);
    expect(changed.revision).toBe(original.revision + 1);
    expect(changed.stage).toBe('TO_PARKING');
  });

  it('exhausted candidates never loop back or allow parking confirmation', () => {
    let trip = parkingTrip();
    for (let i = 0; i < 3; i += 1) trip = advance(trip, 'REJECT_PARKING');
    expect(trip.parkingId).toBeNull();
    expect(trip.excludedParkingIds).toHaveLength(3);
    expect(trip.meetingPointId).toBe(meeting);
    expect(applyTripEvent(trip, 'CONFIRM_PARKED', parking).ok).toBe(false);
    expect(applyTripEvent(trip, 'REJECT_PARKING', parking).ok).toBe(false);
  });

  it('cannot skip dropoff or assert reunion before parking', () => {
    expect(applyTripEvent(initialTrip(meeting, parking[0]), 'CONFIRM_PARKED', parking).ok).toBe(false);
    expect(applyTripEvent(parkingTrip(), 'CONFIRM_REUNION', parking).ok).toBe(false);
  });

  it('complete trip is immutable and revision increments per accepted transition', () => {
    let trip = parkingTrip();
    trip = advance(trip, 'CONFIRM_PARKED');
    trip = advance(trip, 'CONFIRM_REUNION');
    expect(trip.stage).toBe('REUNITED');
    expect(trip.revision).toBe(5);
    const rejected = applyTripEvent(trip, 'CANCEL', parking);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe('terminal');
  });

  it('cancellation stops an active trip', () => {
    const trip = advance(parkingTrip(), 'CANCEL');
    expect(trip.stage).toBe('CANCELLED');
    expect(applyTripEvent(trip, 'CONFIRM_PARKED', parking).ok).toBe(false);
  });

  it('does not change the original state when a transition is rejected', () => {
    const original = initialTrip(meeting, parking[0]);
    applyTripEvent(original, 'CONFIRM_DROPOFF', parking);
    expect(original.stage).toBe('PLANNED');
    expect(original.revision).toBe(1);
  });
});
