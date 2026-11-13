// Shared by Pages and the local server. Owner endpoints are never exposed.
export function proxyPlan(method, url, headers, body = '') {
  const reunion = url.pathname === '/api/v1/handoff-session/reunion';
  if (method !== 'GET' && !(method === 'POST' && reunion)) return { status: 405, code: 'READ_ONLY' };
  if (url.search || !(method === 'GET' ? /^\/api\/v1\/(shared-session|handoff-session|venues\/[a-zA-Z0-9_-]+)$/.test(url.pathname) : reunion)) return { status: 404, code: 'NOT_FOUND' };
  const outgoing = { Accept: 'application/json' };
  if (!url.pathname.startsWith('/api/v1/venues/')) {
    const authorization = headers.get('Authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_-]{43,256}$/.test(authorization)) return { status: 401, code: 'UNAUTHORIZED' };
    outgoing.Authorization = authorization;
  }
  if (method === 'POST') {
    if (headers.get('Origin') && headers.get('Origin') !== url.origin) return { status: 403, code: 'ORIGIN_MISMATCH' };
    const key = headers.get('Idempotency-Key') ?? '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' };
    let data;
    try { data = JSON.parse(body); } catch { return { status: 400, code: 'INVALID_BODY' }; }
    if (!data || Object.keys(data).length !== 1 || !Number.isInteger(data.expectedRevision) || data.expectedRevision < 1) return { status: 400, code: 'INVALID_BODY' };
    outgoing['Content-Type'] = 'application/json'; outgoing['Idempotency-Key'] = key;
    return { headers: outgoing, method, body: JSON.stringify(data) };
  }
  return { headers: outgoing, method };
}
