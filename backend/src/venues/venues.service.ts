import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { APP_ENV, type AppEnv } from '../config/app-env';
import { ApiError } from '../common/api-error';
import { dataModeFor, type Venue, type VenuePoint } from './venue';

@Injectable()
export class VenuesService implements OnModuleInit {
  private venue!: Venue;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  onModuleInit(): void {
    const parsed = JSON.parse(readFileSync(this.env.venueCatalogPath, 'utf8')) as unknown;
    this.venue = validateVenue(parsed);
  }

  get catalog(): Venue {
    return this.venue;
  }

  getById(venueId: string): Venue {
    if (venueId !== this.venue.venueId) {
      throw new ApiError(404, 'NOT_FOUND', '장소를 찾을 수 없습니다.');
    }
    return structuredClone(this.venue);
  }
}

function validateVenue(value: unknown): Venue {
  if (!value || typeof value !== 'object') throw new Error('venue catalog must be an object');
  const venue = value as Venue;
  requireString(venue.venueId, 'venueId');
  requireString(venue.catalogVersion, 'catalogVersion');
  requireString(venue.name, 'name');
  requireString(venue.notice, 'notice');
  if (venue.verification !== 'DEMO_UNVERIFIED' && venue.verification !== 'VERIFIED') {
    throw new Error(`unsupported venue verification: ${String(venue.verification)}`);
  }
  assertPoint(venue.dropoff, 'dropoff');
  assertPoint(venue.meetingPoint, 'meetingPoint');
  if (!Array.isArray(venue.parkingCandidates) || venue.parkingCandidates.length < 1) {
    throw new Error('venue catalog needs at least one parking candidate');
  }
  venue.parkingCandidates.forEach((point, index) => assertPoint(point, `parkingCandidates[${index}]`));
  if (dataModeFor(venue.verification) === 'VERIFIED' && venue.verification !== 'VERIFIED') {
    throw new Error('refusing to promote unverified venue data');
  }
  return venue;
}

function assertPoint(point: VenuePoint, label: string): void {
  if (!point || typeof point !== 'object') throw new Error(`${label} is missing`);
  requireString(point.id, `${label}.id`);
  requireString(point.name, `${label}.name`);
  requireString(point.instructions, `${label}.instructions`);
  if (!('coordinate' in point)) throw new Error(`${label}.coordinate is missing`);
  if (point.coordinate !== null) {
    if (
      typeof point.coordinate !== 'object' ||
      typeof point.coordinate.latitude !== 'number' ||
      typeof point.coordinate.longitude !== 'number'
    ) {
      throw new Error(`${label}.coordinate is incomplete`);
    }
  }
  if (!('imageUrl' in point)) throw new Error(`${label}.imageUrl is missing`);
  if (point.imageUrl !== null && typeof point.imageUrl !== 'string') {
    throw new Error(`${label}.imageUrl must be a string or null`);
  }
}

function requireString(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}
