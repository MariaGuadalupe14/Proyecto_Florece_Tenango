const test = require('node:test');
const assert = require('node:assert/strict');
const { createProxyAuthMiddleware } = require('../proxy-auth');

const sharedSecret = 'synthetic-backend-proxy-secret-for-tests-only';

function invoke(headers, remoteAddress = '198.51.100.8', isProduction = false) {
    const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    const req = {
        get(name) { return normalized.get(name.toLowerCase()); },
        socket: { remoteAddress }
    };
    const res = {
        statusCode: null,
        headers: {},
        body: null,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    let nextCalled = false;
    createProxyAuthMiddleware({ secret: sharedSecret, isProduction })(req, res, () => { nextCalled = true; });
    return { req, res, nextCalled };
}

test('public Cloudflare edge request needs the shared proxy secret', () => {
    const denied = invoke({ 'CF-Ray': 'synthetic-ray', Origin: 'https://proyecto-florece-tenango.pages.dev' });
    assert.equal(denied.nextCalled, false);
    assert.equal(denied.res.statusCode, 403);
    const allowed = invoke({ 'CF-Ray': 'synthetic-ray', Origin: 'https://proyecto-florece-tenango.pages.dev', 'X-Backend-Proxy-Secret': sharedSecret });
    assert.equal(allowed.nextCalled, true);
});

test('direct local development requests remain available without trusting remote origins', () => {
    const local = invoke({ Origin: 'http://localhost:5500' }, '::1', false);
    assert.equal(local.nextCalled, true);
    const remote = invoke({ Origin: 'http://localhost:5500' }, '198.51.100.8', false);
    assert.equal(remote.nextCalled, false);
    assert.equal(remote.res.statusCode, 403);
});

test('production requests require the shared proxy secret even with a local origin', () => {
    const denied = invoke({ Origin: 'http://localhost:5500' }, '127.0.0.1', true);
    assert.equal(denied.nextCalled, false);
    const allowed = invoke({ 'X-Backend-Proxy-Secret': sharedSecret }, '127.0.0.1', true);
    assert.equal(allowed.nextCalled, true);
});
