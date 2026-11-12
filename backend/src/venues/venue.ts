export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface VenuePoint {
  id: string;
  name: string;
  coordinate: Coordinate | null;
  instructions: string;
  imageUrl: string | null;
}

export interface Venue {
  venueId: string;
  catalogVersion: string;
  name: string;
  verification: 'DEMO_UNVERIFIED' | 'VERIFIED';
  notice: string;
  dropoff: VenuePoint;
  meetingPoint: VenuePoint;
  parkingCandidates: VenuePoint[];
}

/** Unverified catalog entries stay DEMO. Only an explicit VERIFIED label is accepted. */
export function dataModeFor(verification: string): 'DEMO' | 'VERIFIED' {
  return verification === 'VERIFIED' ? 'VERIFIED' : 'DEMO';
}
