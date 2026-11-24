const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSecurityHeaders() {
    const file = path.join(__dirname, '../../functions/_shared/security-headers.js');
    const source = fs.readFileSync(file, 'utf8').replace(
        'export { SECURITY_HEADERS, withSecurityHeaders };',
        'module.exports = { SECURITY_HEADERS, withSecurityHeaders };'
    );
    const module = { exports: {} };
    vm.runInNewContext(source, { module, Object, Headers, Response }, { filename: file });
    return module.exports;
}

function loadPagesModule(file, source, sandbox) {
    const securityHeaders = loadSecurityHeaders();
    const compatibleSource = source
        .replace(/^import \{[^}]+\} from ['"][^'"]*security-headers\.js['"];\s*/m, '')
        .replace(/\bwithSecurityHeaders\b/g, 'securityHeaders.withSecurityHeaders')
        .replace(/\bSECURITY_HEADERS\b/g, 'securityHeaders.SECURITY_HEADERS');
    const module = { exports: {} };
    const transformedSource = compatibleSource
        .replace('export async function onRequest', 'async function onRequest')
        .replace('export { serveProtectedPage };', 'module.exports = { serveProtectedPage };') +
        '\nif (typeof onRequest === "function") module.exports.onRequest = onRequest;';
    vm.runInNewContext(transformedSource, {
        ...sandbox,
        module,
        exports: module.exports,
        securityHeaders,
        URL,
        Headers,
        Request,
        Response
    }, { filename: file });
    return module.exports;
}

function loadApiProxy(fetchStub) {
    const file = path.join(__dirname, '../../functions/api/[[path]].js');
    return loadPagesModule(file, fs.readFileSync(file, 'utf8'), { fetch: fetchStub }).onRequest;
}

function loadRolePage(fetchImpl) {
    const file = path.join(__dirname, '../../functions/_shared/role-page.js');
    return loadPagesModule(file, fs.readFileSync(file, 'utf8'), { fetch: fetchImpl }).serveProtectedPage;
}

module.exports = { loadApiProxy, loadRolePage };
