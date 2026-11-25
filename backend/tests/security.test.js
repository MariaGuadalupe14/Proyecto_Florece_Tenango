const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const argon2 = require('argon2');
const { once } = require('node:events');
const { hashPassword, verifyPassword, PBKDF2_SCHEME, PBKDF2_ITERATIONS } = require('../password-hash');

const users = new Map();
const accessAttempts = [];
const activity = [];
const sessionStates = [];
const testSessions = new Map();
let rejectNextUserInsert = false;
let migrationUpdateMode = 'normal';
let testIpCounter = 1;
let nextUserId = 1;
let nextSyntheticUserId = 20000;
let nextActivityId = 1;
let deletionFailureMode = 'none';
const fakeDb = {
    async getConnection() {
        let snapshot;
        return {
            async beginTransaction() {
                snapshot = {
                    users: new Map([...users].map(([email, user]) => [email, { ...user }])),
                    sessions: new Map(testSessions),
                    activity: activity.map(row => ({ ...row })),
                    accessAttempts: accessAttempts.map(row => ({ ...row }))
                };
            },
            async execute(sql, params = []) {
                if (deletionFailureMode === 'session-delete' && sql.includes('DELETE FROM sesiones')) {
                    const error = new Error('Synthetic session delete failure');
                    error.code = 'ER_SYNTHETIC_DELETE';
                    throw error;
                }
                if (deletionFailureMode === 'activity-insert' && sql.includes('INSERT INTO registros_actividad')) {
                    const error = new Error('Synthetic audit insert failure');
                    error.code = 'ER_SYNTHETIC_AUDIT';
                    throw error;
                }
                if (deletionFailureMode === 'purge-delete' && sql.includes('DELETE FROM usuarios WHERE id = ? AND activo = FALSE')) {
                    const error = new Error('Synthetic purge delete failure');
                    error.code = 'ER_SYNTHETIC_PURGE';
                    throw error;
                }
                return fakeDb.execute(sql, params);
            },
            async commit() { snapshot = null; },
            async rollback() {
                if (!snapshot) return;
                users.clear();
                for (const [email, user] of snapshot.users) users.set(email, user);
                testSessions.clear();
                for (const [id, session] of snapshot.sessions) testSessions.set(id, session);
                activity.splice(0, activity.length, ...snapshot.activity);
                accessAttempts.splice(0, accessAttempts.length, ...snapshot.accessAttempts);
                snapshot = null;
            },
            release() {}
        };
    },
    async execute(sql, params = []) {
        if (sql.includes('SELECT id FROM usuarios WHERE correo = ?')) {
            const user = users.get(params[0]);
            return [user ? [{ id: user.id }] : [], []];
        }
        if (sql.includes('INSERT INTO usuarios')) {
            if (rejectNextUserInsert) {
                rejectNextUserInsert = false;
                const error = new Error('Synthetic duplicate-key race');
                error.code = 'ER_DUP_ENTRY';
                throw error;
            }
            const [nombre, correo, password_hash] = params;
            users.set(correo, { id: nextUserId++, nombre, correo, password_hash, rol: 'usuario', activo: true });
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes('SELECT id FROM usuarios WHERE id = ? AND activo = TRUE')) {
            const user = [...users.values()].find(candidate => candidate.id === Number(params[0]));
            return [user && user.activo !== false ? [{ id: user.id }] : [], []];
        }
        if (sql.includes('SELECT ra.id AS request_id')) {
            const pending = activity.filter(row => row.evento === 'SOLICITUD_ELIMINACION_CUENTA' && row.usuarioId !== null)
                .map(row => {
                    const user = [...users.values()].find(candidate => candidate.id === row.usuarioId);
                    return user && user.activo === false
                        ? { request_id: row.id, usuario_id: user.id, fecha: row.fecha, rol: user.rol }
                        : null;
                }).filter(Boolean);
            return [pending, []];
        }
        if (sql.includes('SELECT u.id, u.password_hash, u.activo, r.nombre AS rol')) {
            const user = [...users.values()].find(candidate => candidate.id === Number(params[0]));
            return [user ? [{ id: user.id, password_hash: user.password_hash, activo: user.activo !== false, rol: user.rol }] : [], []];
        }
        if (sql.includes('SELECT id, usuario_id') && sql.includes("evento = 'SOLICITUD_ELIMINACION_CUENTA'")) {
            const row = activity.find(item => item.id === Number(params[0]) && item.evento === 'SOLICITUD_ELIMINACION_CUENTA' && item.usuarioId !== null);
            return [row ? [{ id: row.id, usuario_id: row.usuarioId }] : [], []];
        }
        if (sql.includes('SELECT u.id, u.correo, u.activo, u.fecha_creacion, r.nombre AS rol')) {
            const user = [...users.values()].find(candidate => candidate.id === Number(params[0]));
            return [user ? [{ id: user.id, correo: user.correo, activo: user.activo, fecha_creacion: user.fecha_creacion, rol: user.rol }] : [], []];
        }
        if (sql.includes("r.nombre = 'administrador'") && sql.includes('u.activo = TRUE') && sql.includes('WHERE u.id = ?')) {
            const user = [...users.values()].find(candidate => candidate.id === Number(params[0]) && candidate.rol === 'administrador' && candidate.activo !== false);
            return [user ? [{ id: user.id }] : [], []];
        }
        if (sql.includes('SELECT u.id') && sql.includes('FROM usuarios u') && sql.includes("r.nombre = 'administrador'") && sql.includes('ORDER BY u.id')) {
            return [[...users.values()]
                .filter(user => user.rol === 'administrador' && user.activo !== false)
                .sort((a, b) => a.id - b.id)
                .map(user => ({ id: user.id })), []];
        }
        if (sql.includes('SELECT session_id, data FROM sesiones')) {
            return [[...testSessions.entries()].map(([session_id, data]) => ({
                session_id,
                data: JSON.stringify(data)
            })), []];
        }
        if (sql.includes('UPDATE usuarios SET activo = FALSE WHERE id = ? AND activo = TRUE')) {
            const user = [...users.values()].find(candidate => candidate.id === Number(params[0]));
            if (!user || user.activo === false) return [{ affectedRows: 0 }, []];
            user.activo = false;
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes('DELETE FROM usuarios WHERE id = ? AND activo = FALSE')) {
            const user = [...users.values()].find(candidate => candidate.id === Number(params[0]));
            if (!user || user.activo !== false) return [{ affectedRows: 0 }, []];
            users.delete(user.correo);
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes('DELETE FROM intentos_acceso WHERE correo = ? AND fecha >= ?')) {
            const [email, createdAt] = params;
            const before = accessAttempts.length;
            for (let index = accessAttempts.length - 1; index >= 0; index--) {
                const row = accessAttempts[index];
                if (row.correo === email && row.fecha >= createdAt) accessAttempts.splice(index, 1);
            }
            return [{ affectedRows: before - accessAttempts.length }, []];
        }
        if (sql.includes('UPDATE registros_actividad') && sql.includes('SET usuario_id = NULL')) {
            let changed = 0;
            for (const row of activity) {
                if (row.usuarioId === Number(params[0])) {
                    row.usuarioId = null;
                    row.ip = '';
                    row.descripcion = 'Evento de cuenta anonimizado.';
                    changed++;
                }
            }
            return [{ affectedRows: changed }, []];
        }
        if (sql.includes('DELETE FROM sesiones WHERE session_id = ?')) {
            return [{ affectedRows: testSessions.delete(params[0]) ? 1 : 0 }, []];
        }
        if (sql.includes('UPDATE usuarios SET password_hash = ? WHERE id = ? AND password_hash = ?')) {
            const [password_hash, id, oldHash] = params;
            if (migrationUpdateMode === 'error') {
                const error = new Error('Synthetic database failure');
                error.code = 'ER_SYNTHETIC';
                throw error;
            }
            if (migrationUpdateMode === 'zero') return [{ affectedRows: 0 }, []];
            const user = [...users.values()].find(candidate => candidate.id === id);
            if (!user || user.password_hash !== oldHash) return [{ affectedRows: 0 }, []];
            user.password_hash = password_hash;
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes('SELECT u.id, u.nombre, u.correo, u.password_hash')) {
            const user = users.get(params[0]);
            return [user && user.activo !== false ? [{ ...user, activo: true }] : [], []];
        }
        if (sql.includes('INSERT INTO intentos_acceso')) {
            accessAttempts.push({ correo: params[0], ip: params[1], exitoso: params[2], fecha: new Date() });
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes('INSERT INTO registros_actividad')) {
            const completedPurge = sql.includes("'ELIMINACION_CUENTA_COMPLETADA'");
            activity.push({
                id: nextActivityId++, usuarioId: params[0],
                evento: completedPurge ? 'ELIMINACION_CUENTA_COMPLETADA' : params[1],
                descripcion: completedPurge ? params[1] : params[2],
                ip: completedPurge ? '' : params[3], fecha: new Date()
            });
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes('FROM intentos_acceso')) {
            return [[{ correo: 'test@example.invalid', direccion_ip: '192.0.2.10', intentos_fallidos: 5 }], []];
        }
        return [{ affectedRows: 1 }, []];
    }
};

