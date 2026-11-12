import { randomUUID } from 'crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import path from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_ENV, type AppEnv } from '../src/config/app-env';
import { configureApp } from '../src/configure-app';
import { CleanupService } from '../src/persistence/cleanup.service';
import { DatabaseService } from '../src/persistence/database.service';

const TEST_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const CATALOG = path.resolve(__dirname, '../../contracts/oryong-demo.json');

async function createApp(dbPath: string, throttleLimit = '10000'): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_URL;
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  process.env.DATABASE_PATH = dbPath;
  process.env.CORS_ORIGINS =
    'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173';
  process.env.THROTTLE_LIMIT = throttleLimit;
  process.env.THROTTLE_TTL_MS = '60000';
  process.env.CLEANUP_INTERVAL_MS = '0';
  process.env.PORT = '0';
  process.env.VENUE_CATALOG_PATH = CATALOG;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app, moduleRef.get<AppEnv>(APP_ENV));
  await app.init();
  return app;
}

function tempDb(): string {
  const root = path.join(process.cwd(), '.tmp-tests');
  mkdirSync(root, { recursive: true });
  return mkdtempSync(path.join(root, 'case-'));
}

describe('session API', () => {
  let app: INestApplication;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = tempDb();
    app = await createApp(dbPath);
  });

  afterAll(async () => {
    await app.close();
    rmSync(dbPath, { recursive: true, force: true });
  });

  const server = () => app.getHttpServer();

  function createSession(key = randomUUID(), body?: Record<string, string>) {
    return request(server())
      .post('/v1/sessions')
      .set('Idempotency-Key', key)
      .send(body ?? { venueId: 'gist-oryong-demo', catalogVersion: 'oryong-demo-v2' });
  }

  function apply(
    id: string,
    token: string,
    expectedRevision: number,
    event: string,
    key = randomUUID(),
  ) {
    return request(server())
      .post(`/v1/sessions/${id}/events`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ expectedRevision, event });
  }

  it('reports health and serves image-derived coordinates without promoting the demo catalog', async () => {
    const health = await request(server()).get('/health').expect(200);
    expect(health.body).toEqual({ status: 'ok' });

    const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as { verification: string };
    const venue = await request(server()).get('/v1/venues/gist-oryong-demo').expect(200);
    expect(venue.body).toEqual(catalog);
    expect(venue.body.verification).toBe('DEMO_UNVERIFIED');
    expect(venue.body.dropoff.coordinate).toEqual({ latitude: 35.22669, longitude: 126.83931 });
    expect(venue.body.parkingCandidates).toHaveLength(4);
    expect(venue.body.notice).toContain('시연');

    const missing = await request(server()).get('/v1/venues/unknown').expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('allows the configured development origin', async () => {
    const response = await request(server()).get('/health').set('Origin', 'http://localhost:3000');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('creates a planned demo session and replays the same create request', async () => {
    const key = randomUUID();
    const created = await createSession(key).expect(201);
    expect(created.body.session).toMatchObject({
      venueId: 'gist-oryong-demo',
      catalogVersion: 'oryong-demo-v2',
      stage: 'PLANNED',
      parkingId: 'parking-oryong-demo',
      excludedParkingIds: [],
      meetingPointId: 'meeting-demo',
      revision: 1,
      dataMode: 'DEMO',
    });
    expect(created.body.ownerToken.length).toBeGreaterThanOrEqual(43);
    expect(created.body.shareToken.length).toBeGreaterThanOrEqual(43);
    expect(created.body.ownerToken).not.toBe(created.body.shareToken);
    expect(created.headers['cache-control']).toBe('no-store');
    const lifetime = Date.parse(created.body.session.expiresAt) - Date.parse(created.body.session.createdAt);
    expect(lifetime).toBe(24 * 60 * 60 * 1000);

    const replay = await createSession(key).expect(201);
    expect(replay.body).toEqual(created.body);

    const conflict = await createSession(key, {
      venueId: 'gist-oryong-demo',
      catalogVersion: 'other-version',
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');

    const [stored] = await app.get(DatabaseService).execute(
      'SELECT owner_token_cipher AS cipher, owner_token_hash AS hash, data_mode AS "dataMode" FROM sessions WHERE id = $1',
      [created.body.session.id],
    );
    expect(String(stored.cipher).includes(created.body.ownerToken)).toBe(false);
    expect(stored.hash).not.toBe(created.body.ownerToken);
    expect(stored.dataMode).toBe('DEMO');
    const [idempotency] = await app
      .get(DatabaseService)
      .execute('SELECT response_cipher AS cipher FROM idempotency_records WHERE session_id = $1', [
        created.body.session.id,
      ]);
    expect(String(idempotency.cipher).includes(created.body.ownerToken)).toBe(false);
    expect(String(idempotency.cipher).includes(created.body.shareToken)).toBe(false);
  });

  it('rejects an unknown venue and a bad catalog version without creating a session', async () => {
    const before = await countSessions(app);
    const missing = await createSession(randomUUID(), {
      venueId: 'missing',
      catalogVersion: 'oryong-demo-v2',
    });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    const badVersion = await createSession(randomUUID(), {
      venueId: 'gist-oryong-demo',
      catalogVersion: 'nope',
    });
    expect(badVersion.status).toBe(400);
    expect(badVersion.body.code).toBe('INVALID_REQUEST');
    expect(await countSessions(app)).toBe(before);
  });

  it('walks dropoff, parking change, parked, and reunion', async () => {
    const created = await createSession().expect(201);
    const { id } = created.body.session;
    const owner = created.body.ownerToken as string;
    const share = created.body.shareToken as string;

    const started = await apply(id, owner, 1, 'START').expect(200);
    expect(started.body).toMatchObject({ stage: 'TO_DROPOFF', revision: 2, meetingPointId: 'meeting-demo' });

    const dropoff = await apply(id, owner, 2, 'CONFIRM_DROPOFF').expect(200);
    expect(dropoff.body.stage).toBe('TO_PARKING');

    const rejected = await apply(id, owner, 3, 'REJECT_PARKING').expect(200);
    expect(rejected.body.parkingId).toBe('parking-oryong-2-demo');
    expect(rejected.body.excludedParkingIds).toEqual(['parking-oryong-demo']);
    expect(rejected.body.meetingPointId).toBe('meeting-demo');
    expect(rejected.body.revision).toBe(4);
    expect(rejected.body.stage).toBe('TO_PARKING');

    const parked = await apply(id, owner, 4, 'CONFIRM_PARKED').expect(200);
    expect(parked.body).toMatchObject({ stage: 'WALKING_TO_MEETING', revision: 5 });

    const reunited = await apply(id, owner, 5, 'CONFIRM_REUNION').expect(200);
    expect(reunited.body).toMatchObject({ stage: 'REUNITED', revision: 6, dataMode: 'DEMO' });

    const shared = await request(server()).get('/v1/shared-session').set('Authorization', `Bearer ${share}`);
    expect(shared.status).toBe(200);
    expect(shared.headers['cache-control']).toBe('no-store');
    expect(shared.body).toEqual(reunited.body);
    expect(shared.body.ownerToken).toBeUndefined();
    expect(JSON.stringify(shared.body)).not.toContain(owner);

    const terminal = await apply(id, owner, 6, 'CANCEL');
    expect(terminal.status).toBe(409);
    expect(terminal.body.code).toBe('INVALID_TRANSITION');
    const still = await request(server()).get(`/v1/sessions/${id}`).set('Authorization', `Bearer ${owner}`);
    expect(still.body.revision).toBe(6);
    expect(still.body.stage).toBe('REUNITED');
  });

  it('rejects skipped transitions without changing revision', async () => {
    const created = await createSession().expect(201);
    const skipped = await apply(created.body.session.id, created.body.ownerToken, 1, 'CONFIRM_PARKED');
    expect(skipped.status).toBe(409);
    expect(skipped.body.code).toBe('INVALID_TRANSITION');
    expect(skipped.body.currentRevision).toBeUndefined();
    const current = await request(server())
      .get(`/v1/sessions/${created.body.session.id}`)
      .set('Authorization', `Bearer ${created.body.ownerToken}`)
      .expect(200);
    expect(current.body.revision).toBe(1);
    expect(current.body.stage).toBe('PLANNED');
  });

  it('returns the original event snapshot for an exact retry and conflicts on another body', async () => {
    const created = await createSession().expect(201);
    const key = randomUUID();
    const first = await apply(created.body.session.id, created.body.ownerToken, 1, 'START', key).expect(200);
    const retry = await apply(created.body.session.id, created.body.ownerToken, 1, 'START', key).expect(200);
    expect(retry.body).toEqual(first.body);
    expect(retry.body.revision).toBe(2);
    const other = await apply(created.body.session.id, created.body.ownerToken, 1, 'CANCEL', key);
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('IDEMPOTENCY_CONFLICT');
    const current = await request(server())
      .get(`/v1/sessions/${created.body.session.id}`)
      .set('Authorization', `Bearer ${created.body.ownerToken}`)
      .expect(200);
    expect(current.body.revision).toBe(2);
    expect(current.headers['cache-control']).toBe('no-store');
  });

  it('reports the current revision when two updates race', async () => {
    const created = await createSession().expect(201);
    const id = created.body.session.id as string;
    const owner = created.body.ownerToken as string;
    const [left, right] = await Promise.all([
      apply(id, owner, 1, 'START', randomUUID()),
      apply(id, owner, 1, 'CANCEL', randomUUID()),
    ]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = left.status === 409 ? left : right;
    const winner = left.status === 200 ? left : right;
    expect(conflict.body.code).toBe('REVISION_CONFLICT');
    expect(conflict.body.currentRevision).toBe(2);
    expect(winner.body.revision).toBe(2);
    const current = await request(server()).get(`/v1/sessions/${id}`).set('Authorization', `Bearer ${owner}`);
    expect(current.body.revision).toBe(2);
  });

  it('applies one concurrent retry for the same idempotency key', async () => {
    const created = await createSession().expect(201);
    const id = created.body.session.id as string;
    const owner = created.body.ownerToken as string;
    const key = randomUUID();
    const [left, right] = await Promise.all([
      apply(id, owner, 1, 'START', key),
      apply(id, owner, 1, 'START', key),
    ]);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    expect(left.body).toEqual(right.body);
    expect(left.body.revision).toBe(2);
  });

  it('stops at an empty parking list without looping or confirming', async () => {
    const created = await createSession().expect(201);
    const id = created.body.session.id as string;
    const owner = created.body.ownerToken as string;
    await apply(id, owner, 1, 'START').expect(200);
    await apply(id, owner, 2, 'CONFIRM_DROPOFF').expect(200);
    let revision = 3;
    for (let i = 0; i < 4; i += 1) {
      const rejected = await apply(id, owner, revision, 'REJECT_PARKING').expect(200);
      revision = rejected.body.revision;
    }
    const current = await request(server()).get(`/v1/sessions/${id}`).set('Authorization', `Bearer ${owner}`);
    expect(current.body.parkingId).toBeNull();
    expect(current.body.excludedParkingIds).toEqual([
      'parking-oryong-demo',
      'parking-oryong-2-demo',
      'parking-football-demo',
      'parking-dorm-demo',
    ]);
    expect(current.body.stage).toBe('TO_PARKING');
    expect(current.body.meetingPointId).toBe('meeting-demo');
    const confirm = await apply(id, owner, current.body.revision, 'CONFIRM_PARKED');
    const again = await apply(id, owner, current.body.revision, 'REJECT_PARKING');
    expect(confirm.body.code).toBe('INVALID_TRANSITION');
    expect(again.body.code).toBe('INVALID_TRANSITION');
    const after = await request(server()).get(`/v1/sessions/${id}`).set('Authorization', `Bearer ${owner}`);
    expect(after.body.revision).toBe(current.body.revision);
  });

  it('blocks share tokens from writes and owner tokens from the shared read', async () => {
    const created = await createSession().expect(201);
    const other = await createSession().expect(201);
    const id = created.body.session.id as string;
    const shareWrite = await apply(id, created.body.shareToken, 1, 'START');
    expect(shareWrite.status).toBe(401);
    expect(shareWrite.body.code).toBe('UNAUTHORIZED');
    const shareDelete = await request(server())
      .delete(`/v1/sessions/${id}`)
      .set('Authorization', `Bearer ${created.body.shareToken}`);
    expect(shareDelete.status).toBe(401);
    expect(shareDelete.body.code).toBe('UNAUTHORIZED');

    const ownerOnShare = await request(server())
      .get('/v1/shared-session')
      .set('Authorization', `Bearer ${created.body.ownerToken}`);
    expect(ownerOnShare.status).toBe(401);
    expect(ownerOnShare.body.code).toBe('UNAUTHORIZED');

    const cross = await request(server())
      .get(`/v1/sessions/${id}`)
      .set('Authorization', `Bearer ${other.body.ownerToken}`);
    expect(cross.status).toBe(404);
    expect(cross.body.code).toBe('NOT_FOUND');

    const shared = await request(server())
      .get('/v1/shared-session')
      .set('Authorization', `Bearer ${created.body.shareToken}`)
      .expect(200);
    expect(shared.body.id).toBe(id);
    expect(shared.body).not.toHaveProperty('ownerToken');
    expect(shared.body).not.toHaveProperty('shareToken');
  });

  it('hides expired sessions and removes them during cleanup', async () => {
    const created = await createSession().expect(201);
    const id = created.body.session.id as string;
    await app
      .get(DatabaseService)
      .execute('UPDATE sessions SET expires_at = $1 WHERE id = $2', ['2000-01-01T00:00:00.000Z', id]);
    await app
      .get(DatabaseService)
      .execute('UPDATE idempotency_records SET expires_at = $1 WHERE session_id = $2', [
        '2000-01-01T00:00:00.000Z',
        id,
      ]);
    const expired = await request(server())
      .get(`/v1/sessions/${id}`)
      .set('Authorization', `Bearer ${created.body.ownerToken}`);
    expect(expired.status).toBe(404);
    expect(expired.body.code).toBe('NOT_FOUND');
    const shared = await request(server())
      .get('/v1/shared-session')
      .set('Authorization', `Bearer ${created.body.shareToken}`);
    expect(shared.status).toBe(404);

    await app.get(CleanupService).cleanup();
    expect(await countWhere(app, 'sessions', id)).toBe(0);
    expect(await countWhere(app, 'idempotency_records', id)).toBe(0);
  });

  it('cancels an active visit and deletes it without letting the create key resurrect it', async () => {
    const key = randomUUID();
    const created = await createSession(key).expect(201);
    const id = created.body.session.id as string;
    const owner = created.body.ownerToken as string;
    const cancelled = await apply(id, owner, 1, 'CANCEL').expect(200);
    expect(cancelled.body.stage).toBe('CANCELLED');
    const after = await apply(id, owner, 2, 'START');
    expect(after.status).toBe(409);
    expect(after.body.code).toBe('INVALID_TRANSITION');

    await request(server()).delete(`/v1/sessions/${id}`).set('Authorization', `Bearer ${owner}`).expect(204);
    const gone = await request(server()).get(`/v1/sessions/${id}`).set('Authorization', `Bearer ${owner}`);
    expect(gone.status).toBe(404);
    const shared = await request(server())
      .get('/v1/shared-session')
      .set('Authorization', `Bearer ${created.body.shareToken}`);
    expect(shared.status).toBe(404);
    const resurrect = await createSession(key);
    expect(resurrect.status).toBe(404);
    expect(resurrect.body.code).toBe('NOT_FOUND');
    const different = await createSession(key, { venueId: 'gist-oryong-demo', catalogVersion: 'other' });
    expect(different.status).toBe(409);
    expect(different.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await countWhere(app, 'sessions', id)).toBe(0);
  });

  it('rejects a missing idempotency key and an unknown event', async () => {
    const missingKey = await request(server())
      .post('/v1/sessions')
      .send({ venueId: 'gist-oryong-demo', catalogVersion: 'oryong-demo-v2' });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.code).toBe('INVALID_REQUEST');

    const created = await createSession().expect(201);
    const badEvent = await request(server())
      .post(`/v1/sessions/${created.body.session.id}/events`)
      .set('Authorization', `Bearer ${created.body.ownerToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedRevision: 1, event: 'DRIVE' });
    expect(badEvent.status).toBe(400);
    expect(badEvent.body.code).toBe('INVALID_REQUEST');
  });
});

describe('persistence and limits', () => {
  it('keeps the session after the database connection is closed and reopened', async () => {
    const dbPath = tempDb();
    const first = await createApp(dbPath);
    const created = await request(first.getHttpServer())
      .post('/v1/sessions')
      .set('Idempotency-Key', randomUUID())
      .send({ venueId: 'gist-oryong-demo', catalogVersion: 'oryong-demo-v2' })
      .expect(201);
    await first.close();

    const second = await createApp(dbPath);
    const loaded = await request(second.getHttpServer())
      .get(`/v1/sessions/${created.body.session.id}`)
      .set('Authorization', `Bearer ${created.body.ownerToken}`)
      .expect(200);
    expect(loaded.body).toEqual(created.body.session);
    await second.close();
    rmSync(dbPath, { recursive: true, force: true });
  });

  it('returns RATE_LIMITED with Retry-After', async () => {
    const dbPath = tempDb();
    const limited = await createApp(dbPath, '2');
    await request(limited.getHttpServer()).get('/health').expect(200);
    await request(limited.getHttpServer()).get('/health').expect(200);
    const blocked = await request(limited.getHttpServer()).get('/health');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
    await limited.close();
    rmSync(dbPath, { recursive: true, force: true });
  });
});

async function countSessions(app: INestApplication): Promise<number> {
  const [row] = await app.get(DatabaseService).execute('SELECT COUNT(*)::int AS count FROM sessions');
  return Number(row.count);
}

async function countWhere(app: INestApplication, table: 'sessions' | 'idempotency_records', id: string): Promise<number> {
  const column = table === 'sessions' ? 'id' : 'session_id';
  const [row] = await app
    .get(DatabaseService)
    .execute(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = $1`, [id]);
  return Number(row.count);
}
