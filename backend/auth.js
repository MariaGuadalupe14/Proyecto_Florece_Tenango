
const express = require('express');
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('./password-hash');
const db = require('./db');
const { rateLimit } = require('express-rate-limit');
const { requireAuth, requireRole } = require('./middleware');

const router = express.Router();

// REGISTRAR INTENTOS DE INICIO DE SESIÓN
async function registrarIntento(correo, ip, exitoso) {
    try {
        await db.execute(
            `INSERT INTO intentos_acceso
            (correo, direccion_ip, exitoso)
            VALUES (?, ?, ?)`,
            [correo, ip, exitoso]
        );
    } catch (error) {
        console.error('Error al registrar intento:', (error.code || 'UNKNOWN_ERROR'));
    }
}

// REGISTRAR ACTIVIDADES
async function registrarActividad(usuarioId, evento, descripcion, ip) {
    try {
        await db.execute(
            `INSERT INTO registros_actividad
            (usuario_id, evento, descripcion, direccion_ip)
            VALUES (?, ?, ?, ?)`,
            [usuarioId, evento, descripcion, ip]
        );
    } catch (error) {
        console.error('Error al registrar actividad:', (error.code || 'UNKNOWN_ERROR'));
    }
}

// LIMITAR INTENTOS DE INICIO DE SESIÓN
const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        mensaje: 'Demasiados intentos. Intenta nuevamente en 15 minutos.'
    }
});

const registrationLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { mensaje: 'Registration limit reached. Try again later.' }
});

const csrfTokenLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { mensaje: 'Demasiadas solicitudes. Intenta nuevamente.' }
});

const accountDeletionLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { mensaje: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' }
});

const adminAccountDeletionLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { mensaje: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' }
});

function isTrustedBrowserOrigin(origin = '') {
    if (origin === 'https://proyecto-florece-tenango.pages.dev') return true;
    if (process.env.NODE_ENV === 'production') return false;
    try {
        const parsed = new URL(origin);
        return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

router.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (!isTrustedBrowserOrigin(req.get('Origin'))) {
        return res.status(403).json({ mensaje: 'Origen no autorizado.' });
    }
    next();
});

router.get('/csrf', csrfTokenLimit, (req, res) => {
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ csrfToken: req.session.csrfToken });
});

function requireCsrf(req, res, next) {
    const provided = req.get('X-CSRF-Token');
    const expected = req.session && req.session.csrfToken;
    if (typeof provided !== 'string' || typeof expected !== 'string') {
        return res.status(403).json({ mensaje: 'Token CSRF no v?lido.' });
    }
    const suppliedBytes = Buffer.from(provided, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) {
        return res.status(403).json({ mensaje: 'Token CSRF no v?lido.' });
    }
    next();
}

// REGISTRO
router.post('/registro', registrationLimit, requireCsrf, async (req, res) => {
    try {
        const { nombre, correo, password } = req.body;

        if (
            typeof nombre !== 'string' ||
            typeof correo !== 'string' ||
            typeof password !== 'string'
        ) {
            return res.status(400).json({
                mensaje: 'Debes proporcionar nombre, correo y contraseña.'
            });
        }

        const nombreLimpio = nombre.trim();
        const correoLimpio = correo.trim().toLowerCase();

        if (nombreLimpio.length < 2 || nombreLimpio.length > 100) {
            return res.status(400).json({
                mensaje: 'El nombre debe tener entre 2 y 100 caracteres.'
            });
        }

        if (
            correoLimpio.length > 150 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio)
        ) {
            return res.status(400).json({
                mensaje: 'El correo electrónico no es válido.'
            });
        }

        if (password.length < 12 || password.length > 128) {
            return res.status(400).json({
                mensaje: 'La contraseña debe tener entre 12 y 128 caracteres.'
            });
        }

        const [existentes] = await db.execute(
            'SELECT id FROM usuarios WHERE correo = ?',
            [correoLimpio]
        );

        if (existentes.length > 0) {
            return res.status(409).json({
                mensaje: 'No se pudo crear la cuenta con esos datos.'
            });
        }

        const passwordHash = await hashPassword(password);

        // El registro público solamente crea usuarios normales
        const [resultado] = await db.execute(
            `INSERT INTO usuarios
            (nombre, correo, password_hash, rol_id)
            SELECT ?, ?, ?, id
            FROM roles
            WHERE nombre = 'usuario'`,
            [nombreLimpio, correoLimpio, passwordHash]
        );

        if (resultado.affectedRows !== 1) {
            return res.status(500).json({
                mensaje: 'No se pudo completar el registro.'
            });
        }

        return res.status(201).json({
            mensaje: 'Cuenta creada correctamente. Ya puedes iniciar sesión.'
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                mensaje: 'No se pudo crear la cuenta con esos datos.'
            });
        }
        console.error('Error en registro:', (error.code || 'UNKNOWN_ERROR'));

        return res.status(500).json({
            mensaje: 'Ocurrió un error al crear la cuenta.'
        });
    }
});

