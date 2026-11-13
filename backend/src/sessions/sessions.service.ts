import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '../common/api-error';
import { bodyHash } from '../common/body-hash';
import { isExpired, nowIso, SESSION_TTL_MS } from '../common/time';
import { DatabaseService, type AppDatabase } from '../persistence/database.service';
import { idempotencyRecords, sessions, type IdempotencyRecord, type SessionRecord } from '../persistence/schema';
import { TokenService } from '../persistence/token.service';
import { dataModeFor } from '../venues/venue';
import { VenuesService } from '../venues/venues.service';
import { errorResult, type HttpResult } from './http-result';
import { toPublicSession, type PublicSession } from './session.presenter';
import type { ApplyEventDto, CreateSessionDto } from './session.dto';
import { applyTripEvent, initialTrip, type TripStage } from './trip';

const CREATE_ENDPOINT = 'POST /v1/sessions';
const CREATE_OWNER = '';

type Tx = AppDatabase;

@Injectable()
export class SessionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: TokenService,
    private readonly venues: VenuesService,
  ) {}

  create(dto: CreateSessionDto, idempotencyKey: string): Promise<HttpResult> {
    const digest = bodyHash({ venueId: dto.venueId, catalogVersion: dto.catalogVersion });
    return this.database.transaction(async (tx) => {
      const replay = await this.replay(tx, CREATE_OWNER, CREATE_ENDPOINT, idempotencyKey, digest);
      if (replay) return replay;

      const venue = this.venues.requireForCreate(dto.venueId, dto.catalogVersion);

      const createdAt = nowIso();
      const trip = initialTrip(venue.meetingPoint.id, venue.parkingCandidates[0].id);
      const ownerToken = this.tokens.generate();
      const shareToken = this.tokens.generate();
      const record: SessionRecord = {
        id: randomUUID(),
        venueId: venue.venueId,
        catalogVersion: venue.catalogVersion,
        stage: trip.stage,
        parkingId: trip.parkingId,
        excludedParkingIds: JSON.stringify(trip.excludedParkingIds),
        meetingPointId: trip.meetingPointId,
        revision: trip.revision,
        dataMode: dataModeFor(venue.verification),
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date(Date.parse(createdAt) + SESSION_TTL_MS).toISOString(),
        ownerTokenHash: this.tokens.hash(ownerToken),
        shareTokenHash: this.tokens.hash(shareToken),
        ownerTokenCipher: this.tokens.encrypt(ownerToken),
        shareTokenCipher: this.tokens.encrypt(shareToken),
      };
      await tx.insert(sessions).values(record);
      const body = {
        session: toPublicSession(record),
        ownerToken,
        shareToken,
      };
      await this.insertIdempotency(tx, {
        scope: 'create',
        ownerHash: CREATE_OWNER,
        endpoint: CREATE_ENDPOINT,
        idempotencyKey,
        digest,
        httpStatus: 201,
        body,
        sessionId: record.id,
        expiresAt: record.expiresAt,
        tombstone: false,
      });
      return { httpStatus: 201, body: asRecord(body) };
    });
  }

  async getOwned(sessionId: string, ownerHash: string): Promise<PublicSession> {
    const [session] = await this.database.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!session || !this.tokens.sameHash(session.ownerTokenHash, ownerHash) || isExpired(session.expiresAt)) {
      throw new ApiError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
    }
    return toPublicSession(session);
  }

  async getShared(sessionId: string): Promise<PublicSession> {
    const [session] = await this.database.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!session || isExpired(session.expiresAt)) {
      throw new ApiError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
    }
    return toPublicSession(session);
  }

  delete(sessionId: string, ownerHash: string): Promise<HttpResult> {
    return this.database.transaction(async (tx) => {
      const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session || !this.tokens.sameHash(session.ownerTokenHash, ownerHash) || isExpired(session.expiresAt)) {
        return errorResult(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
      }
      const revoked = { code: 'NOT_FOUND', message: '세션이 삭제되었습니다.' };
      await tx.delete(sessions).where(eq(sessions.id, sessionId));
      await tx.delete(idempotencyRecords)
        .where(and(eq(idempotencyRecords.sessionId, sessionId), eq(idempotencyRecords.scope, 'event')));
      await tx.update(idempotencyRecords)
        .set({
          tombstone: 1,
          httpStatus: 404,
          responseCipher: this.tokens.encrypt(JSON.stringify(revoked)),
        })
        .where(and(eq(idempotencyRecords.sessionId, sessionId), eq(idempotencyRecords.scope, 'create')));
      return { httpStatus: 204, body: null };
    });
  }

  applyEvent(sessionId: string, ownerHash: string, dto: ApplyEventDto, idempotencyKey: string): Promise<HttpResult> {
    const endpoint = `POST /v1/sessions/${sessionId}/events`;
    const digest = bodyHash({ expectedRevision: dto.expectedRevision, event: dto.event });
    return this.database.transaction(async (tx) => {
      const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session || !this.tokens.sameHash(session.ownerTokenHash, ownerHash) || isExpired(session.expiresAt)) {
        return errorResult(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
      }
      const replay = await this.replay(tx, ownerHash, endpoint, idempotencyKey, digest);
      if (replay) return replay;

      if (session.revision !== dto.expectedRevision) {
        const conflict = errorResult(
          409,
          'REVISION_CONFLICT',
          '리비전이 일치하지 않습니다.',
          session.revision,
        );
        await this.insertIdempotency(tx, {
          scope: 'event',
          ownerHash,
          endpoint,
          idempotencyKey,
          digest,
          httpStatus: conflict.httpStatus,
          body: conflict.body,
          sessionId,
          expiresAt: session.expiresAt,
          tombstone: false,
        });
        return conflict;
      }

      const venue = this.venues.findExact(session.venueId, session.catalogVersion);
      if (!venue) {
        return errorResult(500, 'CATALOG_UNAVAILABLE', '방문에 고정된 장소 정보를 현재 사용할 수 없습니다.');
      }
      const parkingOrder = venue.parkingCandidates.map((point) => point.id);
      const applied = applyTripEvent(
        {
          stage: session.stage as TripStage,
          parkingId: session.parkingId,
          excludedParkingIds: JSON.parse(session.excludedParkingIds) as string[],
          meetingPointId: session.meetingPointId,
          revision: session.revision,
        },
        dto.event,
        parkingOrder,
      );
      if (!applied.ok) {
        const rejected = errorResult(
          409,
          'INVALID_TRANSITION',
          applied.reason === 'terminal' ? '이미 종료된 방문이에요.' : '현재 단계에서는 진행할 수 없어요.',
        );
        await this.insertIdempotency(tx, {
          scope: 'event',
          ownerHash,
          endpoint,
          idempotencyKey,
          digest,
          httpStatus: rejected.httpStatus,
          body: rejected.body,
          sessionId,
          expiresAt: session.expiresAt,
          tombstone: false,
        });
        return rejected;
      }

      const updatedAt = nowIso();
      const excludedParkingIds = JSON.stringify(applied.state.excludedParkingIds);
      await tx.update(sessions)
        .set({
          stage: applied.state.stage,
          parkingId: applied.state.parkingId,
          excludedParkingIds,
          meetingPointId: applied.state.meetingPointId,
          revision: applied.state.revision,
          updatedAt,
        })
        .where(eq(sessions.id, session.id));
      const body = toPublicSession({
        ...session,
        stage: applied.state.stage,
        parkingId: applied.state.parkingId,
        excludedParkingIds,
        meetingPointId: applied.state.meetingPointId,
        revision: applied.state.revision,
        updatedAt,
      });
      await this.insertIdempotency(tx, {
        scope: 'event',
        ownerHash,
        endpoint,
        idempotencyKey,
        digest,
        httpStatus: 200,
        body,
        sessionId,
        expiresAt: session.expiresAt,
        tombstone: false,
      });
      return { httpStatus: 200, body: asRecord(body) };
    });
  }

  private async replay(
    tx: Tx,
    ownerHash: string,
    endpoint: string,
    idempotencyKey: string,
    digest: string,
  ): Promise<HttpResult | undefined> {
    const [existing] = await tx
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.ownerHash, ownerHash),
          eq(idempotencyRecords.endpoint, endpoint),
          eq(idempotencyRecords.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!existing) return undefined;
    if (isExpired(existing.expiresAt)) {
      await tx.delete(idempotencyRecords).where(eq(idempotencyRecords.id, existing.id));
      return undefined;
    }
    if (existing.bodyHash !== digest) {
      return errorResult(
        409,
        'IDEMPOTENCY_CONFLICT',
        '같은 Idempotency-Key로 다른 요청이 이미 처리되었습니다.',
      );
    }
    if (existing.tombstone === 1) {
      return { httpStatus: existing.httpStatus, body: this.decode(existing) };
    }
    return { httpStatus: existing.httpStatus, body: this.decode(existing) };
  }

  private async insertIdempotency(
    tx: Tx,
    input: {
      scope: 'create' | 'event';
      ownerHash: string;
      endpoint: string;
      idempotencyKey: string;
      digest: string;
      httpStatus: number;
      body: unknown;
      sessionId: string;
      expiresAt: string;
      tombstone: boolean;
    },
  ): Promise<void> {
    await tx.insert(idempotencyRecords)
      .values({
        id: randomUUID(),
        scope: input.scope,
        ownerHash: input.ownerHash,
        endpoint: input.endpoint,
        idempotencyKey: input.idempotencyKey,
        bodyHash: input.digest,
        httpStatus: input.httpStatus,
        responseCipher: this.tokens.encrypt(JSON.stringify(input.body)),
        sessionId: input.sessionId,
        expiresAt: input.expiresAt,
        tombstone: input.tombstone ? 1 : 0,
        createdAt: nowIso(),
      });
  }

  private decode(record: IdempotencyRecord): Record<string, unknown> {
    return JSON.parse(this.tokens.decrypt(record.responseCipher)) as Record<string, unknown>;
  }
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}
