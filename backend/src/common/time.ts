export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function nowIso(now = Date.now()): string {
  return new Date(now).toISOString();
}

export function isExpired(expiresAt: string, now = Date.now()): boolean {
  return Date.parse(expiresAt) <= now;
}
