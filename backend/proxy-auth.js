const crypto = require('crypto');

function isLoopbackAddress(address = '') {
    return address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.');
}

function isLocalDevelopmentOrigin(origin = '') {
    try {
        const parsed = new URL(origin);
        return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

function matchesSecret(presented, expected) {
    if (typeof presented !== 'string' || typeof expected !== 'string' || !presented || !expected) return false;
    const received = Buffer.from(presented, 'utf8');
    const configured = Buffer.from(expected, 'utf8');
    return received.length === configured.length && crypto.timingSafeEqual(received, configured);
}

function createProxyAuthMiddleware({ secret, isProduction }) {
    return (req, res, next) => {
        const origin = req.get('Origin') || '';
        const fromCloudflareEdge = Boolean(req.get('CF-Ray') || req.get('CF-Connecting-IP'));
        const localDevelopmentRequest = !isProduction && !fromCloudflareEdge &&
            isLoopbackAddress(req.socket?.remoteAddress) && (!origin || isLocalDevelopmentOrigin(origin));
        if (localDevelopmentRequest) return next();
        if (matchesSecret(req.get('X-Backend-Proxy-Secret'), secret)) return next();
        res.setHeader('Cache-Control', 'no-store');
        return res.status(403).json({ mensaje: 'Solicitud no autorizada.' });
    };
}

module.exports = { createProxyAuthMiddleware };