const dbPath = require.resolve('../db');
const fakeDbModule = new Module(dbPath);
fakeDbModule.filename = dbPath;
fakeDbModule.loaded = true;
fakeDbModule.exports = fakeDb;
require.cache[dbPath] = fakeDbModule;

const authPath = require.resolve('../auth');
const authRoutes = require('../auth');
delete require.cache[authPath];
const freshLimitRoutes = require('../auth');
const { requireAuth, requireRole } = require('../middleware');
const { detectarIntentosSospechosos } = require('../detector');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    if (req.get('x-test-ip')) Object.defineProperty(req, 'ip', { value: req.get('x-test-ip') });
    const sessionId = req.get('x-test-session') || 'default-test-session';
    let state = testSessions.get(sessionId);
    if (!state) {
        state = {
            usuario: undefined,
            regenerate(callback) { this.regenerated = true; this.usuario = undefined; delete this.csrfToken; callback(); },
            save(callback) { this.saved = true; testSessions.set(sessionId, this); callback(); },
            destroy(callback) { this.destroyed = true; testSessions.delete(sessionId); this.usuario = undefined; delete this.csrfToken; callback(); }
        };
        testSessions.set(sessionId, state);
    }
    if (req.get('x-test-auth') === 'enabled') {
        const userId = Number(req.get('x-test-user-id') || 1);
        const user = [...users.values()].find(candidate => candidate.id === userId);
        state.usuario = user
            ? { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol }
            : { id: userId, nombre: 'Synthetic User', correo: 'synthetic@example.invalid', rol: req.get('x-test-role') || 'usuario' };
        testSessions.set(sessionId, state);
    }
    sessionStates.push(state);
    req.session = state;
    next();
});
app.use('/api/auth', authRoutes);
app.use('/api/limits', freshLimitRoutes);
app.get('/api/test-protected', requireAuth, (req, res) => res.json({ ok: true }));
app.get('/api/test-admin', requireRole('administrador'), (req, res) => res.json({ ok: true }));

