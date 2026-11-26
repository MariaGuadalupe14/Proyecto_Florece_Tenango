'use strict';

(() => {
  const tabButtons = [...document.querySelectorAll('[data-content-tab]')];
  if (!tabButtons.length) return;

  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiRoot = localHost
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : '/api';
  const $ = selector => document.querySelector(selector);
  const head = $('#content-head');
  const rows = $('#content-rows');
  const message = $('#content-message');
  const searchInput = $('#content-search');
  const dialog = $('#content-dialog');
  const form = $('#content-form');
  const fieldsRoot = $('#content-form-fields');
  const formStatus = $('#content-form-status');
  const submitButton = $('#content-form-submit');

  const modules = {
    comercios: {
      label: 'Comercio',
      fields: [
        ['nombre', 'Nombre', 'text', true, 150], ['categoria', 'Categoría', 'text', false, 100],
        ['descripcion', 'Descripción', 'textarea', false, 2000], ['contacto', 'Contacto', 'text', false, 150],
        ['ubicacion', 'Ubicación', 'text', false, 255],
        ['imagen_url', 'Ruta pública de imagen (opcional)', 'text', false, 500], ['estado', 'Publicación', 'state', true]
      ],
      columns: [['nombre', 'Nombre'], ['categoria', 'Categoría'], ['contacto', 'Contacto'], ['estado', 'Estado']]
    },
    videos: {
      label: 'Video',
      fields: [
        ['titulo', 'Título', 'text', true, 150], ['descripcion', 'Descripción', 'textarea', false, 2000],
        ['video_url', 'Enlace HTTPS de Drive o YouTube', 'url', true, 500],
        ['miniatura_url', 'Ruta o URL de miniatura (opcional)', 'text', false, 500], ['estado', 'Publicación', 'state', true]
      ],
      columns: [['titulo', 'Título'], ['video_url', 'Enlace'], ['estado', 'Estado']]
    },
    galeria: {
      label: 'Imagen',
      fields: [
        ['titulo', 'Título', 'text', true, 150], ['descripcion', 'Descripción', 'textarea', false, 2000],
        ['imagen_url', 'Ruta pública de imagen', 'text', true, 500],
        ['texto_alternativo', 'Texto alternativo', 'text', true, 255],
        ['orden', 'Orden', 'number', true], ['estado', 'Publicación', 'state', true]
      ],
      columns: [['titulo', 'Título'], ['imagen_url', 'Archivo'], ['orden', 'Orden'], ['estado', 'Estado']]
    }
  };

  let activeType = 'comercios';
  let editingId = null;
  let searchTimer;

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiRoot}${path}`, {
      credentials: 'include', cache: 'no-store', ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.mensaje || `La solicitud falló (${response.status}).`);
    return body;
  }

  async function sendMutation(path, method, payload) {
    const token = await api('/auth/csrf');
    if (typeof token.csrfToken !== 'string') throw new Error('No se pudo validar la solicitud segura.');
    return api(path, {
      method,
      headers: { 'X-CSRF-Token': token.csrfToken },
      body: JSON.stringify(payload)
    });
  }

  function readableUrl(value) {
    if (!value) return '—';
    const text = String(value);
    return text.length > 54 ? `${text.slice(0, 51)}…` : text;
  }

  function makeAction(label, action, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `content-action ${className}`.trim();
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  function renderTable(items) {
    const module = modules[activeType];
    const headerRow = document.createElement('tr');
    for (const [, label] of module.columns) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      headerRow.append(cell);
    }
    const actionsHeader = document.createElement('th');
    actionsHeader.scope = 'col';
    actionsHeader.textContent = 'Acciones';
    headerRow.append(actionsHeader);
    head.replaceChildren(headerRow);
    rows.replaceChildren();

    if (!items.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = module.columns.length + 1;
      cell.className = 'content-empty';
      cell.textContent = 'No hay registros que coincidan con la búsqueda.';
      row.append(cell);
      rows.append(row);
      return;
    }

    for (const item of items) {
      const row = document.createElement('tr');
      for (const [key] of module.columns) {
        const cell = document.createElement('td');
        const value = item[key];
        cell.textContent = key === 'estado' ? (value || 'borrador') : readableUrl(value);
        if (key === 'estado') cell.className = `content-state state-${value || 'borrador'}`;
        row.append(cell);
      }
      const actions = document.createElement('td');
      actions.className = 'content-actions';
      actions.append(makeAction('Editar', () => openEditor(item)));
      if (item.estado === 'publicado') {
        actions.append(makeAction('Despublicar', () => changeState(item.id, 'borrador')));
        actions.append(makeAction('Eliminar', () => archive(item.id), 'is-danger'));
      } else if (item.estado === 'archivado') {
        actions.append(makeAction('Restaurar borrador', () => changeState(item.id, 'borrador')));
      } else {
        actions.append(makeAction('Publicar', () => changeState(item.id, 'publicado'), 'is-primary'));
        actions.append(makeAction('Eliminar', () => archive(item.id), 'is-danger'));
      }
      row.append(actions);
      rows.append(row);
    }
  }

  async function loadItems() {
    setMessage('Cargando contenido…');
    try {
      const query = new URLSearchParams();
      const q = searchInput.value.trim();
      if (q) query.set('q', q);
      const body = await api(`/admin/${activeType}${query.size ? `?${query}` : ''}`);
      renderTable(Array.isArray(body.items) ? body.items : []);
      setMessage(`${body.items?.length || 0} registro(s).`);
    } catch (error) {
      renderTable([]);
      setMessage(error.message || 'No se pudo cargar el contenido.', true);
    }
  }

  function addField([name, label, type, required, maxLength], value = '') {
    const wrapper = document.createElement('label');
    wrapper.className = 'content-field';
    wrapper.append(document.createTextNode(label));
    let control;
    if (type === 'textarea') {
      control = document.createElement('textarea');
      control.rows = 4;
    } else if (type === 'state') {
      control = document.createElement('select');
      for (const [optionValue, optionLabel] of [['borrador', 'Borrador'], ['publicado', 'Publicado'], ['archivado', 'Archivado']]) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionLabel;
        control.append(option);
      }
    } else {
      control = document.createElement('input');
      control.type = type;
      if (type === 'number') { control.min = '0'; control.max = '100000'; }
      if (maxLength) control.maxLength = maxLength;
    }
    control.name = name;
    control.required = Boolean(required);
    control.value = value ?? (name === 'estado' ? 'borrador' : '');
    wrapper.append(control);
    fieldsRoot.append(wrapper);
  }

  function openEditor(item = null) {
    editingId = item?.id || null;
    form.reset();
    formStatus.textContent = '';
    fieldsRoot.replaceChildren();
    $('#content-dialog-title').textContent = editingId ? `Editar ${modules[activeType].label.toLowerCase()}` : `Agregar ${modules[activeType].label.toLowerCase()}`;
    for (const field of modules[activeType].fields) addField(field, item?.[field[0]]);
    dialog.showModal();
  }

  async function changeState(id, estado) {
    try {
      const result = await sendMutation(`/admin/${activeType}/${id}/estado`, 'PATCH', { estado });
      setMessage(result.mensaje);
      await loadItems();
    } catch (error) { setMessage(error.message, true); }
  }

  async function archive(id) {
    if (!window.confirm('¿Archivar este registro? Se conservará y podrás restaurarlo.')) return;
    try {
      const result = await sendMutation(`/admin/${activeType}/${id}`, 'DELETE');
      setMessage(result.mensaje);
      await loadItems();
    } catch (error) { setMessage(error.message, true); }
  }

  tabButtons.forEach(button => button.addEventListener('click', () => {
    activeType = button.dataset.contentTab;
    tabButtons.forEach(tab => {
      const selected = tab.dataset.contentTab === activeType;
      tab.classList.toggle('is-active', selected);
      if (tab.getAttribute('role') === 'tab') tab.setAttribute('aria-selected', String(selected));
    });
    searchInput.value = '';
    loadItems();
    document.querySelector('#content-manager')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  $('#content-add').addEventListener('click', () => openEditor());
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadItems, 250);
  });
  $('#content-dialog-close').addEventListener('click', () => dialog.close());
  $('#content-form-cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitButton.disabled = true;
    formStatus.textContent = 'Guardando…';
    const payload = Object.fromEntries(new FormData(form).entries());
    if (activeType === 'galeria') payload.orden = Number(payload.orden || 0);
    try {
      const endpoint = `/admin/${activeType}${editingId ? `/${editingId}` : ''}`;
      const result = await sendMutation(endpoint, editingId ? 'PUT' : 'POST', payload);
      dialog.close();
      setMessage(result.mensaje);
      await loadItems();
    } catch (error) {
      formStatus.textContent = error.message || 'No se pudo guardar el registro.';
      formStatus.classList.add('is-error');
    } finally {
      submitButton.disabled = false;
    }
  });

  document.addEventListener('panel:authorized', event => {
    if (event.detail?.role === 'administrador') loadItems();
  });
})();