// INICIO DE SESIÓN
router.post('/login', loginLimit, requireCsrf, async (req, res) => {
    try {
        const { correo, password } = req.body;

        if (
            typeof correo !== 'string' ||
            typeof password !== 'string' ||
            correo.length > 150 ||
            password.length < 1 ||
            password.length > 128
        ) {
            return res.status(400).json({
                mensaje: 'Correo o contraseña no válidos.'
            });
        }

        const correoLimpio = correo.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio)) {
            return res.status(400).json({ mensaje: 'Correo o contrasena no validos.' });
        }
        const ip = req.ip;

        const [usuarios] = await db.execute(
            `SELECT u.id, u.nombre, u.correo, u.password_hash,
            r.nombre AS rol
            FROM usuarios u
            INNER JOIN roles r ON u.rol_id = r.id
            WHERE u.correo = ? AND u.activo = TRUE`,
            [correoLimpio]
        );

        // Correo inexistente o cuenta inactiva
        if (usuarios.length === 0) {
            await registrarIntento(correoLimpio, ip, false);

            return res.status(401).json({
                mensaje: 'Correo o contraseña incorrectos.'
            });
        }

        const usuario = usuarios[0];

        const verification = await verifyPassword(password, usuario.password_hash);

        // Contraseña incorrecta
        if (!verification.valid) {
            await registrarIntento(correoLimpio, ip, false);

            return res.status(401).json({
                mensaje: 'Correo o contraseña incorrectos.'
            });
        }

        if (verification.needsRehash) {
            try {
                const upgradedHash = await hashPassword(password);
                const [upgradeResult] = await db.execute(
                    'UPDATE usuarios SET password_hash = ? WHERE id = ? AND password_hash = ?',
                    [upgradedHash, usuario.id, usuario.password_hash]
                );

                if (upgradeResult?.affectedRows !== 1) {
                    console.warn('Password hash upgrade did not update a row; the stored hash may have changed concurrently.');
                }
            } catch (error) {
                // A valid login remains available; a later login can retry a failed upgrade.
                console.error('Password hash upgrade failed:', (error.code || 'UNKNOWN_ERROR'));
            }
        }

        // Crear una sesión nueva
        const loginConnection = await db.getConnection();
        let loginTransactionOpen = false;
        let newSessionSaved = false;
        try {
            await loginConnection.beginTransaction();
            loginTransactionOpen = true;
            const [activeAccounts] = await loginConnection.execute(
                'SELECT id FROM usuarios WHERE id = ? AND activo = TRUE FOR UPDATE',
                [usuario.id]
            );
            if (activeAccounts.length !== 1) {
                await loginConnection.rollback();
                loginTransactionOpen = false;
                await registrarIntento(correoLimpio, ip, false);
                return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos.' });
            }

        await new Promise((resolve, reject) => {
            req.session.regenerate(error => {
                if (error) reject(error);
                else resolve();
            });
        });

        req.session.usuario = {
            id: usuario.id,
            nombre: usuario.nombre,
            correo: usuario.correo,
            rol: usuario.rol
        };

        // Guardar la sesión
        req.session.csrfToken = crypto.randomBytes(32).toString('base64url');

        await new Promise((resolve, reject) => {
            req.session.save(error => {
                if (error) reject(error);
                else resolve();
            });
        });
        newSessionSaved = true;
        await loginConnection.commit();
        loginTransactionOpen = false;
        } catch (error) {
            if (loginTransactionOpen) {
                try { await loginConnection.rollback(); } catch (rollbackError) {
                    console.error('Login rollback failed:', rollbackError.code || 'DB_ERROR');
                }
            }
            if (newSessionSaved || req.session.usuario?.id === usuario.id) {
                try {
                    await new Promise((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
                } catch (destroyError) {
                    console.error('Could not discard an uncommitted login session:', destroyError.code || 'DB_ERROR');
                }
            }
            throw error;
        } finally {
            loginConnection.release();
        }

        // Registrar el acceso exitoso
        await registrarIntento(correoLimpio, ip, true);

        await registrarActividad(
            usuario.id,
            'INICIO_SESION',
            'El usuario inició sesión correctamente.',
            ip
        );

        return res.json({
            mensaje: 'Inicio de sesión correcto.',
            usuario: req.session.usuario,
            csrfToken: req.session.csrfToken
        });

    } catch (error) {
        console.error('Error en login:', (error.code || 'UNKNOWN_ERROR'));

        return res.status(500).json({
            mensaje: 'Ocurrió un error al iniciar sesión.'
        });
    }
});

