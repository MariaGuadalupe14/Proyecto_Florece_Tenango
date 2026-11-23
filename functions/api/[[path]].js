export async function onRequest(context) {
  const { request, env } = context;
  const unavailable = (status, message) => Response.json({ message }, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

  if (!env.BACKEND_ORIGIN || !env.BACKEND_PROXY_SECRET) {
    return unavailable(503, 'API proxy is not configured.');
  }

  let backend;
  try {
    backend = new URL(env.BACKEND_ORIGIN);
  } catch {
    return unavailable(500, 'Invalid API proxy configuration.');
  }
  const localHttp = backend.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(backend.hostname);
  if ((!localHttp && backend.protocol !== 'https:') || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) {
    return unavailable(500, 'Invalid API proxy configuration.');
  }

  const incoming = new URL(request.url);
  const upstreamUrl = new URL(incoming.pathname + incoming.search, backend.origin);
  try {
    const original = new Request(upstreamUrl.toString(), request);
    const headers = new Headers(original.headers);
    for (const name of [
      'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
      'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
      'x-backend-proxy-secret', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'
    ]) headers.delete(name);

    headers.set('x-backend-proxy-secret', env.BACKEND_PROXY_SECRET);
    headers.set('x-forwarded-proto', incoming.protocol.slice(0, -1));
    headers.set('x-forwarded-host', incoming.host);
    headers.set('cache-control', 'no-store');
    const clientIp = request.headers.get('cf-connecting-ip');
    if (clientIp) headers.set('x-forwarded-for', clientIp);

    const proxied = new Request(original, { headers, redirect: 'manual' });
    // Return the upstream Response unchanged so multiple Set-Cookie headers stay separate.
    return await fetch(proxied);
  } catch {
    return unavailable(502, 'The backend is temporarily unavailable.');
  }
}
