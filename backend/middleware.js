const db = require('./db');

function clearSessionCookie(res) {
    res.clearCookie('florece.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true',
        sameSite: 'lax'
    });
}

async function requireActiveAccount(req, res, next) {
    if (!req.session || !req.session.usuario || !Number.isSafeInteger(Number(req.session.usuario.id)) || Number(req.session.usuario.id) < 1) {
        return res.status(401).json({ mensaje: 'Debes iniciar sesión para acceder.' });
    }

    try {
        const [rows] = await db.execute(
            'SELECT id FROM usuarios WHERE id = ? AND activo = TRUE',
            [req.session.usuario.id]
        );
        if (rows.length === 0) {
            const session = req.session;
            return session.destroy(error => {
                if (error) console.error('Could not destroy blocked account session:', error.code || 'UNKNOWN_ERROR');
                clearSessionCookie(res);
                return res.status(401).json({ mensaje: 'La cuenta no está activa.' });
            });
        }
        return next();
    } catch (error) {
        console.error('Could not validate account status:', error.code || 'DB_ERROR');
        return res.status(503).json({ mensaje: 'No se pudo validar el estado de la cuenta.' });
    }
}

function requireAuth(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({ mensaje: 'Debes iniciar sesión para acceder.' });
    }
    return requireActiveAccount(req, res, next);
}

function requireRole(rolPermitido) {
    return (req, res, next) => {
        if (!req.session || !req.session.usuario) {
            return res.status(401).json({ mensaje: 'Debes iniciar sesión para acceder.' });
        }

        if (req.session.usuario.rol !== rolPermitido) {
            return res.status(403).json({ mensaje: 'No tienes permisos para realizar esta acción.' });
        }

        return requireActiveAccount(req, res, next);
    };
}

module.exports = {
    requireAuth,
    requireRole
};
