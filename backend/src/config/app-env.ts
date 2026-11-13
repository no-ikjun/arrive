import { existsSync } from 'fs';
import path from 'path';

export const APP_ENV = Symbol('APP_ENV');

export interface AppEnv {
  port: number;
  databaseUrl?: string;
  databasePath: string;
  tokenKey: Buffer;
  corsOrigins: string[];
  cleanupIntervalMs: number;
  throttleTtlMs: number;
  throttleLimit: number;
  venueCatalogIndexPath?: string;
  venueCatalogPath: string;
  bodyLimit: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const keyRaw = source.TOKEN_ENCRYPTION_KEY?.trim();
  if (!keyRaw) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required');
  }
  const tokenKey = Buffer.from(keyRaw, 'base64');
  if (tokenKey.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes');
  }

  const corsOrigins = (source.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS is required');
  }

  const indexOverride = source.VENUE_CATALOG_INDEX_PATH?.trim() || undefined;
  const catalogOverride = source.VENUE_CATALOG_PATH?.trim();
  const databaseUrl = source.DATABASE_URL?.trim() || undefined;
  return {
    port: numberFrom(source.PORT, 8080),
    databaseUrl,
    databasePath: source.DATABASE_PATH?.trim() || './data/pglite',
    tokenKey,
    corsOrigins,
    cleanupIntervalMs: numberFrom(source.CLEANUP_INTERVAL_MS, 60_000),
    throttleTtlMs: numberFrom(source.THROTTLE_TTL_MS, 60_000),
    throttleLimit: numberFrom(source.THROTTLE_LIMIT, 120),
    venueCatalogIndexPath: indexOverride,
    venueCatalogPath: indexOverride ? catalogOverride || '' : catalogOverride || resolveCatalog(),
    bodyLimit: '16kb',
  };
}

function numberFrom(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`invalid numeric environment value: ${value}`);
  }
  return parsed;
}

function resolveCatalog(): string {
  const candidates = [
    path.resolve(process.cwd(), '../contracts/oryong-demo.json'),
    path.resolve(process.cwd(), 'contracts/oryong-demo.json'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('venue catalog not found; set VENUE_CATALOG_PATH');
  }
  return found;
}
