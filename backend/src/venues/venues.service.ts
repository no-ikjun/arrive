import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../config/app-env';
import { ApiError } from '../common/api-error';
import { dataModeFor, type Venue, type VenuePoint, type VenueSummary } from './venue';

interface VenueEntry {
  venueId: string;
  currentVersion: string;
  versions: Map<string, Venue>;
}

@Injectable()
export class VenuesService implements OnModuleInit {
  private entries: VenueEntry[] = [];
  private byVenueId = new Map<string, VenueEntry>();

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  onModuleInit(): void {
    this.entries = this.env.venueCatalogIndexPath
      ? loadIndex(this.env.venueCatalogIndexPath)
      : loadSingle(this.env.venueCatalogPath);
    this.byVenueId = new Map(this.entries.map((entry) => [entry.venueId, entry]));
  }

  list(): VenueSummary[] {
    return this.entries.map((entry) => {
      const current = this.currentVenue(entry);
      return {
        venueId: current.venueId,
        catalogVersion: current.catalogVersion,
        name: current.name,
        verification: current.verification,
      };
    });
  }

  getById(venueId: string): Venue {
    const entry = this.byVenueId.get(venueId);
    if (!entry) throw new ApiError(404, 'NOT_FOUND', '장소를 찾을 수 없습니다.');
    return structuredClone(this.currentVenue(entry));
  }

  getVersion(venueId: string, catalogVersion: string): Venue {
    const venue = this.findExact(venueId, catalogVersion);
    if (!venue) throw new ApiError(404, 'NOT_FOUND', '요청한 장소 버전을 찾을 수 없습니다.');
    return venue;
  }

  requireForCreate(venueId: string, catalogVersion: string): Venue {
    const entry = this.byVenueId.get(venueId);
    if (!entry) throw new ApiError(404, 'NOT_FOUND', '장소를 찾을 수 없습니다.');
    const venue = entry.versions.get(catalogVersion);
    if (!venue) {
      throw new ApiError(400, 'INVALID_REQUEST', '알려진 장소의 카탈로그 버전이 올바르지 않습니다.');
    }
    return structuredClone(venue);
  }

  findExact(venueId: string, catalogVersion: string): Venue | undefined {
    const venue = this.byVenueId.get(venueId)?.versions.get(catalogVersion);
    return venue ? structuredClone(venue) : undefined;
  }

  private currentVenue(entry: VenueEntry): Venue {
    const current = entry.versions.get(entry.currentVersion);
    if (!current) throw new Error(`current version is not registered: ${entry.venueId}@${entry.currentVersion}`);
    return current;
  }
}

function loadSingle(catalogPath: string): VenueEntry[] {
  if (!catalogPath) throw new Error('venue catalog not found; set VENUE_CATALOG_PATH');
  const venue = readVenueFile(catalogPath);
  return [
    {
      venueId: venue.venueId,
      currentVersion: venue.catalogVersion,
      versions: new Map([[venue.catalogVersion, venue]]),
    },
  ];
}

function loadIndex(indexPath: string): VenueEntry[] {
  if (!existsSync(indexPath)) throw new Error(`venue catalog index not found: ${indexPath}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    throw new Error(`invalid venue catalog index: ${indexPath}`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { venues?: unknown }).venues)) {
    throw new Error('venue catalog index must contain a venues array');
  }

  const entries: VenueEntry[] = [];
  const venueIds = new Set<string>();
  for (const item of (parsed as { venues: unknown[] }).venues) {
    entries.push(readVenueEntry(indexPath, item, venueIds));
  }
  return entries;
}

function readVenueEntry(indexPath: string, item: unknown, venueIds: Set<string>): VenueEntry {
  if (!item || typeof item !== 'object') throw new Error('venue catalog index entry must be an object');
  const entry = item as { venueId?: unknown; currentVersion?: unknown; versions?: unknown };
  requireString(entry.venueId, 'venues.venueId');
  requireString(entry.currentVersion, 'venues.currentVersion');
  if (venueIds.has(entry.venueId)) throw new Error(`duplicate venue id: ${entry.venueId}`);
  venueIds.add(entry.venueId);
  if (!Array.isArray(entry.versions) || entry.versions.length === 0) {
    throw new Error(`venue catalog index needs at least one version: ${entry.venueId}`);
  }

  const versions = new Map<string, Venue>();
  for (const version of entry.versions) {
    if (!version || typeof version !== 'object') throw new Error('catalog version entry must be an object');
    const spec = version as { catalogVersion?: unknown; path?: unknown };
    requireString(spec.catalogVersion, 'versions.catalogVersion');
    requireString(spec.path, 'versions.path');
    if (versions.has(spec.catalogVersion)) {
      throw new Error(`duplicate catalog version: ${entry.venueId}@${spec.catalogVersion}`);
    }
    const venue = readVenueFile(path.resolve(path.dirname(indexPath), spec.path));
    if (venue.venueId !== entry.venueId || venue.catalogVersion !== spec.catalogVersion) {
      throw new Error(`catalog identity does not match index: ${entry.venueId}@${spec.catalogVersion}`);
    }
    versions.set(spec.catalogVersion, venue);
  }
  if (!versions.has(entry.currentVersion)) {
    throw new Error(`current version is not registered: ${entry.venueId}@${entry.currentVersion}`);
  }
  return { venueId: entry.venueId, currentVersion: entry.currentVersion, versions };
}

function readVenueFile(filePath: string): Venue {
  if (!existsSync(filePath)) throw new Error(`venue catalog file not found: ${filePath}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error(`invalid venue catalog file: ${filePath}`);
  }
  return validateVenue(parsed);
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
  assertUniquePointIds(venue);
  if (dataModeFor(venue.verification) === 'VERIFIED' && venue.verification !== 'VERIFIED') {
    throw new Error('refusing to promote unverified venue data');
  }
  return venue;
}

function assertUniquePointIds(venue: Venue): void {
  const ids = [venue.dropoff.id, venue.meetingPoint.id, ...venue.parkingCandidates.map((point) => point.id)];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`duplicate point id: ${id}`);
    seen.add(id);
  }
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
    if (
      !Number.isFinite(point.coordinate.latitude) ||
      point.coordinate.latitude < -90 ||
      point.coordinate.latitude > 90
    ) {
      throw new Error(`${label}.coordinate.latitude is out of range`);
    }
    if (
      !Number.isFinite(point.coordinate.longitude) ||
      point.coordinate.longitude < -180 ||
      point.coordinate.longitude > 180
    ) {
      throw new Error(`${label}.coordinate.longitude is out of range`);
    }
  }
  if (!('imageUrl' in point)) throw new Error(`${label}.imageUrl is missing`);
  if (point.imageUrl !== null && typeof point.imageUrl !== 'string') {
    throw new Error(`${label}.imageUrl must be a string or null`);
  }
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}
