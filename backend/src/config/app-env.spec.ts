import { loadEnv } from './app-env';

const KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

function env(extra: NodeJS.ProcessEnv = {}) {
  return loadEnv({
    TOKEN_ENCRYPTION_KEY: KEY,
    CORS_ORIGINS: 'http://localhost:3000',
    ...extra,
  });
}

describe('loadEnv venue catalog', () => {
  it('reads only the index when VENUE_CATALOG_INDEX_PATH is set', () => {
    const loaded = env({ VENUE_CATALOG_INDEX_PATH: '/tmp/venues/index.json' });
    expect(loaded.venueCatalogIndexPath).toBe('/tmp/venues/index.json');
    expect(loaded.venueCatalogPath).toBe('');
  });

  it('keeps an explicit single-file path unused while an index is configured', () => {
    const loaded = env({
      VENUE_CATALOG_INDEX_PATH: '/tmp/venues/index.json',
      VENUE_CATALOG_PATH: '/tmp/missing-catalog.json',
    });
    expect(loaded.venueCatalogIndexPath).toBe('/tmp/venues/index.json');
    expect(loaded.venueCatalogPath).toBe('/tmp/missing-catalog.json');
  });

  it('uses the single catalog when the index variable is blank', () => {
    const loaded = env({
      VENUE_CATALOG_INDEX_PATH: '   ',
      VENUE_CATALOG_PATH: '/tmp/one.json',
    });
    expect(loaded.venueCatalogIndexPath).toBeUndefined();
    expect(loaded.venueCatalogPath).toBe('/tmp/one.json');
  });

  it('resolves the default oryong catalog when neither path is set', () => {
    const loaded = env();
    expect(loaded.venueCatalogIndexPath).toBeUndefined();
    expect(loaded.venueCatalogPath).toMatch(/oryong-demo\.json$/);
  });
});
