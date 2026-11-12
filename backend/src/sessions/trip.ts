export const TRIP_STAGES = [
  'PLANNED',
  'TO_DROPOFF',
  'TO_PARKING',
  'WALKING_TO_MEETING',
  'REUNITED',
  'CANCELLED',
] as const;

export type TripStage = (typeof TRIP_STAGES)[number];

export const TRIP_EVENTS = [
  'START',
  'CONFIRM_DROPOFF',
  'REJECT_PARKING',
  'CONFIRM_PARKED',
  'CONFIRM_REUNION',
  'CANCEL',
] as const;

export type TripEvent = (typeof TRIP_EVENTS)[number];

export interface TripState {
  stage: TripStage;
  parkingId: string | null;
  excludedParkingIds: string[];
  meetingPointId: string;
  revision: number;
}

export type TripApplyResult =
  | { ok: true; state: TripState }
  | { ok: false; reason: 'terminal' | 'invalid' };

export function initialTrip(meetingPointId: string, firstParkingId: string): TripState {
  return {
    stage: 'PLANNED',
    parkingId: firstParkingId,
    excludedParkingIds: [],
    meetingPointId,
    revision: 1,
  };
}

export function applyTripEvent(
  state: TripState,
  event: TripEvent,
  parkingOrder: readonly string[],
): TripApplyResult {
  if (state.stage === 'REUNITED' || state.stage === 'CANCELLED') {
    return { ok: false, reason: 'terminal' };
  }

  let next: TripState | undefined;
  switch (event) {
    case 'START':
      if (state.stage === 'PLANNED') next = { ...state, stage: 'TO_DROPOFF' };
      break;
    case 'CONFIRM_DROPOFF':
      if (state.stage === 'TO_DROPOFF') next = { ...state, stage: 'TO_PARKING' };
      break;
    case 'REJECT_PARKING':
      if (state.stage === 'TO_PARKING' && state.parkingId !== null) {
        const excluded = [...state.excludedParkingIds, state.parkingId];
        next = {
          ...state,
          excludedParkingIds: excluded,
          parkingId: parkingOrder.find((id) => !excluded.includes(id)) ?? null,
        };
      }
      break;
    case 'CONFIRM_PARKED':
      if (state.stage === 'TO_PARKING' && state.parkingId !== null) {
        next = { ...state, stage: 'WALKING_TO_MEETING' };
      }
      break;
    case 'CONFIRM_REUNION':
      if (state.stage === 'WALKING_TO_MEETING') next = { ...state, stage: 'REUNITED' };
      break;
    case 'CANCEL':
      next = { ...state, stage: 'CANCELLED' };
      break;
    default:
      next = undefined;
  }

  if (!next) return { ok: false, reason: 'invalid' };
  return { ok: true, state: { ...next, revision: state.revision + 1 } };
}