// CONSULTAR SESIÓN ACTUAL
router.get('/me', requireAuth, (req, res) => {
    if (!req.session.usuario) {
        return res.status(401).json({
            mensaje: 'No has iniciado sesión.'
        });
    }

    res.json({
        usuario: req.session.usuario
    });
});

// Solicitud de eliminación de cuenta (bloqueo reversible; no elimina datos físicamente).
router.post('/delete-account', accountDeletionLimit, requireAuth, requireCsrf, async (req, res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
        return res.status(400).json({ mensaje: 'Confirma la contraseña actual para continuar.' });
    }

    const userId = req.session.usuario.id;
    const ip = req.ip;
    let connection;
    let transactionOpen = false;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionOpen = true;

        const [accountRows] = await connection.execute(
            `SELECT u.id, u.password_hash, u.activo, r.nombre AS rol
             FROM usuarios u
             INNER JOIN roles r ON r.id = u.rol_id
             WHERE u.id = ?
             FOR UPDATE`,
            [userId]
        );
        const account = accountRows[0];
        if (!account || !account.activo) {
            await connection.rollback();
            transactionOpen = false;
            return res.status(401).json({ mensaje: 'No se pudo verificar la cuenta.' });
        }

        const verification = await verifyPassword(password, account.password_hash);
        if (!verification.valid) {
            await connection.rollback();
            transactionOpen = false;
            return res.status(401).json({ mensaje: 'La contraseña actual no es correcta.' });
        }

        if (account.rol === 'administrador') {
            const [admins] = await connection.execute(
                `SELECT u.id
                 FROM usuarios u
                 INNER JOIN roles r ON r.id = u.rol_id
                 WHERE r.nombre = 'administrador' AND u.activo = TRUE
                 ORDER BY u.id
                 FOR UPDATE`
            );
            if (admins.length <= 1) {
                await connection.rollback();
                transactionOpen = false;
                return res.status(409).json({ mensaje: 'No se puede bloquear la última cuenta administradora activa.' });
            }
        }

        // Read only session metadata. Fail closed if a row cannot be parsed.
        const [sessionRows] = await connection.execute('SELECT session_id, data FROM sesiones');
        const matchingSessionIds = [];
        for (const row of sessionRows) {
            let data = row.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch {
                    const error = new Error('Unparseable session data');
                    error.code = 'SESSION_DATA_UNREADABLE';
                    throw error;
                }
            }
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                const error = new Error('Invalid session data');
                error.code = 'SESSION_DATA_UNREADABLE';
                throw error;
            }
            if (data.usuario && String(data.usuario.id) === String(userId)) {
                matchingSessionIds.push(row.session_id);
            }
        }

        const [blockResult] = await connection.execute(
            'UPDATE usuarios SET activo = FALSE WHERE id = ? AND activo = TRUE',
            [userId]
        );
        if (blockResult.affectedRows !== 1) {
            const error = new Error('Account block did not update one row');
            error.code = 'ACCOUNT_BLOCK_FAILED';
            throw error;
        }

        for (const sessionId of matchingSessionIds) {
            await connection.execute('DELETE FROM sesiones WHERE session_id = ?', [sessionId]);
        }

        await connection.execute(
            `INSERT INTO registros_actividad (usuario_id, evento, descripcion, direccion_ip)
             VALUES (?, ?, ?, ?)`,
            [userId, 'SOLICITUD_ELIMINACION_CUENTA', 'La cuenta fue bloqueada por solicitud de eliminación.', ip]
        );

        await connection.commit();
        transactionOpen = false;
        req.session = null;
        res.clearCookie('florece.sid', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true',
            sameSite: 'lax'
        });
        return res.json({
            mensaje: 'La solicitud fue registrada. La cuenta quedó bloqueada y sus sesiones fueron invalidadas; los datos aún no se han eliminado físicamente.'
        });
    } catch (error) {
        if (transactionOpen) {
            try { await connection.rollback(); } catch (rollbackError) {
                console.error('Account deletion rollback failed:', rollbackError.code || 'DB_ERROR');
            }
        }
        console.error('Account deletion request failed:', error.code || 'DB_ERROR');
        return res.status(500).json({ mensaje: 'No se pudo completar la solicitud. La cuenta no se confirmó como bloqueada.' });
    } finally {
        connection?.release();
    }
});

