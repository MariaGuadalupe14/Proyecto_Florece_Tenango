
function requireAuth(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({
            mensaje: 'Debes iniciar sesión para acceder.'
        });
    }

    next();
}

function requireRole(rolPermitido) {
    return (req, res, next) => {
        if (!req.session || !req.session.usuario) {
            return res.status(401).json({
                mensaje: 'Debes iniciar sesión para acceder.'
            });
        }

        if (req.session.usuario.rol !== rolPermitido) {
            return res.status(403).json({
                mensaje: 'No tienes permisos para realizar esta acción.'
            });
        }

        next();
    };
}

module.exports = {
    requireAuth,
    requireRole
};