let server;
let baseUrl;
test.before(async () => {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});

async function csrfFor(path, sessionId, extraHeaders = {}) {
    const endpoint = path.startsWith('/api/limits/') ? '/api/limits/csrf' : '/api/auth/csrf';
    const response = await fetch(baseUrl + endpoint, {
        headers: { origin: 'http://localhost:5500', 'x-test-session': sessionId, ...extraHeaders }
    });
    return response.json();
}

async function postRaw(path, body, extraHeaders = {}) {
    return fetch(baseUrl + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:5500', ...extraHeaders },
        body: JSON.stringify(body)
    });
}

async function post(path, body, extraHeaders = {}) {
    const sessionId = extraHeaders['x-test-session'] || 'default-test-session';
    const testIp = extraHeaders['x-test-ip'] || (path === '/api/auth/login'
        ? `192.0.2.${testIpCounter++}`
        : '192.0.2.250');
    const csrf = await csrfFor(path, sessionId, extraHeaders);
    return postRaw(path, body, {
        'x-test-session': sessionId,
        'x-test-ip': testIp,
        'x-csrf-token': csrf.csrfToken,
        ...extraHeaders
    });
}

async function createSyntheticUser({ email, role = 'usuario', password = 'Synthetic-account-test-Password-2026!' }) {
    const user = {
        id: nextSyntheticUserId++,
        nombre: 'Synthetic Test Account',
        correo: email,
        password_hash: await hashPassword(password),
        rol: role,
        activo: true,
        fecha_creacion: new Date(Date.now() - 60_000)
    };
    users.set(email, user);
    return { user, password };
}

async function createPendingDeletion({ email, role = 'usuario' }) {
    const { user } = await createSyntheticUser({ email, role });
    user.activo = false;
    const request = {
        id: nextActivityId++, usuarioId: user.id, evento: 'SOLICITUD_ELIMINACION_CUENTA',
        descripcion: 'Synthetic pending request', ip: '192.0.2.88', fecha: new Date()
    };
    activity.push(request);
    return { user, request };
}

test('registration validates fields and stores a salted PBKDF2-HMAC-SHA-256 hash', async () => {
    const invalid = await post('/api/auth/registro', {
        nombre: 'Test User', correo: 'invalid', password: 'short'
    });
    assert.equal(invalid.status, 400);

    const password = 'Synthetic-test-only-Password-2026!';
    const response = await post('/api/auth/registro', {
        nombre: 'Test User', correo: 'test@example.invalid', password
    });
    assert.equal(response.status, 201);
    const saved = users.get('test@example.invalid');
    const [scheme, iterations] = saved.password_hash.split('$');
    assert.equal(scheme, PBKDF2_SCHEME);
    assert.equal(Number(iterations), PBKDF2_ITERATIONS);
    assert.equal((await verifyPassword(password, saved.password_hash)).valid, true);
    assert.equal(saved.password_hash.includes(password), false);
});

