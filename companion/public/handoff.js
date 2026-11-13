import { validateSession } from './model.js';
export function connectionFromHash(hash) {
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  if (values.has('token') === values.has('handoff')) return null;
  const mode = values.has('handoff') ? 'handoff' : 'share';
  const token = values.get(mode === 'handoff' ? 'handoff' : 'token');
  return /^[A-Za-z0-9_-]{43,256}$/.test(token ?? '') ? { mode, token } : null;
}
export function validateHandoff(value) {
  validateSession(value);
  if (!Array.isArray(value.capabilities) || value.capabilities.some(x => x !== 'CONFIRM_REUNION') ||
      !Number.isFinite(Date.parse(value.handoffExpiresAt)) || Date.parse(value.handoffExpiresAt) > Date.parse(value.expiresAt)) throw new Error('Invalid handoff');
  return value;
}
export function canConfirm(mode, session, now = Date.now()) {
  return mode === 'handoff' && session?.stage === 'WALKING_TO_MEETING' && session.capabilities?.includes('CONFIRM_REUNION') &&
    Date.parse(session.handoffExpiresAt) > now && Date.parse(session.expiresAt) > now;
}
export function reunionOperation(session, saved, newKey) {
  if (saved?.sessionId === session.id && Number.isInteger(saved.expectedRevision) && saved.expectedRevision >= 1 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.key)) return saved;
  return { sessionId: session.id, key: newKey(), expectedRevision: session.revision };
}
