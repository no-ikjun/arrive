import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { ApiError } from '../common/api-error';
import type { AppEnv } from '../config/app-env';
import type { Venue } from './venue';
import { VenuesService } from './venues.service';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe('VenuesService catalog index', () => {
  it('does not fall back to the single catalog when the index is invalid', () => {
    const dir = tempDir();
    const fallback = path.join(dir, 'fallback.json');
    writeFileSync(fallback, JSON.stringify(catalog('gist-oryong-demo', 'oryong-demo-v2')));
    writeFileSync(path.join(dir, 'index.json'), '{');

    expect(() => boot(path.join(dir, 'index.json'), fallback)).toThrow(/invalid venue catalog index/);
  });

  it('does not fall back when the configured index file is missing', () => {
    const dir = tempDir();
    const fallback = path.join(dir, 'fallback.json');
    writeFileSync(fallback, JSON.stringify(catalog('gist-oryong-demo', 'oryong-demo-v2')));

    expect(() => boot(path.join(dir, 'missing-index.json'), fallback)).toThrow(/venue catalog index not found/);
  });

  it('rejects a duplicate venue id, a duplicate version, and a missing current version', () => {
    const dir = tempDir();
    writeCatalog(dir, 'a.json', catalog('fixture-a', 'fixture-v1'));

    expect(() =>
      boot(
        writeIndex(dir, 'duplicate-venue.json', [
          entry('fixture-a', 'fixture-v1', ['a.json']),
          entry('fixture-a', 'fixture-v1', ['a.json']),
        ]),
      ),
    ).toThrow(/duplicate venue id: fixture-a/);

    expect(() =>
      boot(
        writeIndex(dir, 'duplicate-version.json', [
          {
            venueId: 'fixture-a',
            currentVersion: 'fixture-v1',
            versions: [
              { catalogVersion: 'fixture-v1', path: 'a.json' },
              { catalogVersion: 'fixture-v1', path: 'a.json' },
            ],
          },
        ]),
      ),
    ).toThrow(/duplicate catalog version: fixture-a@fixture-v1/);

    expect(() =>
      boot(
        writeIndex(dir, 'missing-current.json', [
          {
            venueId: 'fixture-a',
            currentVersion: 'fixture-v2',
            versions: [{ catalogVersion: 'fixture-v1', path: 'a.json' }],
          },
        ]),
      ),
    ).toThrow(/current version is not registered: fixture-a@fixture-v2/);
  });

  it('rejects an index identity that does not match the file', () => {
    const dir = tempDir();
    writeCatalog(dir, 'a.json', catalog('fixture-a', 'fixture-v1'));
    expect(() =>
      boot(
        writeIndex(dir, 'index.json', [
          {
            venueId: 'fixture-a',
            currentVersion: 'other-version',
            versions: [{ catalogVersion: 'other-version', path: 'a.json' }],
          },
        ]),
      ),
    ).toThrow(/catalog identity does not match index/);
  });

  it('rejects coordinates outside the latitude and longitude ranges', () => {
    const dir = tempDir();
    const body = catalog('fixture-a', 'fixture-v1');
    body.dropoff.coordinate = { latitude: 91, longitude: 0 };
    writeCatalog(dir, 'a.json', body);

    expect(() => boot(writeIndex(dir, 'index.json', [entry('fixture-a', 'fixture-v1', ['a.json'])]))).toThrow(
      /latitude is out of range/,
    );
  });

  it('rejects duplicate point ids inside one catalog', () => {
    const dir = tempDir();
    const body = catalog('fixture-a', 'fixture-v1');
    body.dropoff.id = body.parkingCandidates[0].id;
    writeCatalog(dir, 'a.json', body);

    expect(() => boot(writeIndex(dir, 'index.json', [entry('fixture-a', 'fixture-v1', ['a.json'])]))).toThrow(
      /duplicate point id/,
    );
  });

  it('uses the indexed current version instead of sorting version strings', () => {
    const dir = tempDir();
    const older = catalog('fixture-a', 'fixture-v1');
    older.parkingCandidates[0].id = 'park-a1';
    const newer = catalog('fixture-a', 'fixture-v2');
    newer.parkingCandidates[0].id = 'park-a3';
    writeCatalog(dir, 'v1.json', older);
    writeCatalog(dir, 'v2.json', newer);
    const service = boot(
      writeIndex(dir, 'index.json', [
        {
          venueId: 'fixture-a',
          currentVersion: 'fixture-v1',
          versions: [
            { catalogVersion: 'fixture-v2', path: 'v2.json' },
            { catalogVersion: 'fixture-v1', path: 'v1.json' },
          ],
        },
      ]),
    );

    expect(service.list()).toEqual([
      expect.objectContaining({ venueId: 'fixture-a', catalogVersion: 'fixture-v1' }),
    ]);
    expect(service.getById('fixture-a').parkingCandidates[0].id).toBe('park-a1');
    expect(service.getVersion('fixture-a', 'fixture-v2').parkingCandidates[0].id).toBe('park-a3');
  });

  it('resolves catalog paths from the index file and ignores unlisted files', () => {
    const dir = tempDir();
    const nested = path.join(dir, 'nested');
    mkdirSync(nested);
    writeFileSync(path.join(nested, 'catalog.json'), JSON.stringify(catalog('fixture-a', 'fixture-v1')));
    writeFileSync(path.join(nested, 'not-registered.json'), JSON.stringify(catalog('fixture-a', 'not-registered')));
    const indexPath = path.join(nested, 'index.json');
    writeFileSync(
      indexPath,
      JSON.stringify({
        venues: [
          {
            venueId: 'fixture-a',
            currentVersion: 'fixture-v1',
            versions: [{ catalogVersion: 'fixture-v1', path: 'catalog.json' }],
          },
        ],
      }),
    );

    const service = boot(indexPath, path.join(nested, 'not-registered.json'));
    expect(service.getById('fixture-a').catalogVersion).toBe('fixture-v1');
    expect(() => service.getVersion('fixture-a', 'not-registered')).toThrow(ApiError);
    try {
      service.getVersion('fixture-a', 'not-registered');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).getStatus()).toBe(404);
      expect((error as ApiError).code).toBe('NOT_FOUND');
    }
  });

  it('loads one venue from the single-file catalog when no index is configured', () => {
    const catalogPath = path.resolve(process.cwd(), '../contracts/oryong-demo.json');
    const service = boot(undefined, catalogPath);
    expect(service.list()).toEqual([
      {
        venueId: 'gist-oryong-demo',
        catalogVersion: 'oryong-demo-v2',
        name: 'GIST 오룡관',
        verification: 'DEMO_UNVERIFIED',
      },
    ]);
  });
});

