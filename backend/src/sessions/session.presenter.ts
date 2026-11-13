import { ApiProperty } from '@nestjs/swagger';
import type { SessionRecord } from '../persistence/schema';
import { TRIP_STAGES, type TripStage } from './trip';

export class PublicSession {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  venueId!: string;

  @ApiProperty()
  catalogVersion!: string;

  @ApiProperty({ enum: TRIP_STAGES })
  stage!: TripStage;

  @ApiProperty({ nullable: true, type: String })
  parkingId!: string | null;

  @ApiProperty({ type: [String] })
  excludedParkingIds!: string[];

  @ApiProperty()
  meetingPointId!: string;

  @ApiProperty({ minimum: 1 })
  revision!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ enum: ['DEMO', 'VERIFIED'] })
  dataMode!: 'DEMO' | 'VERIFIED';
}

export class HandoffSession extends PublicSession {
  @ApiProperty({ format: 'date-time' })
  handoffExpiresAt!: string;

  @ApiProperty({ isArray: true, enum: ['CONFIRM_REUNION'] })
  capabilities!: Array<'CONFIRM_REUNION'>;
}

export function toPublicSession(record: SessionRecord): PublicSession {
  const excluded = JSON.parse(record.excludedParkingIds) as unknown;
  if (!Array.isArray(excluded) || excluded.some((id) => typeof id !== 'string')) {
    throw new Error('stored excluded parking ids are invalid');
  }
  return {
    id: record.id,
    venueId: record.venueId,
    catalogVersion: record.catalogVersion,
    stage: record.stage as TripStage,
    parkingId: record.parkingId,
    excludedParkingIds: excluded,
    meetingPointId: record.meetingPointId,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    dataMode: record.dataMode === 'VERIFIED' ? 'VERIFIED' : 'DEMO',
  };
}

export function toHandoffSession(record: SessionRecord, handoffExpiresAt: string): HandoffSession {
  return {
    ...toPublicSession(record),
    handoffExpiresAt,
    capabilities: record.stage === 'WALKING_TO_MEETING' ? ['CONFIRM_REUNION'] : [],
  };
}
