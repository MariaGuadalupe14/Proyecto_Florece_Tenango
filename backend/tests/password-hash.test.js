const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, PBKDF2_SCHEME, PBKDF2_ITERATIONS } = require('../password-hash');

test('PBKDF2 hashes store their scheme, cost, unique salt and derived key', async () => {
    const password = 'Synthetic-PBKDF2-test-password-2026!';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    const [scheme, iterations, firstSalt, firstDerived] = first.split('$');

    assert.equal(scheme, PBKDF2_SCHEME);
    assert.equal(Number(iterations), PBKDF2_ITERATIONS);
    assert.equal(Buffer.from(firstSalt, 'base64url').length, 16);
    assert.equal(Buffer.from(firstDerived, 'base64url').length, 32);
    assert.notEqual(firstSalt, second.split('$')[2]);
    assert.equal((await verifyPassword(password, first)).valid, true);
    assert.equal((await verifyPassword('Wrong-synthetic-password', first)).valid, false);
    assert.equal(first.includes(password), false);
});
