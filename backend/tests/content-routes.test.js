'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createContentRouter } = require('../content-routes');

function requireRole(requiredRole) {
    return (req, res, next) => {
        if (!req.session || !req.session.usuario) return res.status(401).json({ mensaje: 'Unauthenticated test session.' });
        if (req.session.usuario.rol !== requiredRole) return res.status(403).json({ mensaje: 'Wrong test role.' });
        return next();
    };
}

const csrfToken = 'synthetic-csrf-token-for-content-tests';

async function withApi(db, callback) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const role = req.get('x-test-role');
        req.session = {
            csrfToken,
            ...(role ? { usuario: { id: 71, nombre: 'Test Admin', rol: role } } : {})
        };
        next();
    });
    app.use('/api', createContentRouter({ db, requireRole }));
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();
    try { await callback(`http://127.0.0.1:${port}`); }
    finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function createMockDb() {
    const calls = [];
    return {
        calls,
        async execute(sql, params = []) {
            calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
            if (sql.includes('SELECT')) {
                if (sql.includes('FROM negocios')) return [[{ id: 3, nombre: 'Comercio publicado' }]];
                return [[]];
            }
            if (sql.includes('INSERT INTO negocios')) return [{ insertId: 45, affectedRows: 1 }];
            if (sql.startsWith('INSERT INTO')) return [{ insertId: 45, affectedRows: 1 }];
            if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
            if (sql.includes('INSERT INTO registros_actividad')) return [{ affectedRows: 1 }];
            throw new Error(`Unexpected test SQL: ${sql}`);
        }
    };
}

test('public content endpoint only selects published commerce records', async () => {
    const db = createMockDb();
    await withApi(db, async base => {
        const response = await fetch(`${base}/api/comercios`);
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).items, [{ id: 3, nombre: 'Comercio publicado' }]);
    });
    assert.match(db.calls[0].sql, /WHERE estado = 'publicado'/);
});

test('public endpoints exist for videos and gallery and filter to published items', async () => {
    const db = createMockDb();
    await withApi(db, async base => {
        for (const resource of ['videos', 'galeria']) {
            const response = await fetch(`${base}/api/${resource}`);
            assert.equal(response.status, 200);
            assert.deepEqual((await response.json()).items, []);
        }
    });
    assert.equal(db.calls.length, 2);
    assert.ok(db.calls.every(call => /WHERE estado = 'publicado'/.test(call.sql)));
});

test('admin routes reject unauthenticated and ordinary users', async () => {
    const db = createMockDb();
    await withApi(db, async base => {
        const anonymous = await fetch(`${base}/api/admin/comercios`);
        assert.equal(anonymous.status, 401);
        const ordinary = await fetch(`${base}/api/admin/comercios`, { headers: { 'X-Test-Role': 'usuario' } });
        assert.equal(ordinary.status, 403);
    });
    assert.equal(db.calls.length, 0);
});

test('admin changes require the trusted origin and the session CSRF token', async () => {
    const db = createMockDb();
    await withApi(db, async base => {
        const body = JSON.stringify({ nombre: 'Comercio de prueba', estado: 'borrador' });
        const missingCsrf = await fetch(`${base}/api/admin/comercios`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://proyecto-florece-tenango.pages.dev', 'X-Test-Role': 'administrador' }, body
        });
        assert.equal(missingCsrf.status, 403);
        const wrongOrigin = await fetch(`${base}/api/admin/comercios`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example', 'X-Test-Role': 'administrador', 'X-CSRF-Token': csrfToken }, body
        });
        assert.equal(wrongOrigin.status, 403);
    });
    assert.equal(db.calls.length, 0);
});

