(function () {
  const root = document.querySelector('[data-required-role]');
  if (!root) return;

  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const authApi = localHost ? window.location.protocol + '//' + window.location.hostname + ':3000/api/auth' : '/api/auth';
  const requiredRole = root.dataset.requiredRole;
  const status = document.querySelector('#panel-status');
  const logoutButton = document.querySelector('#logout-button');

  function redirectForRole(role) {
    if (role === 'administrador') window.location.replace('/admin.html');
    else if (role === 'usuario') window.location.replace('/usuario.html');
    else window.location.replace('/index.html#acceso');
  }

  async function fetchCurrentUser() {
    const response = await fetch(authApi + '/me', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return { response, user: null };
    const body = await response.json().catch(() => ({}));
    return { response, user: body.usuario || null };
  }

  async function confirmPageAccess(user) {
    if (requiredRole === 'administrador') {
      const response = await fetch('/api/admin', { credentials: 'include', cache: 'no-store' });
      return response.ok && user.rol === 'administrador';
    }
    return user.rol === 'usuario';
  }

  async function initialize() {
    try {
      const { response, user } = await fetchCurrentUser();
      if (response.status === 401 || !user) return redirectForRole(null);
      if (!await confirmPageAccess(user)) return redirectForRole(user.rol);
      const name = document.querySelector('[data-user-name]');
      if (name) name.textContent = user.nombre || 'Usuario';
      root.hidden = false;
      document.dispatchEvent(new CustomEvent('panel:authorized', { detail: { role: user.rol } }));
    } catch {
      if (status) status.textContent = 'No se pudo comprobar la sesión. Intenta nuevamente.';
      root.hidden = true;
    }
  }

  logoutButton?.addEventListener('click', async () => {
    logoutButton.disabled = true;
    if (status) status.textContent = '';
    try {
      const csrfResponse = await fetch(authApi + '/csrf', { credentials: 'include', cache: 'no-store' });
      const csrf = await csrfResponse.json().catch(() => ({}));
      if (!csrfResponse.ok || typeof csrf.csrfToken !== 'string') throw new Error('No se pudo validar la solicitud de cierre de sesión.');
      const response = await fetch(authApi + '/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrfToken },
        body: '{}'
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.mensaje || 'No se pudo cerrar la sesión.');
      window.location.replace('/index.html#acceso');
    } catch (error) {
      if (status) status.textContent = error.message || 'No se pudo cerrar la sesión.';
      logoutButton.disabled = false;
    }
  });

  initialize();
})();