test('registration returns conflict when a concurrent insert hits the unique email index', async () => {
    rejectNextUserInsert = true;
    const response = await post('/api/auth/registro', {
        nombre: 'Race Test', correo: 'race@example.invalid', password: 'Synthetic-race-password-2026!'
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { mensaje: 'No se pudo crear la cuenta con esos datos.' });
    assert.equal(users.has('race@example.invalid'), false);
});

test('login accepts the correct password and omits the stored hash from its response', async () => {
    const response = await post('/api/auth/login', {
        correo: 'test@example.invalid', password: 'Synthetic-test-only-Password-2026!'
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.usuario.rol, 'usuario');
    assert.equal(Object.hasOwn(body.usuario, 'password_hash'), false);
    assert.equal(accessAttempts.at(-1).exitoso, true);
    assert.equal(sessionStates.at(-1).regenerated, true);
    assert.equal(sessionStates.at(-1).saved, true);
    assert.equal(users.get('test@example.invalid').password_hash.startsWith(`${PBKDF2_SCHEME}$`), true);
});

test('an administrator with a legacy Argon2id hash can log in and is migrated safely', async () => {
    const password = 'Synthetic-legacy-admin-password-2026!';
    const legacyHash = await argon2.hash(password, { type: argon2.argon2id });
    users.set('legacy-admin@example.invalid', {
        id: 9001, nombre: 'Synthetic Admin', correo: 'legacy-admin@example.invalid',
        password_hash: legacyHash, rol: 'administrador'
    });

    const response = await post('/api/auth/login', {
        correo: 'legacy-admin@example.invalid', password
    }, { 'x-test-session': 'legacy-admin-session' });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).usuario.rol, 'administrador');
    const migratedHash = users.get('legacy-admin@example.invalid').password_hash;
    assert.notEqual(migratedHash, legacyHash);
    assert.equal(migratedHash.startsWith(`${PBKDF2_SCHEME}$`), true);
    assert.equal((await verifyPassword(password, migratedHash)).valid, true);
});

test('a verified Argon2id login succeeds when the migration update affects zero rows', async () => {
    const password = 'Synthetic-zero-row-admin-password-2026!';
    const legacyHash = await argon2.hash(password, { type: argon2.argon2id });
    users.set('zero-row-admin@example.invalid', {
        id: 9003, nombre: 'Synthetic Admin', correo: 'zero-row-admin@example.invalid',
        password_hash: legacyHash, rol: 'administrador'
    });
    const warnings = [];
    const originalWarn = console.warn;
    migrationUpdateMode = 'zero';
    console.warn = (...args) => warnings.push(args.join(' '));

    let response;
    try {
        response = await post('/api/auth/login', {
            correo: 'zero-row-admin@example.invalid', password
        }, { 'x-test-session': 'zero-row-admin-session' });
    } finally {
        migrationUpdateMode = 'normal';
        console.warn = originalWarn;
    }

    assert.equal(response.status, 200);
    assert.equal(users.get('zero-row-admin@example.invalid').password_hash, legacyHash);
    assert.equal(warnings.some(message => message.includes('did not update a row')), true);
    assert.equal(warnings.join(' ').includes(password), false);
    assert.equal(warnings.join(' ').includes(legacyHash), false);
    assert.equal(warnings.join(' ').includes('zero-row-admin@example.invalid'), false);
});

test('a verified Argon2id login succeeds and logs a safe code when the migration update errors', async () => {
    const password = 'Synthetic-db-error-admin-password-2026!';
    const legacyHash = await argon2.hash(password, { type: argon2.argon2id });
    users.set('db-error-admin@example.invalid', {
        id: 9004, nombre: 'Synthetic Admin', correo: 'db-error-admin@example.invalid',
        password_hash: legacyHash, rol: 'administrador'
    });
    const errors = [];
    const originalError = console.error;
    migrationUpdateMode = 'error';
    console.error = (...args) => errors.push(args.join(' '));

    let response;
    try {
        response = await post('/api/auth/login', {
            correo: 'db-error-admin@example.invalid', password
        }, { 'x-test-session': 'db-error-admin-session' });
    } finally {
        migrationUpdateMode = 'normal';
        console.error = originalError;
    }

    assert.equal(response.status, 200);
    assert.equal(users.get('db-error-admin@example.invalid').password_hash, legacyHash);
    assert.equal(errors.some(message => message.includes('Password hash upgrade failed: ER_SYNTHETIC')), true);
    assert.equal(errors.join(' ').includes(password), false);
    assert.equal(errors.join(' ').includes(legacyHash), false);
    assert.equal(errors.join(' ').includes('db-error-admin@example.invalid'), false);
});

