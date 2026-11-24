const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRolePage } = require('./pages-function-loader');

function loadHelper(fetchImpl) {
    return loadRolePage(fetchImpl);
}

function context(pathname, { roleResponse, assetResponse } = {}) {
    const requests = [];
    const assetRequests = [];
    const handler = loadHelper(async request => {
        requests.push(request);
        return roleResponse;
    });
    const request = new Request(`https://proyecto-florece-tenango.pages.dev${pathname}`, {
        headers: { Cookie: 'florece.sid=synthetic-session-cookie' }
    });
    return {
        requests,
        assetRequests,
        handler,
        context: {
            request,
            env: {
                BACKEND_ORIGIN: 'https://backend.example.test',
                BACKEND_PROXY_SECRET: 'synthetic-role-page-secret-for-tests',
                ASSETS: { fetch: async request => {
                    assetRequests.push(request);
                    return assetResponse || new Response('protected panel');
                } }
            }
        }
    };
}

test('admin page is denied by backend role guard before static asset delivery', async () => {
    for (const [status, location] of [[401, '/index.html#acceso'], [403, '/usuario.html']]) {
        const setup = context('/admin.html', { roleResponse: new Response('{}', { status }) });
        const response = await setup.handler(setup.context, 'administrador');
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), location);
        assert.equal(response.headers.get('x-frame-options'), 'DENY');
        assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    }
});

test('admin page forwards the session to the backend and serves the asset without caching only after authorization', async () => {
    const setup = context('/admin.html', { roleResponse: new Response('{}', { status: 200 }) });
    const response = await setup.handler(setup.context, 'administrador');
    assert.equal(setup.requests.length, 1);
    assert.equal(new URL(setup.requests[0].url).pathname, '/api/admin');
    assert.equal(setup.requests[0].headers.get('cookie'), 'florece.sid=synthetic-session-cookie');
    assert.equal(setup.requests[0].headers.get('x-backend-proxy-secret'), 'synthetic-role-page-secret-for-tests');
    assert.equal(await response.text(), 'protected panel');
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('user page allows user sessions and routes administrators to their own panel', async () => {
    const user = context('/usuario.html', { roleResponse: Response.json({ usuario: { rol: 'usuario' } }) });
    const userResponse = await user.handler(user.context, 'usuario', '/index.html');
    assert.equal(await userResponse.text(), 'protected panel');
    assert.equal(new URL(user.requests[0].url).pathname, '/api/auth/me');
    assert.equal(new URL(user.assetRequests[0].url).pathname, '/index.html');

    const admin = context('/usuario.html', { roleResponse: Response.json({ usuario: { rol: 'administrador' } }) });
    const adminResponse = await admin.handler(admin.context, 'usuario');
    assert.equal(adminResponse.status, 302);
    assert.equal(adminResponse.headers.get('location'), '/admin.html');
});
