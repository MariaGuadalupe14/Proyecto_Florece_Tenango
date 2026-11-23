const db = require('./db');

const ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const alertsSent = new Map();

async function detectarIntentosSospechosos() {
    try {
        const [resultados] = await db.execute(`
            SELECT correo, direccion_ip, COUNT(*) AS intentos_fallidos,
                   MAX(fecha) AS ultimo_intento
            FROM intentos_acceso
            WHERE exitoso = FALSE
              AND fecha >= NOW() - INTERVAL 15 MINUTE
            GROUP BY correo, direccion_ip
            HAVING COUNT(*) >= 5
        `);
        const now = Date.now();
        for (const [key, sentAt] of alertsSent) {
            if (now - sentAt >= ALERT_COOLDOWN_MS) alertsSent.delete(key);
        }
        for (const intento of resultados) {
            const key = `${intento.correo}\u0000${intento.direccion_ip}`;
            const lastAlert = alertsSent.get(key);
            if (lastAlert && now - lastAlert < ALERT_COOLDOWN_MS) continue;
            alertsSent.set(key, now);
            console.warn('Security alert: 5+ failed attempts in 15 minutes. Review intentos_acceso with authorized access.');
        }
    } catch (error) {
        console.error('Detector error:', error.code || 'DB_ERROR');
    }
}

module.exports = { detectarIntentosSospechosos };
