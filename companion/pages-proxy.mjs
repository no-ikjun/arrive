// Web APIs only: this module runs in Cloudflare Pages Functions.
const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (status, code) => new Response(JSON.stringify({ code }), { status, headers: responseHeaders });

async function readLimited(body) {
  if (!body) throw new Error('Missing response');
  const reader = body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 262144) { await reader.cancel(); throw new Error('Response too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function proxyRequest(request, env, fetchUpstream = fetch) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return json(405, 'READ_ONLY');
  if (url.search || !/^\/api\/v1\/(shared-session|venues\/[a-zA-Z0-9_-]+)$/.test(url.pathname)) return json(404, 'NOT_FOUND');
  const headers = { Accept: 'application/json' };
  if (url.pathname === '/api/v1/shared-session') {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_-]{43,256}$/.test(authorization)) return json(401, 'UNAUTHORIZED');
    headers.Authorization = authorization;
  }
  let base;
  try {
    base = new URL(env.API_BASE_URL);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Invalid origin');
  } catch { return json(503, 'API_NOT_CONFIGURED'); }
  try {
    const upstream = await fetchUpstream(base.origin + url.pathname.slice(4), {
      headers, redirect: 'manual', signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (upstream.status >= 300 && upstream.status < 400) throw new Error('Unexpected redirect');
    const text = await readLimited(upstream.body);
    JSON.parse(text);
    const outgoing = new Headers(responseHeaders);
    if (upstream.headers.has('Retry-After')) outgoing.set('Retry-After', upstream.headers.get('Retry-After'));
    return new Response(text, { status: upstream.status, headers: outgoing });
  } catch {
    // No request URLs, bearer tokens or upstream response bodies in logs.
    return json(502, 'UPSTREAM_UNAVAILABLE');
  }
}
