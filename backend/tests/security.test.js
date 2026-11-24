const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const argon2 = require('argon2');
const { once } = require('node:events');
const { verifyPassword, PBKDF2_SCHEME, PBKDF2_ITERATIONS } = require('../password-hash');

const users = new Map();
const accessAttempts = [];
const activity = [];
const sessionStates = [];
const testSessions = new Map();
let rejectNextUserInsert = false;
let migrationUpdateMode = 'normal';
let testIpCounter = 1;
const fakeDb = {
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
            users.set(correo, { id: users.size + 1, nombre, correo, password_hash, rol: 'usuario' });
            return [{ affectedRows: 1 }, []];
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
            return [user ? [{ ...user, activo: true }] : [], []];
        }
        if (sql.includes('INSERT INTO intentos_acceso')) {
            accessAttempts.push({ correo: params[0], ip: params[1], exitoso: params[2] });
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes('INSERT INTO registros_actividad')) {
            activity.push({ usuarioId: params[0], evento: params[1] });
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
            save(callback) { this.saved = true; callback(); },
            destroy(callback) { this.destroyed = true; this.usuario = undefined; delete this.csrfToken; callback(); }
        };
        testSessions.set(sessionId, state);
    }
    if (req.get('x-test-auth') === 'enabled') {
        state.usuario = { id: 1, nombre: 'Test User', correo: 'test@example.invalid', rol: 'usuario' };
    }
    sessionStates.push(state);
    req.session = state;
    next();
});
app.use('/api/auth', authRoutes);
app.use('/api/limits', freshLimitRoutes);

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
    assert.deepEqual(Object.keys(accessAttempts.at(-1)).sort(), ['correo', 'exitoso', 'ip']);
});

test('logout records the event and destroys an authenticated session', async () => {
    const response = await post('/api/auth/logout', {}, { 'x-test-auth': 'enabled' });
    assert.equal(response.status, 200);
    assert.equal(activity.at(-1).evento, 'CIERRE_SESION');
    assert.equal(sessionStates.at(-1).destroyed, true);
});

test('auth middleware distinguishes unauthenticated, ordinary, and admin roles', () => {
    const run = (middleware, req) => {
        let status;
        let advanced = false;
        middleware(req, { status(value) { status = value; return this; }, json() {} }, () => { advanced = true; });
        return { status, advanced };
    };
    assert.equal(run(requireAuth, {}).status, 401);
    assert.equal(run(requireRole('administrador'), { session: { usuario: { rol: 'usuario' } } }).status, 403);
    assert.equal(run(requireRole('administrador'), { session: { usuario: { rol: 'administrador' } } }).advanced, true);
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