function boot(indexPath: string | undefined, catalogPath = ''): VenuesService {
  const service = new VenuesService({
    venueCatalogIndexPath: indexPath,
    venueCatalogPath: catalogPath,
  } as AppEnv);
  service.onModuleInit();
  return service;
}

function tempDir(): string {
  const root = path.join(process.cwd(), '.tmp-tests');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, 'venues-'));
  dirs.push(dir);
  return dir;
}

function point(id: string): Venue['dropoff'] {
  return { id, name: id, coordinate: { latitude: 35.2, longitude: 126.8 }, instructions: '테스트', imageUrl: null };
}

function catalog(venueId: string, catalogVersion: string): Venue {
  return {
    venueId,
    catalogVersion,
    name: venueId,
    verification: 'DEMO_UNVERIFIED',
    notice: '테스트 fixture',
    dropoff: point(`${venueId}-drop`),
    meetingPoint: point(`${venueId}-meet`),
    parkingCandidates: [point(`${venueId}-p1`), point(`${venueId}-p2`)],
  };
}

function writeCatalog(dir: string, name: string, body: Venue): void {
  writeFileSync(path.join(dir, name), JSON.stringify(body));
}

function writeIndex(dir: string, name: string, venues: unknown[]): string {
  const indexPath = path.join(dir, name);
  writeFileSync(indexPath, JSON.stringify({ venues }));
  return indexPath;
}

function entry(venueId: string, catalogVersion: string, paths: string[]) {
  return {
    venueId,
    currentVersion: catalogVersion,
    versions: paths.map((file) => ({ catalogVersion, path: file })),
  };
}
