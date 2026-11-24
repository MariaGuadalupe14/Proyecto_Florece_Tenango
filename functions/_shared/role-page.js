import { SECURITY_HEADERS, withSecurityHeaders } from './security-headers.js';

const NO_STORE = { 'Cache-Control': 'no-store, private' };

function redirect(location) {
  return withSecurityHeaders(new Response(null, { status: 302, headers: { ...NO_STORE, Location: location } }));
}

function unavailable() {
  return new Response('No fue posible verificar la sesión. Intenta nuevamente.', {
    status: 503,
    headers: { ...NO_STORE, ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

function backendUrl(env) {
  if (!env.BACKEND_ORIGIN || !env.BACKEND_PROXY_SECRET) return null;
  try {
    const origin = new URL(env.BACKEND_ORIGIN);
    const localHttp = origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname);
    if ((!localHttp && origin.protocol !== 'https:') || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
    return origin;
  } catch {
    return null;
  }
}

async function checkBackend(context, path) {
  const origin = backendUrl(context.env);
  if (!origin) return null;
  const headers = new Headers({
    'X-Backend-Proxy-Secret': context.env.BACKEND_PROXY_SECRET,
    'Cache-Control': 'no-store'
  });
  const cookie = context.request.headers.get('Cookie');
  if (cookie) headers.set('Cookie', cookie);
  try {
    return await fetch(new Request(new URL(path, origin), { method: 'GET', headers, redirect: 'manual' }));
  } catch {
    return null;
  }
}

async function serveProtectedPage(context, requiredRole) {
  if (!['GET', 'HEAD'].includes(context.request.method)) {
    return withSecurityHeaders(new Response('Method not allowed.', { status: 405, headers: { ...NO_STORE, Allow: 'GET, HEAD' } }));
  }

  if (requiredRole === 'administrador') {
    // This endpoint applies the backend's requireRole('administrador') guard.
    const response = await checkBackend(context, '/api/admin');
    if (!response) return unavailable();
    if (response.status === 401) return redirect('/index.html#acceso');
    if (response.status === 403) return redirect('/usuario.html');
    if (!response.ok) return unavailable();
  } else {
    const response = await checkBackend(context, '/api/auth/me');
    if (!response) return unavailable();
    if (response.status === 401) return redirect('/index.html#acceso');
    if (!response.ok) return unavailable();
    let body;
    try { body = await response.json(); } catch { return unavailable(); }
    if (body.usuario?.rol === 'administrador') return redirect('/admin.html');
    if (body.usuario?.rol !== 'usuario') return redirect('/index.html#acceso');
  }

  try {
    const asset = await context.env.ASSETS.fetch(context.request);
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', NO_STORE['Cache-Control']);
    return withSecurityHeaders(new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers }));
  } catch {
    return unavailable();
  }
}

export { serveProtectedPage };