// Lista solicitudes pendientes sin exponer nombre, correo ni hash de la cuenta.
router.get('/admin/account-deletion-requests', requireRole('administrador'), async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT ra.id AS request_id, ra.usuario_id, ra.fecha, r.nombre AS rol
             FROM registros_actividad ra
             INNER JOIN usuarios u ON u.id = ra.usuario_id
             INNER JOIN roles r ON r.id = u.rol_id
             WHERE ra.evento = 'SOLICITUD_ELIMINACION_CUENTA' AND u.activo = FALSE
             ORDER BY ra.fecha ASC, ra.id ASC`
        );
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ solicitudes: rows });
    } catch (error) {
        console.error('Could not list account deletion requests:', error.code || 'DB_ERROR');
        return res.status(500).json({ mensaje: 'No se pudieron consultar las solicitudes.' });
    }
});

// El borrado definitivo solo se ejecuta para una solicitud pendiente y dentro de
// una transacción. Se conserva auditoría anonimizada y no se tocan roles/contenido.
router.post(
    '/admin/account-deletion-requests/:requestId/purge',
    adminAccountDeletionLimit,
    requireRole('administrador'),
    requireCsrf,
    async (req, res) => {
        const requestId = Number(req.params.requestId);
        if (!Number.isSafeInteger(requestId) || requestId < 1) {
            return res.status(400).json({ mensaje: 'La solicitud indicada no es válida.' });
        }

        let connection;
        let transactionOpen = false;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            transactionOpen = true;

            const [requestRows] = await connection.execute(
                `SELECT id, usuario_id
                 FROM registros_actividad
                 WHERE id = ? AND evento = 'SOLICITUD_ELIMINACION_CUENTA' AND usuario_id IS NOT NULL
                 FOR UPDATE`,
                [requestId]
            );
            const pendingRequest = requestRows[0];
            if (!pendingRequest) {
                await connection.rollback();
                transactionOpen = false;
                return res.status(404).json({ mensaje: 'La solicitud ya no está pendiente.' });
            }

            const targetId = Number(pendingRequest.usuario_id);
            const [targetRows] = await connection.execute(
                `SELECT u.id, u.correo, u.activo, u.fecha_creacion, r.nombre AS rol
                 FROM usuarios u
                 INNER JOIN roles r ON r.id = u.rol_id
                 WHERE u.id = ?
                 FOR UPDATE`,
                [targetId]
            );
            const target = targetRows[0];
            if (!target || target.activo === true || Number(target.activo) === 1) {
                await connection.rollback();
                transactionOpen = false;
                return res.status(409).json({ mensaje: 'Solo se pueden eliminar cuentas bloqueadas con solicitud pendiente.' });
            }

            // Revalida al administrador en MySQL dentro de la transacción. No se
            // confía únicamente en el rol que quedó serializado en la sesión.
            const [actorRows] = await connection.execute(
                `SELECT u.id
                 FROM usuarios u
                 INNER JOIN roles r ON r.id = u.rol_id
                 WHERE u.id = ? AND u.activo = TRUE AND r.nombre = 'administrador'
                 FOR UPDATE`,
                [req.session.usuario.id]
            );
            if (actorRows.length !== 1) {
                await connection.rollback();
                transactionOpen = false;
                return res.status(403).json({ mensaje: 'La sesión ya no tiene permisos administrativos.' });
            }

            const [activeAdminRows] = await connection.execute(
                `SELECT u.id
                 FROM usuarios u
                 INNER JOIN roles r ON r.id = u.rol_id
                 WHERE r.nombre = 'administrador' AND u.activo = TRUE
                 ORDER BY u.id
                 FOR UPDATE`
            );
            if (activeAdminRows.length < 1) {
                await connection.rollback();
                transactionOpen = false;
                return res.status(409).json({ mensaje: 'No se puede completar el borrado sin conservar un administrador activo.' });
            }

            const [sessionRows] = await connection.execute('SELECT session_id, data FROM sesiones FOR UPDATE');
            const matchingSessionIds = [];
            for (const row of sessionRows) {
                let data = row.data;
                if (Buffer.isBuffer(data)) data = data.toString('utf8');
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch {
                        const error = new Error('Unparseable session data');
                        error.code = 'SESSION_DATA_UNREADABLE';
                        throw error;
                    }
                }
                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    const error = new Error('Invalid session data');
                    error.code = 'SESSION_DATA_UNREADABLE';
                    throw error;
                }
                if (data.usuario && String(data.usuario.id) === String(targetId)) {
                    matchingSessionIds.push(row.session_id);
                }
            }
            for (const sessionId of matchingSessionIds) {
                await connection.execute('DELETE FROM sesiones WHERE session_id = ?', [sessionId]);
            }

            // intentos_acceso no tiene usuario_id. Solo se borran filas ligadas
            // al correo de esta cuenta desde su fecha de creación; previas son ambiguas.
            await connection.execute(
                'DELETE FROM intentos_acceso WHERE correo = ? AND fecha >= ?',
                [target.correo, target.fecha_creacion]
            );

            // Conserva evento y fecha por auditoría, pero elimina vínculo, IP y
            // cualquier descripción histórica que pudiera contener datos personales.
            await connection.execute(
                `UPDATE registros_actividad
                 SET usuario_id = NULL, direccion_ip = '', descripcion = 'Evento de cuenta anonimizado.'
                 WHERE usuario_id = ?`,
                [targetId]
            );

            const [deleteResult] = await connection.execute(
                'DELETE FROM usuarios WHERE id = ? AND activo = FALSE',
                [targetId]
            );
            if (deleteResult.affectedRows !== 1) {
                const error = new Error('Account purge did not delete one inactive account');
                error.code = 'ACCOUNT_PURGE_FAILED';
                throw error;
            }

            await connection.execute(
                `INSERT INTO registros_actividad (usuario_id, evento, descripcion, direccion_ip)
                 VALUES (?, 'ELIMINACION_CUENTA_COMPLETADA', ?, '')`,
                [req.session.usuario.id, `Solicitud ${requestId} completada; cuenta anonimizada.`]
            );

            await connection.commit();
            transactionOpen = false;
            return res.json({ mensaje: 'La cuenta se eliminó y sus registros de auditoría se anonimizaron.' });
        } catch (error) {
            if (transactionOpen) {
                try { await connection.rollback(); } catch (rollbackError) {
                    console.error('Account purge rollback failed:', rollbackError.code || 'DB_ERROR');
                }
            }
            console.error('Account purge failed:', error.code || 'DB_ERROR');
            return res.status(500).json({ mensaje: 'No se pudo completar el borrado. No se confirmó ningún cambio.' });
        } finally {
            connection?.release();
        }
    }
);

// Cerrar sesión.
router.post('/logout', requireCsrf, async (req, res) => {
    try {
        const usuario = req.session.usuario;
        const ip = req.ip;

        // Registrar antes de destruir la sesión
        if (usuario) {
            await registrarActividad(
                usuario.id,
                'CIERRE_SESION',
                'El usuario cerró sesión correctamente.',
                ip
            );
        }

        await new Promise((resolve, reject) => {
            req.session.destroy(error => {
                if (error) reject(error);
                else resolve();
            });
        });

        res.clearCookie('florece.sid', { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true', sameSite: 'lax' });

        return res.json({
            mensaje: 'Sesión cerrada correctamente.'
        });

    } catch (error) {
        console.error('Error al cerrar sesión:', (error.code || 'UNKNOWN_ERROR'));

        return res.status(500).json({
            mensaje: 'No se pudo cerrar la sesión.'
        });
    }
});

module.exports = router;
