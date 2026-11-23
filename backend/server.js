const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { mysqlConfig } = require('./db-config');

const db = require('./db');
const cron = require('node-cron');
const { detectarIntentosSospechosos } = require('./detector');
const authRoutes = require('./auth');
const { requireAuth, requireRole } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
const requiredConfig = ['DB_HOST', 'DB_USER', 'DB_NAME', 'SESSION_SECRET'];
const missingConfig = requiredConfig.filter(name => !process.env[name]);
if (missingConfig.length) {
    throw new Error(`Missing required backend/.env settings: ${missingConfig.join(', ')}`);
}
if (isProduction && Buffer.byteLength(sessionSecret, 'utf8') < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes in production.');
}
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
}
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
if (isProduction && process.env.DB_SSL !== 'true') {
    throw new Error('DB_SSL=true is required in production.');
}

// Secure response headers; HSTS is enabled only behind HTTPS in production.
app.use(helmet({
    strictTransportSecurity: isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false
}));

// Limitar el tamaño de los datos recibidos
// CORS local para el frontend servido desde localhost durante desarrollo.
function isLocalDevelopmentOrigin(origin) {
    try {
        const parsed = new URL(origin);
        return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

app.use((req, res, next) => {
    const origin = req.get('Origin');
    const allowed = !isProduction && origin && isLocalDevelopmentOrigin(origin);
    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(allowed ? 204 : origin ? 403 : 204);
    next();
});

app.use(express.json({ limit: '10kb' }));

// Almacenar las sesiones en MySQL
const sessionStore = new MySQLStore({
    ...mysqlConfig(),
    createDatabaseTable: false,
    schema: {
        tableName: 'sesiones',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
});

app.use(session({
    name: 'florece.sid',
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: isProduction, // HTTPS required in production
        sameSite: 'lax',
        path: '/',
        maxAge: 1000 * 60 * 60
    }
}));

// Comprobar servidor y base de datos
app.get('/api/estado', async (req, res) => {
    try {
        await db.query('SELECT 1');

        res.json({
            proyecto: 'Florece Tenango',
            servidor: 'Activo',
            baseDatos: 'Conectada'
        });
    } catch (error) {
        console.error('Error de conexión:', (error.code || 'UNKNOWN_ERROR'));

        res.status(503).json({
            mensaje: 'La base de datos no está disponible.'
        });
    }
});

// Rutas de autenticación
app.use('/api/auth', authRoutes);
// Ruta de prueba: cualquier usuario con sesión activa
app.get('/api/privado', requireAuth, (req, res) => {
    res.json({
        mensaje: 'Acceso permitido.',
        usuario: req.session.usuario.nombre
    });
});

// Ruta de prueba: solamente administradores
app.get('/api/admin', requireRole('administrador'), (req, res) => {
    res.json({
        mensaje: 'Bienvenido al área de administración.'
    });
});

// Monitorear intentos sospechosos cada minuto
cron.schedule('* * * * *', () => {
    console.log('Ejecutando revisión de seguridad...');
    detectarIntentosSospechosos();
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} (${isProduction ? 'production behind HTTPS proxy' : 'local development'})`);
});