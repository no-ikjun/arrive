import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyRequest } from '../pages-proxy.mjs';
import { onRequest } from '../functions/api/[[path]].js';
const env = { API_BASE_URL: 'https://arrive-api.example' };
const token = 'a'.repeat(43);
const req = (path, options) => new Request('https://arrive.example' + path, options);
const auth = { Authorization: 'Bearer ' + token, Cookie: 'private=1' };

test('Pages proxy forwards only allowed bearer reads and disables caching', async () => {
  let called;
  const response = await proxyRequest(req('/api/v1/shared-session', { headers: auth }), env, async (url, options) => {
    called = { url, options }; return new Response('{"revision":3}', { status: 200 });
  });
  assert.equal(called.url, 'https://arrive-api.example/v1/shared-session');
  assert.equal(called.options.headers.Authorization, auth.Authorization);
  assert.equal(called.options.headers.Cookie, undefined);
  assert.equal(called.options.redirect, 'error');
  assert.equal(called.options.cache, 'no-store');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { revision: 3 });
});
test('Pages rejects writes, owner routes, query tokens and unauthenticated reads before fetch', async () => {
  const never = () => { throw new Error('Unexpected upstream call'); };
  for (const [path, options, status] of [
    ['/api/v1/shared-session', { method: 'POST', headers: auth }, 405],
    ['/api/v1/sessions', { headers: auth }, 404],
    ['/api/v1/shared-session?token=' + token, {}, 404],
    ['/api/v1/shared-session', {}, 401],
    ['/api/v1/venues/test/other', {}, 404],
  ]) assert.equal((await proxyRequest(req(path, options), env, never)).status, status);
});
test('Pages venue reads omit bearer and preserve retry-after and expiry status', async () => {
  for (const status of [401, 404, 429]) {
    const r = await proxyRequest(req('/api/v1/venues/oryong', { headers: auth }), env, async (_, options) => {
      assert.equal(options.headers.Authorization, undefined);
      return new Response('{"code":"TEST"}', { status, headers: { 'Retry-After': '12', 'Set-Cookie': 'private=1' } });
    });
    assert.equal(r.status, status); assert.equal(r.headers.get('retry-after'), '12');
    assert.equal(r.headers.get('set-cookie'), null);
  }
});
test('Pages rejects missing or unsafe backend configuration', async () => {
  for (const base of [undefined, 'http://example.com', 'https://user:pass@example.com', 'https://example.com/?token=x', 'https://example.com/path']) {
    const r = await proxyRequest(req('/api/v1/venues/oryong'), { API_BASE_URL: base }, () => { throw new Error('Unexpected call'); });
    assert.equal(r.status, 503);
  }
});
test('Pages handles HTML errors, redirects, large bodies and fetch failure without leaking upstream data', async () => {
  for (const fake of [
    async () => new Response('<html>private</html>'),
    async () => new Response('{}', { status: 302, headers: { Location: 'https://elsewhere.example' } }),
    async () => new Response(JSON.stringify({ value: 'a'.repeat(262144) })),
    async () => { throw new Error('private'); },
  ]) {
    const r = await proxyRequest(req('/api/v1/venues/oryong'), env, fake);
    assert.equal(r.status, 502); assert.deepEqual(await r.json(), { code: 'UPSTREAM_UNAVAILABLE' });
  }
});
test('Cloudflare file-route entry point invokes the proxy', async () => {
  const r = await onRequest({ request: req('/api/v1/shared-session'), env });
  assert.equal(r.status, 401);
});
