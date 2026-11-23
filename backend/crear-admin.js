
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const argon2 = require('argon2');
const db = require('./db');
const readline = require('readline');

const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function preguntar(texto) {
    return new Promise(resolve => {
        terminal.question(texto, resolve);
    });
}

async function preguntarSecreto(texto) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;
        const output = process.stdout;
        if (!input.isTTY || typeof input.setRawMode !== 'function') {
            terminal.question(texto, resolve);
            return;
        }

        terminal.close();
        output.write(texto);
        const wasRaw = input.isRaw;
        let secreto = '';
        const cleanup = () => {
            input.removeListener('data', onData);
            input.setRawMode(Boolean(wasRaw));
        };
        const onData = chunk => {
            for (const caracter of chunk.toString('utf8')) {
                if (caracter === '\r' || caracter === '\n') {
                    cleanup();
                    output.write('\n');
                    resolve(secreto);
                    return;
                }
                if (caracter === '\u0003') {
                    cleanup();
                    output.write('\n');
                    reject(new Error('Password input cancelled.'));
                    return;
                }
                if (caracter === '\u007f' || caracter === '\b') {
                    secreto = Array.from(secreto).slice(0, -1).join('');
                    continue;
                }
                if (caracter >= ' ') secreto += caracter;
            }
        };
        input.setRawMode(true);
        input.resume();
        input.on('data', onData);
    });
}

async function crearAdministrador() {
    try {
        const nombre = await preguntar('Nombre del administrador: ');
        const correo = (await preguntar('Correo del administrador: '))
            .trim()
            .toLowerCase();
        const password = await preguntar('Contraseña (mínimo 12 caracteres): ');

        if (nombre.trim().length < 2 || nombre.trim().length > 100) {
            throw new Error('El nombre debe tener entre 2 y 100 caracteres.');
        }

        if (correo.length > 150 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            throw new Error('El correo no tiene un formato válido.');
        }

        if (password.length < 12 || password.length > 128) {
            throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
        }

        const [existentes] = await db.execute(
            'SELECT id FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (existentes.length > 0) {
            throw new Error('Ese correo ya está registrado.');
        }

        const [roles] = await db.execute(
            "SELECT id FROM roles WHERE nombre = 'administrador'"
        );

        if (roles.length === 0) {
            throw new Error('No existe el rol administrador en la base de datos.');
        }

        const hash = await argon2.hash(password, {
            type: argon2.argon2id
        });

        await db.execute(
            `INSERT INTO usuarios
            (nombre, correo, password_hash, rol_id)
            VALUES (?, ?, ?, ?)`,
            [nombre.trim(), correo, hash, roles[0].id]
        );

        console.log('\nAdministrador creado correctamente.');
    } catch (error) {
        console.error('\nNo se pudo crear el administrador:', (error.code || 'UNKNOWN_ERROR'));
    } finally {
        terminal.close();
        await db.end();
    }
}

crearAdministrador();
