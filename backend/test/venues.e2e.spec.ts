import { randomUUID } from 'crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import path from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_ENV, type AppEnv } from '../src/config/app-env';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/persistence/database.service';

const TEST_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const FIXTURES = path.resolve(__dirname, 'fixtures');
const PUBLIC_INDEX = path.resolve(__dirname, '../../contracts/venues/index.json');
const ORYONG = path.resolve(__dirname, '../../contracts/oryong-demo.json');

describe('venue catalog API', () => {
  it('lists only the current oryong catalog and does not substitute another version', async () => {
    const dbPath = tempDb();
    const app = await boot(dbPath, PUBLIC_INDEX);
    try {
      const catalog = JSON.parse(readFileSync(ORYONG, 'utf8')) as { venueId: string; catalogVersion: string };
      const list = await request(app.getHttpServer()).get('/v1/venues').expect(200);
      expect(list.body).toEqual({
        items: [
          {
            venueId: 'gist-oryong-demo',
            catalogVersion: 'oryong-demo-v2',
            name: 'GIST 오룡관',
            verification: 'DEMO_UNVERIFIED',
          },
        ],
      });

      const current = await request(app.getHttpServer()).get('/v1/venues/gist-oryong-demo').expect(200);
      expect(current.body).toEqual(catalog);
      const exact = await request(app.getHttpServer())
        .get('/v1/venues/gist-oryong-demo/versions/oryong-demo-v2')
        .expect(200);
      expect(exact.body).toEqual(catalog);
      expect(exact.body.venueId).toBe('gist-oryong-demo');
      expect(exact.body.catalogVersion).toBe('oryong-demo-v2');

      const missingVersion = await request(app.getHttpServer())
        .get('/v1/venues/gist-oryong-demo/versions/oryong-demo-v1')
        .expect(404);
      expect(missingVersion.body.code).toBe('NOT_FOUND');
      expect(missingVersion.body.catalogVersion).toBeUndefined();
      const missingVenue = await request(app.getHttpServer()).get('/v1/venues/fixture-a').expect(404);
      expect(missingVenue.body.code).toBe('NOT_FOUND');
    } finally {
      await closeApp(app);
      rmSync(dbPath, { recursive: true, force: true });
    }
  });

  it('returns an empty list when the index has no venues', async () => {
    const dbPath = tempDb();
    const app = await boot(dbPath, index('empty.json'));
    try {
      const list = await request(app.getHttpServer()).get('/v1/venues').expect(200);
      expect(list.body).toEqual({ items: [] });
      const missing = await request(app.getHttpServer()).get('/v1/venues/gist-oryong-demo').expect(404);
      expect(missing.body.code).toBe('NOT_FOUND');
    } finally {
      await closeApp(app);
      rmSync(dbPath, { recursive: true, force: true });
    }
  });

  it('keeps two venues apart, including a shared version string, and accepts a past version', async () => {
    const dbPath = tempDb();
    const app = await boot(dbPath, index('two-venues.json'));
    try {
      const list = await request(app.getHttpServer()).get('/v1/venues').expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({ venueId: 'fixture-a', catalogVersion: 'fixture-v2', verification: 'DEMO_UNVERIFIED' }),
        expect.objectContaining({ venueId: 'fixture-b', catalogVersion: 'fixture-v1', verification: 'DEMO_UNVERIFIED' }),
      ]);

      const aPast = await request(app.getHttpServer()).get('/v1/venues/fixture-a/versions/fixture-v1').expect(200);
      const bSame = await request(app.getHttpServer()).get('/v1/venues/fixture-b/versions/fixture-v1').expect(200);
      expect(aPast.body).toMatchObject({ venueId: 'fixture-a', catalogVersion: 'fixture-v1' });
      expect(aPast.body.parkingCandidates[0].id).toBe('park-a1');
      expect(bSame.body).toMatchObject({ venueId: 'fixture-b', catalogVersion: 'fixture-v1' });
      expect(bSame.body.parkingCandidates[0].id).toBe('park-b1');

      const stray = await request(app.getHttpServer()).get('/v1/venues/fixture-a/versions/not-in-index').expect(404);
      expect(stray.body.code).toBe('NOT_FOUND');
      expect(JSON.stringify(stray.body)).not.toContain('park-stray');

      const before = await countSessions(app);
      const missingVenue = await create(app, 'missing-venue', 'fixture-v1');
      expect(missingVenue.status).toBe(404);
      expect(missingVenue.body.code).toBe('NOT_FOUND');
      const missingVersion = await create(app, 'fixture-a', 'missing-version');
      expect(missingVersion.status).toBe(400);
      expect(missingVersion.body.code).toBe('INVALID_REQUEST');
      expect(await countSessions(app)).toBe(before);

      const older = await create(app, 'fixture-a', 'fixture-v1');
      expect(older.status).toBe(201);
      expect(older.body.session).toMatchObject({
        venueId: 'fixture-a',
        catalogVersion: 'fixture-v1',
        parkingId: 'park-a1',
        meetingPointId: 'meet-a1',
        dataMode: 'DEMO',
      });
      const other = await create(app, 'fixture-b', 'fixture-v1');
      expect(other.status).toBe(201);
      expect(other.body.session).toMatchObject({
        venueId: 'fixture-b',
        catalogVersion: 'fixture-v1',
        parkingId: 'park-b1',
        meetingPointId: 'meet-b1',
        dataMode: 'DEMO',
      });

      await apply(app, older.body.session.id, older.body.ownerToken, 1, 'START').expect(200);
      await apply(app, older.body.session.id, older.body.ownerToken, 2, 'CONFIRM_DROPOFF').expect(200);
      const rejected = await apply(app, older.body.session.id, older.body.ownerToken, 3, 'REJECT_PARKING').expect(200);
      expect(rejected.body).toMatchObject({
        parkingId: 'park-a2',
        meetingPointId: 'meet-a1',
        catalogVersion: 'fixture-v1',
        revision: 4,
      });

      const untouched = await request(app.getHttpServer())
        .get(`/v1/sessions/${other.body.session.id}`)
        .set('Authorization', `Bearer ${other.body.ownerToken}`)
        .expect(200);
      expect(untouched.body).toMatchObject({
        parkingId: 'park-b1',
        meetingPointId: 'meet-b1',
        catalogVersion: 'fixture-v1',
        revision: 1,
      });
    } finally {
      await closeApp(app);
      rmSync(dbPath, { recursive: true, force: true });
    }
  });

  it('keeps an in-progress v1 visit after the current version becomes v2, including across restarts', async () => {
    const dbPath = tempDb();
    let app: INestApplication | undefined;
    try {
      app = await boot(dbPath, index('a-current-v1.json'));
      const created = await create(app, 'fixture-a', 'fixture-v1');
      expect(created.status).toBe(201);
      const firstId = created.body.session.id as string;
      const owner = created.body.ownerToken as string;
      await closeApp(app);

      app = await boot(dbPath, index('a-current-v2.json'));
      const current = await request(app.getHttpServer()).get('/v1/venues/fixture-a').expect(200);
      expect(current.body.catalogVersion).toBe('fixture-v2');
      const pinned = await request(app.getHttpServer()).get('/v1/venues/fixture-a/versions/fixture-v1').expect(200);
      expect(pinned.body.parkingCandidates.map((point: { id: string }) => point.id)).toEqual(['park-a1', 'park-a2']);

      await apply(app, firstId, owner, 1, 'START').expect(200);
      await apply(app, firstId, owner, 2, 'CONFIRM_DROPOFF').expect(200);
      const rejected = await apply(app, firstId, owner, 3, 'REJECT_PARKING').expect(200);
      expect(rejected.body).toMatchObject({
        parkingId: 'park-a2',
        meetingPointId: 'meet-a1',
        catalogVersion: 'fixture-v1',
        revision: 4,
      });

      const newer = await create(app, 'fixture-a', 'fixture-v2');
      expect(newer.status).toBe(201);
      expect(newer.body.session).toMatchObject({
        parkingId: 'park-a3',
        meetingPointId: 'meet-a2',
        catalogVersion: 'fixture-v2',
        dataMode: 'DEMO',
      });
      const secondId = newer.body.session.id as string;
      const secondOwner = newer.body.ownerToken as string;
      await closeApp(app);

      app = await boot(dbPath, index('a-current-v2.json'));
      const firstAgain = await request(app.getHttpServer())
        .get(`/v1/sessions/${firstId}`)
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
      const secondAgain = await request(app.getHttpServer())
        .get(`/v1/sessions/${secondId}`)
        .set('Authorization', `Bearer ${secondOwner}`)
        .expect(200);
      expect(firstAgain.body).toMatchObject({
        catalogVersion: 'fixture-v1',
        parkingId: 'park-a2',
        meetingPointId: 'meet-a1',
        revision: 4,
      });
      expect(secondAgain.body).toMatchObject({
        catalogVersion: 'fixture-v2',
        parkingId: 'park-a3',
        meetingPointId: 'meet-a2',
        revision: 1,
      });
    } finally {
      await closeApp(app);
      rmSync(dbPath, { recursive: true, force: true });
    }
  }, 90000);

  it('does not apply an event or advance revision when the pinned catalog disappears', async () => {
    const dbPath = tempDb();
    let app: INestApplication | undefined;
    try {
      app = await boot(dbPath, index('a-current-v1.json'));
      const created = await create(app, 'fixture-a', 'fixture-v1');
      expect(created.status).toBe(201);
      const id = created.body.session.id as string;
      const owner = created.body.ownerToken as string;
      await closeApp(app);

      app = await boot(dbPath, index('a-v2-only.json'));
      const missing = await request(app.getHttpServer()).get('/v1/venues/fixture-a/versions/fixture-v1').expect(404);
      expect(missing.body.code).toBe('NOT_FOUND');
      const current = await request(app.getHttpServer()).get('/v1/venues/fixture-a').expect(200);
      expect(current.body.catalogVersion).toBe('fixture-v2');

      const conflict = await apply(app, id, owner, 9, 'START');
      expect(conflict.status).toBe(409);
      expect(conflict.body.code).toBe('REVISION_CONFLICT');

      const key = randomUUID();
      const unavailable = await apply(app, id, owner, 1, 'START', key);
      expect(unavailable.status).toBe(500);
      expect(unavailable.body.code).toBe('CATALOG_UNAVAILABLE');
      const unchanged = await request(app.getHttpServer())
        .get(`/v1/sessions/${id}`)
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
      expect(unchanged.body).toMatchObject({ revision: 1, stage: 'PLANNED', catalogVersion: 'fixture-v1' });
      await closeApp(app);

      app = await boot(dbPath, index('a-current-v1.json'));
      const retried = await apply(app, id, owner, 1, 'START', key);
      expect(retried.status).toBe(200);
      expect(retried.body).toMatchObject({ revision: 2, stage: 'TO_DROPOFF', catalogVersion: 'fixture-v1' });
    } finally {
      await closeApp(app);
      rmSync(dbPath, { recursive: true, force: true });
    }
  }, 90000);
});

