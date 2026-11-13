import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const assets = new Map([
  ['/brand/logo.png', ['brand/logo.png', 'image/png']],
  ['/brand/symbol.png', ['brand/symbol.png', 'image/png']],
  ['/brand/icon.png', ['brand/icon.png', 'image/png']],
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
export function createServer(apiBase = 'http://127.0.0.1:8080') {
  const base = new URL(apiBase);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid API_BASE_URL');
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const send = (status, data, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type }); res.end(data); };
    try {
      const path = new URL(req.url, 'http://companion.local');
      // Only the two read endpoints are exposed; no owner route, arbitrary proxy, or token query.
      if (path.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') return send(405, '{"code":"READ_ONLY"}');
        if (path.search || !/^\/api\/v1\/(shared-session|venues\/[a-zA-Z0-9_-]+)$/.test(path.pathname)) return send(404, '{"code":"NOT_FOUND"}');
        const headers = { Accept: 'application/json' };
        if (path.pathname === '/api/v1/shared-session') {
          if (!/^Bearer [A-Za-z0-9_-]{43,256}$/.test(req.headers.authorization ?? '')) return send(401, '{"code":"UNAUTHORIZED"}');
          headers.Authorization = req.headers.authorization;
        }
        const upstream = await fetch(base.href.replace(/\/$/, '') + path.pathname.slice(4), {
          headers, redirect: 'error', signal: AbortSignal.timeout(8000),
        });
        if (upstream.headers.has('retry-after')) res.setHeader('Retry-After', upstream.headers.get('retry-after'));
        const text = await upstream.text();
        if (text.length > 262144) throw new Error('Response too large');
        JSON.parse(text); // Never forward an unexpected HTML login/error page.
        return send(upstream.status, text);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, '{"code":"READ_ONLY"}');
      if (path.pathname === '/favicon.ico') return send(204, '');
      const asset = assets.get(path.pathname);
      if (!asset) return send(404, '{"code":"NOT_FOUND"}');
      const data = await readFile(new URL('./public/' + asset[0], import.meta.url));
      return send(200, req.method === 'HEAD' ? '' : data, asset[1]);
    } catch {
      // Do not log request URLs, bearer tokens, or upstream response bodies.
      return send(502, '{"code":"UPSTREAM_UNAVAILABLE"}');
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer(process.env.API_BASE_URL);
  server.listen(Number(process.env.PORT || 8081), process.env.HOST || '127.0.0.1', () => {
    console.log(`Companion listening on port ${server.address().port}`);
  });
}