test('an incorrect password does not migrate an Argon2id account', async () => {
    const password = 'Synthetic-legacy-user-password-2026!';
    const legacyHash = await argon2.hash(password, { type: argon2.argon2id });
    users.set('legacy-user@example.invalid', {
        id: 9002, nombre: 'Synthetic User', correo: 'legacy-user@example.invalid',
        password_hash: legacyHash, rol: 'usuario'
    });

    const response = await post('/api/auth/login', {
        correo: 'legacy-user@example.invalid', password: 'Wrong-synthetic-password'
    }, { 'x-test-session': 'legacy-user-session' });

    assert.equal(response.status, 401);
    assert.equal(users.get('legacy-user@example.invalid').password_hash, legacyHash);
});

test('login rejects an incorrect password and logs no password field', async () => {
    const response = await post('/api/auth/login', {
        correo: 'test@example.invalid', password: 'Wrong-synthetic-password'
    });
    assert.equal(response.status, 401);
    assert.equal(accessAttempts.at(-1).exitoso, false);
    assert.deepEqual(Object.keys(accessAttempts.at(-1)).sort(), ['correo', 'exitoso', 'fecha', 'ip']);
});

test('logout records the event and destroys an authenticated session', async () => {
    const response = await post('/api/auth/logout', {}, { 'x-test-auth': 'enabled' });
    assert.equal(response.status, 200);
    assert.equal(activity.at(-1).evento, 'CIERRE_SESION');
    assert.equal(sessionStates.at(-1).destroyed, true);
});

test('account deletion requires an authenticated user and a valid CSRF token', async () => {
    const { user, password } = await createSyntheticUser({ email: 'delete-auth@example.invalid' });
    const unauthenticated = await post('/api/auth/delete-account', { password }, { 'x-test-session': 'delete-anon', 'x-test-ip': '192.0.2.31' });
    assert.equal(unauthenticated.status, 401);

    const noToken = await postRaw('/api/auth/delete-account', { password }, {
        'x-test-session': 'delete-no-csrf', 'x-test-auth': 'enabled', 'x-test-user-id': String(user.id), 'x-test-ip': '192.0.2.32'
    });
    assert.equal(noToken.status, 403);

    const csrfHeaders = { 'x-test-session': 'delete-bad-csrf', 'x-test-auth': 'enabled', 'x-test-user-id': String(user.id) };
    const csrf = await csrfFor('/api/auth/delete-account', 'delete-bad-csrf', csrfHeaders);
    const invalid = await postRaw('/api/auth/delete-account', { password }, {
        ...csrfHeaders, 'x-test-ip': '192.0.2.33', 'x-csrf-token': `${csrf.csrfToken}invalid`
    });
    assert.equal(invalid.status, 403);
    assert.equal(users.get(user.correo).activo, true);
});

test('incorrect current password leaves the account and all of its sessions intact', async () => {
    const { user } = await createSyntheticUser({ email: 'delete-wrong-password@example.invalid' });
    testSessions.set('delete-wrong-saved-session', { usuario: { id: user.id, rol: user.rol } });
    const response = await post('/api/auth/delete-account', { password: 'Synthetic-wrong-password-2026!' }, {
        'x-test-session': 'delete-wrong-current', 'x-test-auth': 'enabled', 'x-test-user-id': String(user.id), 'x-test-ip': '192.0.2.34'
    });
    assert.equal(response.status, 401);
    assert.equal(user.activo, true);
    assert.equal(testSessions.has('delete-wrong-saved-session'), true);
});

test('account deletion revokes only that account sessions and blocks future login', async () => {
    const { user, password } = await createSyntheticUser({ email: 'delete-target@example.invalid' });
    const { user: otherUser } = await createSyntheticUser({ email: 'delete-other@example.invalid' });
    const originalHash = user.password_hash;
    const previousAudit = { usuarioId: user.id, evento: 'SYNTHETIC_PREVIOUS_ACTIVITY' };
    activity.push(previousAudit);
    testSessions.set('delete-target-session-one', { usuario: { id: user.id, rol: user.rol }, csrfToken: 'synthetic-one' });
    testSessions.set('delete-target-session-two', { usuario: { id: user.id, rol: user.rol }, csrfToken: 'synthetic-two' });
    testSessions.set('delete-other-session', { usuario: { id: otherUser.id, rol: otherUser.rol } });

    const response = await post('/api/auth/delete-account', { password, userId: otherUser.id }, {
        'x-test-session': 'delete-target-current', 'x-test-auth': 'enabled', 'x-test-user-id': String(user.id), 'x-test-ip': '192.0.2.35'
    });
    assert.equal(response.status, 200);
    assert.equal(user.activo, false);
    assert.equal(users.has(user.correo), true);
    assert.equal(users.get(user.correo).password_hash, originalHash);
    assert.equal(testSessions.has('delete-target-session-one'), false);
    assert.equal(testSessions.has('delete-target-session-two'), false);
    assert.equal(testSessions.has('delete-target-current'), false);
    assert.equal(testSessions.has('delete-other-session'), true);
    assert.equal(otherUser.activo, true);
    assert.equal(activity.includes(previousAudit), true);
    assert.equal(activity.at(-1).evento, 'SOLICITUD_ELIMINACION_CUENTA');
    assert.equal(activity.at(-1).usuarioId, user.id);

    const login = await post('/api/auth/login', { correo: user.correo, password }, { 'x-test-session': 'blocked-login' });
    assert.equal(login.status, 401);
    assert.equal(sessionStates.at(-1).saved, undefined);
});

