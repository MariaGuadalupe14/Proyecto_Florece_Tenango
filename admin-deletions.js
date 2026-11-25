'use strict';

(() => {
  const body = document.querySelector('#deletion-request-rows');
  if (!body) return;

  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiRoot = localHost
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : '/api';
  const message = document.querySelector('#deletion-requests-message');
  const refreshButton = document.querySelector('#refresh-deletion-requests');

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiRoot}${path}`, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.mensaje || `La solicitud falló (${response.status}).`);
    return result;
  }

  function addCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
    return cell;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString('es-MX');
  }

  async function loadRequests() {
    refreshButton.disabled = true;
    body.replaceChildren();
    setMessage('Cargando solicitudes pendientes…');
    try {
      const result = await api('/auth/admin/account-deletion-requests');
      const requests = Array.isArray(result.solicitudes) ? result.solicitudes : [];
      for (const request of requests) {
        const row = document.createElement('tr');
        addCell(row, `#${request.request_id}`);
        addCell(row, `Cuenta ${request.usuario_id}`);
        addCell(row, request.rol || 'Sin rol');
        addCell(row, formatDate(request.fecha));
        const actionCell = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'content-action is-danger';
        button.textContent = 'Eliminar definitivamente';
        button.addEventListener('click', () => purgeRequest(request, button));
        actionCell.append(button);
        row.append(actionCell);
        body.append(row);
      }
      setMessage(requests.length ? `${requests.length} solicitud(es) pendiente(s).` : 'No hay solicitudes pendientes.');
    } catch (error) {
      setMessage(error.message || 'No se pudieron consultar las solicitudes.', true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function purgeRequest(request, button) {
    const requestId = Number(request.request_id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) return;
    const confirmed = window.confirm(
      `¿Eliminar definitivamente la cuenta ${request.usuario_id} (solicitud #${requestId})? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    button.disabled = true;
    try {
      const csrf = await api('/auth/csrf');
      if (typeof csrf.csrfToken !== 'string') throw new Error('No se pudo preparar la solicitud segura.');
      await api(`/auth/admin/account-deletion-requests/${requestId}/purge`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf.csrfToken },
        body: '{}'
      });
      setMessage('La cuenta fue eliminada y la auditoría relacionada quedó anonimizada.');
      await loadRequests();
    } catch (error) {
      setMessage(error.message || 'No se pudo completar la eliminación.', true);
      button.disabled = false;
    }
  }

  refreshButton?.addEventListener('click', loadRequests);
  document.addEventListener('panel:authorized', event => {
    if (event.detail?.role === 'administrador') loadRequests();
  });
})();
