import { serveProtectedPage } from './_shared/role-page.js';

export async function onRequest(context) {
  return serveProtectedPage(context, 'usuario');
}