async function boot(dbPath: string, indexPath: string): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_URL;
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  process.env.DATABASE_PATH = dbPath;
  process.env.CORS_ORIGINS =
    'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173';
  process.env.THROTTLE_LIMIT = '10000';
  process.env.THROTTLE_TTL_MS = '60000';
  process.env.CLEANUP_INTERVAL_MS = '0';
  process.env.PORT = '0';
  process.env.VENUE_CATALOG_INDEX_PATH = indexPath;
  process.env.VENUE_CATALOG_PATH = path.join(FIXTURES, 'does-not-exist.json');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app, moduleRef.get<AppEnv>(APP_ENV));
  await app.init();
  return app;
}

function index(name: string): string {
  return path.join(FIXTURES, 'indexes', name);
}

function tempDb(): string {
  const root = path.join(process.cwd(), '.tmp-tests');
  mkdirSync(root, { recursive: true });
  return mkdtempSync(path.join(root, 'venues-e2e-'));
}

async function closeApp(app?: INestApplication): Promise<void> {
  if (!app) return;
  await app.close().catch(() => undefined);
}

function create(app: INestApplication, venueId: string, catalogVersion: string) {
  return request(app.getHttpServer())
    .post('/v1/sessions')
    .set('Idempotency-Key', randomUUID())
    .send({ venueId, catalogVersion });
}

function apply(
  app: INestApplication,
  id: string,
  token: string,
  expectedRevision: number,
  event: string,
  key = randomUUID(),
) {
  return request(app.getHttpServer())
    .post(`/v1/sessions/${id}/events`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({ expectedRevision, event });
}

async function countSessions(app: INestApplication): Promise<number> {
  const [row] = await app.get(DatabaseService).execute('SELECT COUNT(*)::int AS count FROM sessions');
  return Number(row.count);
}
