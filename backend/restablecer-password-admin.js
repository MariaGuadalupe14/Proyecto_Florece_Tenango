const db = require('./db');
const { hashPassword } = require('./password-hash');

const ADMIN_EMAIL = 'florecetenango@gmail.com';
const ADMIN_ROLE = 'administrador';

function readHidden(prompt) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;
        const output = process.stdout;

        if (!input.isTTY || typeof input.setRawMode !== 'function') {
            reject(new Error('Ejecuta esta herramienta desde una terminal interactiva.'));
            return;
        }

        output.write(prompt);
        const wasRaw = input.isRaw;
        let value = '';
        let settled = false;

        const cleanup = () => {
            input.removeListener('data', onData);
            input.setRawMode(Boolean(wasRaw));
            input.pause();
        };

        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            cleanup();
            output.write('\n');
            if (error) reject(error);
            else resolve(result);
        };

        const onData = chunk => {
            for (const character of chunk.toString('utf8')) {
                if (character === '\u0003') {
                    finish(new Error('Operación cancelada.'));
                    return;
                }
                if (character === '\r' || character === '\n') {
                    finish(null, value);
                    return;
                }
                if (character === '\u007f' || character === '\b') {
                    value = Array.from(value).slice(0, -1).join('');
                    continue;
                }
                if (character >= ' ') value += character;
            }
        };

        input.setRawMode(true);
        input.resume();
        input.on('data', onData);
    });
}

async function main() {
    let password;
    let confirmation;

    try {
        const [accounts] = await db.execute(
            `SELECT u.id
             FROM usuarios AS u
             INNER JOIN roles AS r ON r.id = u.rol_id
             WHERE u.correo = ? AND r.nombre = ?
             LIMIT 2`,
            [ADMIN_EMAIL, ADMIN_ROLE]
        );

        if (accounts.length !== 1) {
            throw new Error('No se encontró exactamente una cuenta con ese correo y rol administrador. No se modificó la base de datos.');
        }

        password = await readHidden('Nueva contraseña (12 a 128 caracteres): ');
        confirmation = await readHidden('Confirma la nueva contraseña: ');

        if (password.length < 12 || password.length > 128) {
            throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
        }
        if (password !== confirmation) {
            throw new Error('Las contraseñas no coinciden. No se modificó la base de datos.');
        }

        const passwordHash = await hashPassword(password);
        const [result] = await db.execute(
            `UPDATE usuarios AS u
             INNER JOIN roles AS r ON r.id = u.rol_id
             SET u.password_hash = ?
             WHERE u.id = ? AND u.correo = ? AND r.nombre = ?`,
            [passwordHash, accounts[0].id, ADMIN_EMAIL, ADMIN_ROLE]
        );

        if (result.affectedRows !== 1) {
            throw new Error('La cuenta dejó de cumplir las condiciones esperadas. No se confirmó ningún cambio.');
        }

        console.log('Contraseña de la cuenta administradora restablecida correctamente.');
    } catch (error) {
        console.error(error.message || 'No se pudo restablecer la contraseña.');
        process.exitCode = 1;
    } finally {
        password = undefined;
        confirmation = undefined;
        await db.end().catch(() => {});
    }
}

main();