test('admin can create a parameterized commerce record and audit the action', async () => {
    const db = createMockDb();
    await withApi(db, async base => {
        const response = await fetch(`${base}/api/admin/comercios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json', Origin: 'https://proyecto-florece-tenango.pages.dev',
                'X-Test-Role': 'administrador', 'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ nombre: 'Comercio de prueba', categoria: 'Flores', estado: 'borrador', rol: 'administrador' })
        });
        assert.equal(response.status, 201);
        assert.deepEqual(await response.json(), { mensaje: 'Registro creado.', id: 45 });
    });
    const insert = db.calls.find(call => call.sql.includes('INSERT INTO negocios'));
    assert.ok(insert);
    assert.match(insert.sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?\)/);
    assert.deepEqual(insert.params, ['Comercio de prueba', 'Flores', null, null, null, null, null, 'borrador']);
    assert.ok(db.calls.some(call => call.sql.includes('INSERT INTO registros_actividad')));
});

test('admin video creation accepts HTTPS Drive links but rejects unsafe schemes', async () => {
    const db = createMockDb();
    await withApi(db, async base => {
        const headers = {
            'Content-Type': 'application/json', Origin: 'https://proyecto-florece-tenango.pages.dev',
            'X-Test-Role': 'administrador', 'X-CSRF-Token': csrfToken
        };
        const invalid = await fetch(`${base}/api/admin/videos`, {
            method: 'POST', headers,
            body: JSON.stringify({ titulo: 'Video', video_url: 'javascript:alert(1)' })
        });
        assert.equal(invalid.status, 400);
        const valid = await fetch(`${base}/api/admin/videos`, {
            method: 'POST', headers,
            body: JSON.stringify({ titulo: 'Reel de prueba', video_url: 'https://drive.google.com/file/d/example/preview' })
        });
        assert.equal(valid.status, 201);
    });
    const insert = db.calls.find(call => call.sql.includes('INSERT INTO videos'));
    assert.ok(insert);
    assert.deepEqual(insert.params, ['Reel de prueba', null, 'https://drive.google.com/file/d/example/preview', null, 'borrador']);
});

test('admin can edit a record and publish it using parameterized updates', async () => {
    const db = createMockDb();
    await withApi(db, async base => {
        const headers = {
            'Content-Type': 'application/json', Origin: 'https://proyecto-florece-tenango.pages.dev',
            'X-Test-Role': 'administrador', 'X-CSRF-Token': csrfToken
        };
        const edited = await fetch(`${base}/api/admin/comercios/45`, {
            method: 'PUT', headers,
            body: JSON.stringify({ nombre: 'Comercio actualizado', estado: 'borrador' })
        });
        assert.equal(edited.status, 200);
        const published = await fetch(`${base}/api/admin/comercios/45/estado`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ estado: 'publicado' })
        });
        assert.equal(published.status, 200);
    });
    const edit = db.calls.find(call => call.sql.startsWith('UPDATE negocios SET nombre'));
    assert.deepEqual(edit.params, ['Comercio actualizado', null, null, null, null, null, null, 'borrador', 45]);
    const state = db.calls.find(call => call.sql.startsWith('UPDATE negocios SET estado = ?'));
    assert.deepEqual(state.params, ['publicado', 45]);
    assert.equal(db.calls.filter(call => call.sql.includes('INSERT INTO registros_actividad')).length, 2);
});

test('delete archives a record rather than removing it', async () => {
    const db = createMockDb();
    await withApi(db, async base => {
        const response = await fetch(`${base}/api/admin/comercios/45`, {
            method: 'DELETE',
            headers: { Origin: 'https://proyecto-florece-tenango.pages.dev', 'X-Test-Role': 'administrador', 'X-CSRF-Token': csrfToken }
        });
        assert.equal(response.status, 200);
        assert.match((await response.json()).mensaje, /archivado/);
    });
    const update = db.calls.find(call => call.sql.includes('UPDATE negocios'));
    assert.ok(update);
    assert.match(update.sql, /estado = 'archivado'/);
    assert.equal(db.calls.some(call => call.sql.startsWith('DELETE FROM')), false);
});