test('requireAuth rejects and destroys an existing session for a blocked account', async () => {
    const { user } = await createSyntheticUser({ email: 'blocked-middleware@example.invalid' });
    user.activo = false;
    testSessions.set('blocked-existing-session', {
        usuario: { id: user.id, rol: user.rol },
        destroy(callback) { testSessions.delete('blocked-existing-session'); callback(); }
    });
    const response = await fetch(baseUrl + '/api/test-protected', {
        headers: { 'x-test-session': 'blocked-existing-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(user.id) }
    });
    assert.equal(response.status, 401);
    assert.equal(testSessions.has('blocked-existing-session'), false);
});

test('MySQL errors roll back account blocking and do not report success', async () => {
    const { user, password } = await createSyntheticUser({ email: 'delete-db-error@example.invalid' });
    testSessions.set('delete-db-error-saved', { usuario: { id: user.id, rol: user.rol } });
    const errors = [];
    const originalError = console.error;
    deletionFailureMode = 'session-delete';
    console.error = (...args) => errors.push(args.join(' '));
    let response;
    try {
        response = await post('/api/auth/delete-account', { password }, {
            'x-test-session': 'delete-db-error-current', 'x-test-auth': 'enabled', 'x-test-user-id': String(user.id), 'x-test-ip': '192.0.2.36'
        });
    } finally {
        deletionFailureMode = 'none';
        console.error = originalError;
    }
    assert.equal(response.status, 500);
    assert.equal(users.get(user.correo).activo, true);
    assert.equal(testSessions.has('delete-db-error-saved'), true);
    assert.equal((await response.json()).mensaje.includes('Solicitud fue registrada'), false);
    assert.equal(errors.join(' ').includes(password), false);
    assert.equal(errors.join(' ').includes(user.correo), false);
});

test('the last active administrator cannot request account deletion', async () => {
    for (const account of users.values()) {
        if (account.rol === 'administrador') account.activo = false;
    }
    const { user, password } = await createSyntheticUser({ email: 'last-admin@example.invalid', role: 'administrador' });
    testSessions.set('last-admin-saved-session', { usuario: { id: user.id, rol: user.rol } });
    const response = await post('/api/auth/delete-account', { password }, {
        'x-test-session': 'last-admin-current', 'x-test-auth': 'enabled', 'x-test-user-id': String(user.id), 'x-test-role': 'administrador', 'x-test-ip': '192.0.2.37'
    });
    assert.equal(response.status, 409);
    assert.equal(user.activo, true);
    assert.equal(testSessions.has('last-admin-saved-session'), true);
});

test('admin can permanently delete only a pending blocked account and anonymizes linked records', async () => {
    const { user: admin } = await createSyntheticUser({ email: 'purge-admin@example.invalid', role: 'administrador' });
    const { user: target, request } = await createPendingDeletion({ email: 'purge-target@example.invalid' });
    const { user: other } = await createSyntheticUser({ email: 'purge-other@example.invalid' });
    const createdAt = target.fecha_creacion;
    activity.push({ id: nextActivityId++, usuarioId: target.id, evento: 'SYNTHETIC_PRIVATE_EVENT', descripcion: 'possible identifying text', ip: '198.51.100.24', fecha: new Date() });
    activity.push({ id: nextActivityId++, usuarioId: other.id, evento: 'SYNTHETIC_OTHER_EVENT', descripcion: 'keep this', ip: '198.51.100.25', fecha: new Date() });
    testSessions.set('purge-target-session', { usuario: { id: target.id, rol: 'usuario' } });
    testSessions.set('purge-other-session', { usuario: { id: other.id, rol: 'usuario' } });
    accessAttempts.push(
        { correo: target.correo, ip: '198.51.100.24', exitoso: false, fecha: new Date(createdAt.getTime() + 1) },
        { correo: target.correo, ip: '198.51.100.23', exitoso: false, fecha: new Date(createdAt.getTime() - 1) },
        { correo: other.correo, ip: '198.51.100.25', exitoso: false, fecha: new Date() }
    );

    const response = await post(`/api/auth/admin/account-deletion-requests/${request.id}/purge`, {}, {
        'x-test-session': 'purge-admin-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(admin.id)
    });
    assert.equal(response.status, 200);
    assert.equal(users.has(target.correo), false);
    assert.equal(users.has(other.correo), true);
    assert.equal(users.has(admin.correo), true);
    assert.equal(testSessions.has('purge-target-session'), false);
    assert.equal(testSessions.has('purge-other-session'), true);
    assert.equal(accessAttempts.some(row => row.correo === target.correo && row.fecha >= createdAt), false);
    assert.equal(accessAttempts.some(row => row.correo === target.correo), true, 'ambiguous attempts before account creation remain');
    assert.equal(accessAttempts.some(row => row.correo === other.correo), true);
    const targetAudit = activity.filter(row => row.id === request.id || row.evento === 'SYNTHETIC_PRIVATE_EVENT');
    assert.equal(targetAudit.length, 2);
    assert.equal(targetAudit.every(row => row.usuarioId === null && row.ip === '' && row.descripcion === 'Evento de cuenta anonimizado.'), true);
    assert.equal(activity.some(row => row.usuarioId === other.id && row.ip === '198.51.100.25'), true);
    assert.equal(activity.at(-1).evento, 'ELIMINACION_CUENTA_COMPLETADA');
    assert.equal(activity.at(-1).usuarioId, admin.id);
});

test('only administrators can see or execute account deletion requests', async () => {
    const { user: normal } = await createSyntheticUser({ email: 'purge-normal@example.invalid' });
    const { user: target, request } = await createPendingDeletion({ email: 'purge-private-target@example.invalid' });
    const response = await post(`/api/auth/admin/account-deletion-requests/${request.id}/purge`, {}, {
        'x-test-session': 'purge-normal-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(normal.id)
    });
    assert.equal(response.status, 403);
    assert.equal(users.has(target.correo), true);
    const listResponse = await fetch(`${baseUrl}/api/auth/admin/account-deletion-requests`, {
        headers: { 'x-test-session': 'purge-normal-list-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(normal.id) }
    });
    assert.equal(listResponse.status, 403);
});

test('admin request list exposes only the synthetic account id, role, and request date', async () => {
    const { user: admin } = await createSyntheticUser({ email: 'purge-list-admin@example.invalid', role: 'administrador' });
    const { user: target } = await createPendingDeletion({ email: 'purge-list-target@example.invalid' });
    const response = await fetch(`${baseUrl}/api/auth/admin/account-deletion-requests`, {
        headers: { 'x-test-session': 'purge-admin-list-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(admin.id) }
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    const request = result.solicitudes.find(row => row.usuario_id === target.id);
    assert.ok(request);
    assert.equal(request.rol, 'usuario');
    assert.equal(Object.hasOwn(request, 'correo'), false);
    assert.equal(Object.hasOwn(request, 'nombre'), false);
    assert.equal(Object.hasOwn(request, 'password_hash'), false);
});

test('purge rechecks the administrator role in MySQL when a session role is stale', async () => {
    const { user: demoted } = await createSyntheticUser({ email: 'purge-demoted-admin@example.invalid' });
    const { user: target, request } = await createPendingDeletion({ email: 'purge-demoted-target@example.invalid' });
    testSessions.set('purge-stale-role-session', { usuario: { id: demoted.id, rol: 'administrador' } });
    const response = await post(`/api/auth/admin/account-deletion-requests/${request.id}/purge`, {}, {
        'x-test-session': 'purge-stale-role-session'
    });
    assert.equal(response.status, 403);
    assert.equal(users.has(target.correo), true);
});

test('purge rejects active accounts and requests that are no longer pending', async () => {
    const { user: admin } = await createSyntheticUser({ email: 'purge-check-admin@example.invalid', role: 'administrador' });
    const { user: active, request: forgedPending } = await createPendingDeletion({ email: 'purge-active@example.invalid' });
    active.activo = true;
    const activeResponse = await post(`/api/auth/admin/account-deletion-requests/${forgedPending.id}/purge`, {}, {
        'x-test-session': 'purge-active-admin-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(admin.id)
    });
    assert.equal(activeResponse.status, 409);
    assert.equal(users.has(active.correo), true);

    const missing = await post('/api/auth/admin/account-deletion-requests/999999/purge', {}, {
        'x-test-session': 'purge-missing-admin-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(admin.id)
    });
    assert.equal(missing.status, 404);
});

test('purge requires valid CSRF and a surviving active administrator', async () => {
    const { user: admin } = await createSyntheticUser({ email: 'purge-csrf-admin@example.invalid', role: 'administrador' });
    const { user: target, request } = await createPendingDeletion({ email: 'purge-csrf-target@example.invalid' });
    const headers = { origin: 'http://localhost:5500', 'x-test-session': 'purge-no-csrf', 'x-test-auth': 'enabled', 'x-test-user-id': String(admin.id) };
    const noCsrf = await postRaw(`/api/auth/admin/account-deletion-requests/${request.id}/purge`, {}, headers);
    assert.equal(noCsrf.status, 403);
    assert.equal(users.has(target.correo), true);

    // The sole active administrator cannot be purged, even if a stale request exists.
    const adminRequest = { id: nextActivityId++, usuarioId: admin.id, evento: 'SOLICITUD_ELIMINACION_CUENTA', fecha: new Date() };
    activity.push(adminRequest);
    const lastAdmin = await post(`/api/auth/admin/account-deletion-requests/${adminRequest.id}/purge`, {}, {
        'x-test-session': 'purge-last-admin-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(admin.id)
    });
    assert.equal(lastAdmin.status, 409);
    assert.equal(users.has(admin.correo), true);
});

test('database error during permanent deletion rolls back sessions, attempts, and audit changes', async () => {
    const { user: admin } = await createSyntheticUser({ email: 'purge-rollback-admin@example.invalid', role: 'administrador' });
    const { user: target, request } = await createPendingDeletion({ email: 'purge-rollback-target@example.invalid' });
    const audit = { id: nextActivityId++, usuarioId: target.id, evento: 'SYNTHETIC_ROLLBACK', descripcion: 'synthetic', ip: '203.0.113.20', fecha: new Date() };
    activity.push(audit);
    const attempt = { correo: target.correo, ip: '203.0.113.21', exitoso: false, fecha: new Date() };
    accessAttempts.push(attempt);
    testSessions.set('purge-rollback-target-session', { usuario: { id: target.id, rol: 'usuario' } });
    const originalError = console.error;
    const errors = [];
    deletionFailureMode = 'purge-delete';
    console.error = (...args) => errors.push(args.join(' '));
    let response;
    try {
        response = await post(`/api/auth/admin/account-deletion-requests/${request.id}/purge`, {}, {
            'x-test-session': 'purge-rollback-admin-session', 'x-test-auth': 'enabled', 'x-test-user-id': String(admin.id)
        });
    } finally {
        deletionFailureMode = 'none';
        console.error = originalError;
    }
    assert.equal(response.status, 500);
    assert.equal(users.has(target.correo), true);
    assert.equal(testSessions.has('purge-rollback-target-session'), true);
    assert.equal(accessAttempts.some(row => row.correo === attempt.correo && row.fecha.getTime() === attempt.fecha.getTime()), true);
    assert.equal(activity.find(row => row.id === audit.id).usuarioId, target.id);
    assert.equal(errors.join(' ').includes(target.correo), false);
});

test('auth middleware distinguishes unauthenticated, ordinary, and admin roles', async () => {
    const run = async (middleware, req) => {
        let status;
        let advanced = false;
        await middleware(req, { status(value) { status = value; return this; }, json() {} }, () => { advanced = true; });
        return { status, advanced };
    };
    assert.equal((await run(requireAuth, {})).status, 401);
    assert.equal((await run(requireRole('administrador'), { session: { usuario: { rol: 'usuario' } } })).status, 403);
    const activeUser = [...users.values()].find(user => user.activo !== false);
    assert.equal((await run(requireRole('usuario'), { session: { usuario: { id: activeUser.id, rol: 'usuario' } } })).advanced, true);
});

test('login and registration limits reject the sixth request in the configured window', async () => {
    const login = [];
    const registration = [];
    for (let i = 0; i < 6; i++) {
        login.push(await post('/api/limits/login', {}));
        registration.push(await post('/api/limits/registro', {}));
    }
    assert.equal(login.slice(0, 5).every(r => r.status === 400), true);
    assert.equal(login[5].status, 429);
    assert.equal(registration.slice(0, 5).every(r => r.status === 400), true);
    assert.equal(registration[5].status, 429);
});

test('detector emits at most one alert per account and IP within its cooldown', async () => {
    const originalWarn = console.warn;
    let count = 0;
    console.warn = () => { count++; };
    try {
        await detectarIntentosSospechosos();
        await detectarIntentosSospechosos();
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(count, 1);
});


test('write endpoints reject missing CSRF tokens and untrusted origins', async () => {
    const noToken = await postRaw('/api/auth/registro', {
        nombre: 'Test User', correo: 'csrf@example.invalid', password: 'Synthetic-csrf-test-2026!'
    }, { 'x-test-session': 'csrf-test-session' });
    assert.equal(noToken.status, 403);

    const csrf = await csrfFor('/api/auth/registro', 'csrf-test-session');
    const wrongOrigin = await postRaw('/api/auth/registro', {
        nombre: 'Test User', correo: 'csrf@example.invalid', password: 'Synthetic-csrf-test-2026!'
    }, { 'x-test-session': 'csrf-test-session', 'x-csrf-token': csrf.csrfToken, origin: 'https://attacker.invalid' });
    assert.equal(wrongOrigin.status, 403);
});
