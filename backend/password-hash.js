'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const argon2 = require('argon2');

const pbkdf2 = promisify(crypto.pbkdf2);
const PBKDF2_SCHEME = 'pbkdf2-sha256';
const PBKDF2_ITERATIONS = 600_000;
const MAX_PBKDF2_ITERATIONS = 2_000_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

async function hashPassword(password) {
    if (typeof password !== 'string') throw new TypeError('Password must be a string.');
    const salt = crypto.randomBytes(SALT_BYTES);
    const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS, HASH_BYTES, 'sha256');
    return `${PBKDF2_SCHEME}$${PBKDF2_ITERATIONS}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function decodeBase64Url(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const decoded = Buffer.from(value, 'base64url');
    return decoded.toString('base64url') === value ? decoded : null;
}

async function verifyPassword(password, encoded) {
    if (typeof password !== 'string' || typeof encoded !== 'string') {
        return { valid: false, needsRehash: false, scheme: null };
    }

    if (encoded.startsWith('$argon2id$')) {
        try {
            const valid = await argon2.verify(encoded, password);
            return { valid, needsRehash: valid, scheme: 'argon2id' };
        } catch {
            return { valid: false, needsRehash: false, scheme: 'argon2id' };
        }
    }

    const parts = encoded.split('$');
    if (parts.length !== 4 || parts[0] !== PBKDF2_SCHEME || !/^\d+$/.test(parts[1])) {
        return { valid: false, needsRehash: false, scheme: null };
    }

    const iterations = Number(parts[1]);
    const salt = decodeBase64Url(parts[2]);
    const expected = decodeBase64Url(parts[3]);
    if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > MAX_PBKDF2_ITERATIONS ||
        !salt || salt.length < SALT_BYTES || salt.length > 64 || !expected || expected.length !== HASH_BYTES) {
        return { valid: false, needsRehash: false, scheme: PBKDF2_SCHEME };
    }

    const actual = await pbkdf2(password, salt, iterations, HASH_BYTES, 'sha256');
    const valid = crypto.timingSafeEqual(actual, expected);
    return {
        valid,
        needsRehash: valid && iterations < PBKDF2_ITERATIONS,
        scheme: PBKDF2_SCHEME
    };
}

module.exports = { hashPassword, verifyPassword, PBKDF2_SCHEME, PBKDF2_ITERATIONS };
