
const express = require('express');
const argon2 = require('argon2');
const db = require('./db');
const { rateLimit } = require('express-rate-limit');

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

// REGISTRO
router.post('/registro', registrationLimit, async (req, res) => {
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

        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id
        });

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
router.post('/login', loginLimit, async (req, res) => {
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

        const passwordCorrecta = await argon2.verify(
            usuario.password_hash,
            password
        );

        // Contraseña incorrecta
        if (!passwordCorrecta) {
            await registrarIntento(correoLimpio, ip, false);

            return res.status(401).json({
                mensaje: 'Correo o contraseña incorrectos.'
            });
        }

        // Crear una sesión nueva
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
        await new Promise((resolve, reject) => {
            req.session.save(error => {
                if (error) reject(error);
                else resolve();
            });
        });

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
            usuario: req.session.usuario
        });

    } catch (error) {
        console.error('Error en login:', (error.code || 'UNKNOWN_ERROR'));

        return res.status(500).json({
            mensaje: 'Ocurrió un error al iniciar sesión.'
        });
    }
});

// CONSULTAR SESIÓN ACTUAL
router.get('/me', (req, res) => {
    if (!req.session.usuario) {
        return res.status(401).json({
            mensaje: 'No has iniciado sesión.'
        });
    }

    res.json({
        usuario: req.session.usuario
    });
});

// CERRAR SESIÓN
router.post('/logout', async (req, res) => {
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

        res.clearCookie('florece.sid', { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });

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
