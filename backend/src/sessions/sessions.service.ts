import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { ApiError } from '../common/api-error';
import { bodyHash } from '../common/body-hash';
import { isExpired, nowIso, SESSION_TTL_MS } from '../common/time';
import { DatabaseService, type AppDatabase } from '../persistence/database.service';
import {
  handoffTokens,
  idempotencyRecords,
  sessions,
  type IdempotencyRecord,
  type SessionRecord,
} from '../persistence/schema';
import { TokenService } from '../persistence/token.service';
import { dataModeFor } from '../venues/venue';
import { VenuesService } from '../venues/venues.service';
import { errorResult, type HttpResult } from './http-result';
import { toHandoffSession, toPublicSession, type HandoffSession, type PublicSession } from './session.presenter';
import type { ApplyEventDto, CreateSessionDto } from './session.dto';
import { applyTripEvent, initialTrip, type TripStage } from './trip';

const CREATE_ENDPOINT = 'POST /v1/sessions';
const CREATE_OWNER = '';
const ISSUE_HANDOFF_ENDPOINT = 'POST /v1/sessions/:id/handoffs';
const CONFIRM_HANDOFF_ENDPOINT = 'POST /v1/handoff-session/reunion';

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
      await tx.delete(handoffTokens).where(eq(handoffTokens.sessionId, sessionId));
      await tx.delete(sessions).where(eq(sessions.id, sessionId));
      await tx.delete(idempotencyRecords).where(
        and(
          eq(idempotencyRecords.sessionId, sessionId),
          inArray(idempotencyRecords.scope, ['event', 'handoff', 'handoff-reunion']),
        ),
      );
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

  issueHandoff(sessionId: string, ownerHash: string, idempotencyKey: string): Promise<HttpResult> {
    const digest = bodyHash({ sessionId });
    return this.database.transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      if (!session || !this.tokens.sameHash(session.ownerTokenHash, ownerHash) || isExpired(session.expiresAt)) {
        return errorResult(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
      }
      const replay = await this.replay(tx, ownerHash, ISSUE_HANDOFF_ENDPOINT, idempotencyKey, digest);
      if (replay) return replay;
      if (session.stage !== 'WALKING_TO_MEETING') {
        return errorResult(409, 'INVALID_STAGE', '주차 완료 후에만 휴대폰으로 이어갈 수 있어요.');
      }

      let handoffToken = this.tokens.generate();
      let tokenHash = this.tokens.hash(handoffToken);
      while (tokenHash === session.ownerTokenHash || tokenHash === session.shareTokenHash) {
        handoffToken = this.tokens.generate();
        tokenHash = this.tokens.hash(handoffToken);
      }
      const createdAt = nowIso();
      await tx.insert(handoffTokens).values({
        id: randomUUID(),
        sessionId: session.id,
        tokenHash,
        tokenCipher: this.tokens.encrypt(handoffToken),
        expiresAt: session.expiresAt,
        createdAt,
      });
      const body = {
        sessionId: session.id,
        handoffToken,
        expiresAt: session.expiresAt,
      };
      await this.insertIdempotency(tx, {
        scope: 'handoff',
        ownerHash,
        endpoint: ISSUE_HANDOFF_ENDPOINT,
        idempotencyKey,
        digest,
        httpStatus: 201,
        body,
        sessionId: session.id,
        expiresAt: session.expiresAt,
        tombstone: false,
      });
      return { httpStatus: 201, body: asRecord(body) };
    });
  }

  async getHandoff(sessionId: string, tokenHash: string): Promise<HandoffSession> {
    const [token] = await this.database.db
      .select()
      .from(handoffTokens)
      .where(eq(handoffTokens.tokenHash, tokenHash))
      .limit(1);
    const [session] = await this.database.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!token || !session || token.sessionId !== session.id) {
      throw new ApiError(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
    }
    if (isExpired(session.expiresAt) || isExpired(token.expiresAt)) {
      throw new ApiError(401, 'UNAUTHORIZED', '인증 정보가 만료되었습니다.');
    }
    return toHandoffSession(session, session.expiresAt);
  }

  confirmHandoffReunion(
    sessionId: string,
    tokenHash: string,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<HttpResult> {
    const digest = bodyHash({ expectedRevision });
    return this.database.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(handoffTokens)
        .where(eq(handoffTokens.tokenHash, tokenHash))
        .limit(1);
      const session = await this.lockSession(tx, sessionId);
      if (!token || !session || token.sessionId !== session.id) {
        return errorResult(404, 'NOT_FOUND', '세션을 찾을 수 없습니다.');
      }
      if (isExpired(session.expiresAt) || isExpired(token.expiresAt)) {
        return errorResult(401, 'UNAUTHORIZED', '인증 정보가 만료되었습니다.');
      }
      const replay = await this.replay(tx, tokenHash, CONFIRM_HANDOFF_ENDPOINT, idempotencyKey, digest);
      if (replay) return replay;

      if (session.stage !== 'WALKING_TO_MEETING') {
        const rejected = errorResult(409, 'INVALID_STAGE', '현재 단계에서는 합류를 확인할 수 없어요.');
        await this.insertIdempotency(tx, {
          scope: 'handoff-reunion',
          ownerHash: tokenHash,
          endpoint: CONFIRM_HANDOFF_ENDPOINT,
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
      if (session.revision !== expectedRevision) {
        const conflict = errorResult(409, 'REVISION_CONFLICT', '리비전이 일치하지 않습니다.', session.revision);
        await this.insertIdempotency(tx, {
          scope: 'handoff-reunion',
          ownerHash: tokenHash,
          endpoint: CONFIRM_HANDOFF_ENDPOINT,
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

      const applied = applyTripEvent(this.tripState(session), 'CONFIRM_REUNION', []);
      if (!applied.ok) {
        const rejected = errorResult(409, 'INVALID_STAGE', '현재 단계에서는 합류를 확인할 수 없어요.');
        await this.insertIdempotency(tx, {
          scope: 'handoff-reunion',
          ownerHash: tokenHash,
          endpoint: CONFIRM_HANDOFF_ENDPOINT,
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
      const updated = await tx
        .update(sessions)
        .set({
          stage: applied.state.stage,
          revision: applied.state.revision,
          updatedAt,
        })
        .where(and(eq(sessions.id, session.id), eq(sessions.revision, expectedRevision)))
        .returning();
      if (updated.length === 0) {
        const [current] = await tx.select().from(sessions).where(eq(sessions.id, session.id)).limit(1);
        const conflict = errorResult(
          409,
          'REVISION_CONFLICT',
          '리비전이 일치하지 않습니다.',
          current?.revision,
        );
        await this.insertIdempotency(tx, {
          scope: 'handoff-reunion',
          ownerHash: tokenHash,
          endpoint: CONFIRM_HANDOFF_ENDPOINT,
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

      const body = toHandoffSession(
        { ...session, stage: applied.state.stage, revision: applied.state.revision, updatedAt },
        session.expiresAt,
      );
      await this.insertIdempotency(tx, {
        scope: 'handoff-reunion',
        ownerHash: tokenHash,
        endpoint: CONFIRM_HANDOFF_ENDPOINT,
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

  private async lockSession(tx: Tx, sessionId: string): Promise<SessionRecord | undefined> {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1).for('update');
    return session;
  }

  private tripState(session: SessionRecord) {
    return {
      stage: session.stage as TripStage,
      parkingId: session.parkingId,
      excludedParkingIds: JSON.parse(session.excludedParkingIds) as string[],
      meetingPointId: session.meetingPointId,
      revision: session.revision,
    };
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
      scope: 'create' | 'event' | 'handoff' | 'handoff-reunion';
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
