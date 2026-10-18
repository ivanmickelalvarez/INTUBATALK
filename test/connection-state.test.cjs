const test = require('node:test');
const assert = require('node:assert/strict');

test('classifies Cloudflare Access redirects as authentication required', async () => {
  const { classifyApiResponse } = await import('../public/js/lib/connection-state.mjs');
  assert.equal(classifyApiResponse({
    ok: true,
    redirected: true,
    url: 'https://example.cloudflareaccess.com/cdn-cgi/access/login/app',
    contentType: 'text/html',
  }, 'https://app.example'), 'auth');
});

test('classifies opaque manual redirects as authentication required', async () => {
  const { classifyApiResponse } = await import('../public/js/lib/connection-state.mjs');
  assert.equal(classifyApiResponse({
    ok: false,
    type: 'opaqueredirect',
    redirected: false,
    url: 'https://app.example/api/poll',
    contentType: '',
  }, 'https://app.example'), 'auth');
});

test('classifies visible HTTP redirects as authentication required', async () => {
  const { classifyApiResponse } = await import('../public/js/lib/connection-state.mjs');
  assert.equal(classifyApiResponse({
    ok: false,
    status: 302,
    type: 'basic',
    redirected: false,
    url: 'https://app.example/api/poll',
    contentType: 'text/html',
  }, 'https://app.example'), 'auth');
});

test('classifies a connectivity-probe Access redirect as authentication required', async () => {
  const { classifyConnectivityProbe } = await import('../public/js/lib/connection-state.mjs');
  assert.equal(classifyConnectivityProbe({ ok: false, status: 302, type: 'basic', redirected: false }), 'auth');
});

test('keeps successful same-origin JSON responses live', async () => {
  const { classifyApiResponse } = await import('../public/js/lib/connection-state.mjs');
  assert.equal(classifyApiResponse({
    ok: true,
    redirected: false,
    url: 'https://app.example/api/poll',
    contentType: 'application/json',
  }, 'https://app.example'), 'live');
});

test('classifies a reachable API server error as service failure, not offline', async () => {
  const { classifyApiResponse } = await import('../public/js/lib/connection-state.mjs');
  assert.equal(classifyApiResponse({
    ok: false,
    status: 503,
    redirected: false,
    url: 'https://app.example/api/poll',
    contentType: 'application/json',
  }, 'https://app.example'), 'service');
});

test('distinguishes a reachable app origin from an unreachable network', async () => {
  const { classifyConnectivityProbe } = await import('../public/js/lib/connection-state.mjs');
  assert.equal(classifyConnectivityProbe({ ok: true, status: 200, redirected: false }), 'service');
  assert.equal(classifyConnectivityProbe(null), 'offline');
});

test('keeps a reachable service distinct from an offline network in the UI', async () => {
  const { normalizeConnectionState } = await import('../public/js/lib/connection-state.mjs');
  assert.equal(normalizeConnectionState('service'), 'service');
  assert.equal(normalizeConnectionState('auth'), 'auth');
  assert.equal(normalizeConnectionState('live'), 'live');
  assert.equal(normalizeConnectionState(false), 'offline');
});
