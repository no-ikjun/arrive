import http from 'node:http';
import { proxyPlan } from './proxy-policy.mjs';
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
  ['/handoff.js', ['handoff.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
assets.set('/map/map.css', ['map/map.css', 'text/css; charset=utf-8']);
assets.set('/map/guide.js', ['map/guide.js', 'text/javascript; charset=utf-8']);
assets.set('/map/driver.html', ['map/driver.html', 'text/html; charset=utf-8']);
assets.set('/map/driver.js', ['map/driver.js', 'text/javascript; charset=utf-8']);
assets.set('/map/arrival-map.js', ['map/arrival-map.js', 'text/javascript; charset=utf-8']);
assets.set('/map/vendor/leaflet.js', ['map/vendor/leaflet.js', 'text/javascript; charset=utf-8']);
assets.set('/map/vendor/LICENSE', ['map/vendor/LICENSE', 'text/plain; charset=utf-8']);
assets.set('/map/vendor/leaflet.css', ['map/vendor/leaflet.css', 'text/css; charset=utf-8']);
export function createServer(apiBase = 'http://127.0.0.1:8080') {
  const base = new URL(apiBase);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid API_BASE_URL');
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const send = (status, data, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type }); res.end(data); };
    try {
      const path = new URL(req.url, 'http://companion.local');
      // Narrow allowlist: reads + a scoped handoff confirmation, never owner APIs.
      if (path.pathname.startsWith('/api/')) {
        let body = '';
        if (req.method === 'POST') {
          let length = 0;
          for await (const chunk of req) { length += chunk.length; if (length > 1024) return send(400, '{"code":"INVALID_BODY"}'); body += chunk.toString(); }
        }
        const origin = `http://${req.headers.host}`;
        const url = new URL(req.url, origin);
        const headers = new Headers(Object.entries(req.headers).filter(([,v]) => typeof v === 'string'));
        const plan = proxyPlan(req.method, url, headers, body);
        if (plan.status) return send(plan.status, JSON.stringify({ code: plan.code }));
        const upstream = await fetch(base.href.replace(/\/$/, '') + path.pathname.slice(4), {
          ...plan, redirect: 'error', signal: AbortSignal.timeout(8000),
        });
        if (upstream.headers.has('retry-after')) res.setHeader('Retry-After', upstream.headers.get('retry-after'));
        const text = await upstream.text();
        if (text.length > 262144) throw new Error('Response too large');
        JSON.parse(text); // Never forward an unexpected HTML login/error page.
        return send(upstream.status, text);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, '{"code":"READ_ONLY"}');
      if (path.pathname === '/favicon.ico') return send(204, '');
      const guidePath = /^\/guides\/[A-Za-z0-9_-]{1,100}\.[A-Za-z0-9_-]{1,100}\.json$/.test(path.pathname);
      const asset = assets.get(path.pathname) ?? (guidePath ? [path.pathname.slice(1), 'application/json; charset=utf-8'] : null);
      if (!asset) return send(404, '{"code":"NOT_FOUND"}');
      const data = await readFile(new URL('./public/' + asset[0], import.meta.url)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (data === null) return send(404, '{"code":"NOT_FOUND"}');
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
