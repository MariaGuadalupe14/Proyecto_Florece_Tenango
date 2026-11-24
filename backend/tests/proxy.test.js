const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApiProxy } = require('./pages-function-loader');

const env = {
    BACKEND_ORIGIN: 'https://backend.example.test',
    BACKEND_PROXY_SECRET: 'synthetic-unit-test-proxy-shared-secret-not-real'
};

test('Pages proxy forwards request details and returns multiple Set-Cookie headers unchanged', async () => {
    let forwarded;
    const responseHeaders = new Headers();
    responseHeaders.append('Set-Cookie', 'session-a=one; Path=/; HttpOnly; Secure; SameSite=Lax');
    responseHeaders.append('Set-Cookie', 'session-b=two; Path=/; HttpOnly; Secure; SameSite=Lax');
    responseHeaders.set('Cache-Control', 'no-store');
    const upstreamResponse = new Response('{"ok":true}', { status: 201, headers: responseHeaders });
    const onRequest = loadApiProxy(async request => { forwarded = request; return upstreamResponse; });
    const requestBody = '{"correo":"sample@example.invalid","password":"not-a-real-password"}';
    const request = new Request('https://proyecto-florece-tenango.pages.dev/api/auth/registro?source=test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': 'florece.sid=synthetic-session-cookie',
            'Origin': 'https://proyecto-florece-tenango.pages.dev',
            'X-CSRF-Token': 'synthetic-csrf-token',
            'X-Backend-Proxy-Secret': 'attacker-controlled-value',
            'X-Forwarded-Proto': 'http',
            'X-Forwarded-Host': 'attacker.invalid',
            'CF-Connecting-IP': '203.0.113.25'
        },
        body: requestBody
    });
    const returned = await onRequest({ request, env });

    assert.equal(forwarded.method, 'POST');
    assert.equal(forwarded.url, 'https://backend.example.test/api/auth/registro?source=test');
    assert.equal(await forwarded.text(), requestBody);
    assert.equal(forwarded.headers.get('cookie'), 'florece.sid=synthetic-session-cookie');
    assert.equal(forwarded.headers.get('origin'), 'https://proyecto-florece-tenango.pages.dev');
    assert.equal(forwarded.headers.get('x-csrf-token'), 'synthetic-csrf-token');
    assert.equal(forwarded.headers.get('x-backend-proxy-secret'), env.BACKEND_PROXY_SECRET);
    assert.equal(forwarded.headers.get('x-forwarded-proto'), 'https');
    assert.equal(forwarded.headers.get('x-forwarded-host'), 'proyecto-florece-tenango.pages.dev');
    assert.equal(forwarded.headers.get('x-forwarded-for'), '203.0.113.25');
    assert.equal(returned, upstreamResponse);
    assert.equal(returned.status, 201);
    assert.deepEqual(returned.headers.getSetCookie(), [
        'session-a=one; Path=/; HttpOnly; Secure; SameSite=Lax',
        'session-b=two; Path=/; HttpOnly; Secure; SameSite=Lax'
    ]);
});

test('Pages proxy fails closed when its origin or secret binding is missing', async () => {
    let fetchCalled = false;
    const onRequest = loadApiProxy(async () => { fetchCalled = true; return new Response('unexpected'); });
    const request = new Request('https://proyecto-florece-tenango.pages.dev/api/auth/me');
    const response = await onRequest({ request, env: { BACKEND_ORIGIN: env.BACKEND_ORIGIN } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=15552000');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(fetchCalled, false);
});
