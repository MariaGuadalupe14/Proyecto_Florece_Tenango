'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#primary-nav');

  function closeMenu() {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú');
    navigation.classList.remove('is-open');
  }

  menuButton.addEventListener('click', () => {
    const opening = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(opening));
    menuButton.setAttribute('aria-label', opening ? 'Cerrar menú' : 'Abrir menú');
    navigation.classList.toggle('is-open', opening);
  });
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menuButton.focus();
    }
  });

  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const authApi = localHost ? window.location.protocol + '//' + window.location.hostname + ':3000/api/auth' : '/api/auth';
  const publicView = new URLSearchParams(window.location.search).get('public') === '1';
  const userHome = window.location.pathname.endsWith('/usuario.html');
  const navLogin = document.querySelector('#nav-login');
  const navAccount = document.querySelector('#nav-account');
  const navLogout = document.querySelector('#nav-logout');
  const navGreeting = document.querySelector('#nav-greeting');
  const accountDeletionPanel = document.querySelector('#account-deletion');

  function updateSessionNavigation(user) {
    const authenticated = Boolean(user && user.rol);
    if (navLogin) navLogin.hidden = authenticated;
    if (navAccount) navAccount.hidden = !authenticated;
    if (navLogout) navLogout.hidden = !authenticated;
    const loginFormElement = document.querySelector('#login-form');
    const registerFormElement = document.querySelector('#register-form');
    if (loginFormElement) loginFormElement.hidden = authenticated;
    if (registerFormElement) registerFormElement.hidden = true;
    if (accountDeletionPanel) accountDeletionPanel.hidden = !authenticated;
    if (navGreeting) {
      navGreeting.hidden = !authenticated;
      navGreeting.textContent = authenticated ? `Hola, ${(user.nombre || 'usuario').trim().split(/\s+/)[0]}` : '';
    }
  }

  function redirectForRole(role) {
    if (role === 'administrador') window.location.assign('/admin.html');
    else if (role === 'usuario') window.location.assign('/usuario.html');
  }

  async function currentUser() {
    const response = await fetch(authApi + '/me', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return null;
    const body = await response.json().catch(() => ({}));
    return body.usuario || null;
  }

  // Restore an existing session when the visitor returns to the main page.
  currentUser().then(user => {
    updateSessionNavigation(user);
    if (user && !publicView && !(userHome && user.rol === 'usuario')) redirectForRole(user.rol);
  }).catch(() => {});

  const loginForm = document.querySelector('#login-form');
  const registerForm = document.querySelector('#register-form');
  const loginStatus = document.querySelector('#login-status');
  const registerStatus = document.querySelector('#register-status');
  const formTitle = document.querySelector('#auth-form-title');
  const formSubtitle = document.querySelector('#auth-form-subtitle');
  const setFormMode = (registering) => {
    loginForm.hidden = registering;
    registerForm.hidden = !registering;
    formTitle.textContent = registering ? 'Crear cuenta' : 'Iniciar sesi\u00f3n';
    formSubtitle.textContent = registering ? '\u00danete a Florece Tenango' : 'Acceso a tu cuenta';
    loginStatus.textContent = '';
    registerStatus.textContent = '';
    (registering ? document.querySelector('#register-name') : document.querySelector('#email')).focus();
  };
  document.querySelector('#show-register').addEventListener('click', () => setFormMode(true));
  document.querySelector('#show-login').addEventListener('click', () => setFormMode(false));

  document.querySelectorAll('[data-password-toggle]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.passwordToggle);
      const showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      toggle.textContent = showing ? 'Ocultar' : 'Mostrar';
      toggle.setAttribute('aria-label', showing ? 'Ocultar contrase\u00f1a' : 'Mostrar contrase\u00f1a');
      toggle.setAttribute('aria-pressed', String(showing));
    });
  });

  async function sendAuthRequest(path, payload) {
    const csrfResponse = await fetch(authApi + '/csrf', {
      method: 'GET', credentials: 'include', cache: 'no-store'
    });
    const csrfBody = await csrfResponse.json().catch(() => ({}));
    if (!csrfResponse.ok || typeof csrfBody.csrfToken !== 'string') {
      throw new Error(csrfBody.mensaje || 'No se pudo preparar la solicitud segura.');
    }
    const response = await fetch(authApi + '/' + path, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfBody.csrfToken },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  }

  navLogout?.addEventListener('click', async () => {
    closeMenu();
    navLogout.disabled = true;
    try {
      const result = await sendAuthRequest('logout', {});
      if (!result.response.ok) throw new Error(result.body.mensaje || 'No se pudo cerrar la sesión.');
      updateSessionNavigation(null);
      loginStatus.textContent = 'Sesión cerrada correctamente.';
      closeMenu();
      if (userHome) window.location.replace('/index.html');
    } catch (error) {
      loginStatus.textContent = error.message || 'No se pudo cerrar la sesión.';
    } finally {
      navLogout.disabled = false;
    }
  });

  const deleteAccountForm = document.querySelector('#delete-account-form');
  const deleteAccountStatus = document.querySelector('#delete-account-status');
  deleteAccountForm?.addEventListener('submit', async event => {
    event.preventDefault();
    deleteAccountStatus.textContent = '';
    const password = document.querySelector('#delete-account-password');
    if (!password.reportValidity()) return;
    if (!window.confirm('La solicitud bloqueará tu cuenta y cerrará sus sesiones. ¿Deseas continuar?')) return;

    const button = deleteAccountForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await sendAuthRequest('delete-account', { password: password.value });
      if (!result.response.ok) throw new Error(result.body.mensaje || 'No se pudo solicitar la eliminación.');
      deleteAccountForm.reset();
      updateSessionNavigation(null);
      loginStatus.textContent = result.body.mensaje;
      if (userHome) window.location.replace('/index.html?public=1#acceso');
    } catch (error) {
      deleteAccountStatus.textContent = error.message || 'No se pudo solicitar la eliminación.';
    } finally {
      button.disabled = false;
    }
  });

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    loginStatus.textContent = '';
    const email = document.querySelector('#email');
    const password = document.querySelector('#password');
    if (!email.reportValidity() || !password.reportValidity()) return;
    const button = loginForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await sendAuthRequest('login', { correo: email.value.trim(), password: password.value });
      if (!result.response.ok) throw new Error(result.body.mensaje || 'No se pudo iniciar sesi\u00f3n. Revisa tu correo y contrase\u00f1a.');
      password.value = '';
      const user = await currentUser();
      if (!user || !['administrador', 'usuario'].includes(user.rol)) throw new Error('La sesión inició, pero no se pudo verificar el rol de la cuenta.');
      updateSessionNavigation(user);
      redirectForRole(user.rol);
    } catch (error) {
      loginStatus.textContent = error.message === 'local-backend-only'
        ? 'El backend solo est\u00e1 disponible localmente. Abre esta p\u00e1gina desde localhost para iniciar sesi\u00f3n.'
        : error instanceof TypeError
          ? 'No se pudo conectar con el backend local. Comprueba que est\u00e9 ejecut\u00e1ndose en localhost:3000.'
          : error.message;
    } finally { button.disabled = false; }
  });

  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    registerStatus.textContent = '';
    const name = document.querySelector('#register-name');
    const email = document.querySelector('#register-email');
    const password = document.querySelector('#register-password');
    const confirmation = document.querySelector('#register-confirm-password');
    if (!registerForm.reportValidity()) return;
    if (password.value.length < 12 || password.value.length > 128) {
      password.setCustomValidity('La contrase\u00f1a debe tener entre 12 y 128 caracteres.');
      password.reportValidity(); password.setCustomValidity(''); return;
    }
    if (password.value !== confirmation.value) {
      confirmation.setCustomValidity('Las contrase\u00f1as no coinciden.');
      confirmation.reportValidity(); confirmation.setCustomValidity(''); return;
    }
    const button = registerForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await sendAuthRequest('registro', { nombre: name.value.trim(), correo: email.value.trim(), password: password.value });
      if (!result.response.ok) throw new Error(result.body.mensaje || 'No se pudo crear la cuenta.');
      const registeredEmail = email.value.trim();
      registerForm.reset();
      document.querySelector('#email').value = registeredEmail;
      setFormMode(false);
      loginStatus.textContent = result.body.mensaje || 'Cuenta creada. Ya puedes iniciar sesi\u00f3n.';
    } catch (error) {
      registerStatus.textContent = error.message === 'local-backend-only'
        ? 'El registro solo est\u00e1 disponible localmente. Abre esta p\u00e1gina desde localhost para crear una cuenta.'
        : error instanceof TypeError
          ? 'No se pudo conectar con el backend local. Comprueba que est\u00e9 ejecut\u00e1ndose en localhost:3000.'
          : error.message;
    } finally { button.disabled = false; }
  });

  document.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
    image.parentElement.classList.add('image-missing');
    image.setAttribute('aria-hidden', 'true');
  }, { once: true }));

  document.querySelector('#current-year').textContent = String(new Date().getFullYear());

  const catalog = window.FLORECE_CATALOG || [];
  const cards = document.querySelector('#catalog-results');
  const category = document.querySelector('#catalog-category');
  const search = document.querySelector('#catalog-search');
  const freeOnly = document.querySelector('#catalog-free');
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeExternalUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '#'; } catch { return '#'; } };
  (window.FLORECE_CATEGORIES || [...new Set(catalog.map(item => item.category))]).forEach(value => { const option=document.createElement('option'); option.value=value; option.textContent=value; category.append(option); });
  function renderCatalog() {
    const query=search.value.trim().toLocaleLowerCase('es');
    const visible=catalog.filter(item => (!category.value || item.category===category.value) && (!query || `${item.name} ${item.provider}`.toLocaleLowerCase('es').includes(query)) && (!freeOnly.checked || item.free===true));
    cards.innerHTML=visible.length ? visible.map(item => `<article class="catalog-card"><span class="catalog-type">${esc(item.type)} · ${esc(item.status)}</span><h3>${esc(item.name)}</h3><p class="catalog-provider">${esc(item.provider)} · ${esc(item.category)}</p><p>${esc(item.description)}</p><dl><dt>Modalidad</dt><dd>${esc(item.modality)}</dd><dt>Duración</dt><dd>${esc(item.duration)}</dd><dt>Costo</dt><dd>${esc(item.cost)}</dd><dt>Constancia</dt><dd>${esc(item.certification)}</dd></dl><a class="catalog-source" href="${esc(safeExternalUrl(item.url))}" target="_blank" rel="noopener noreferrer">Consultar fuente oficial ↗</a></article>`).join('') : `<p>${category.value && !catalog.some(item=>item.category===category.value) ? 'Próximamente se agregarán opciones para esta categoría.' : 'No hay opciones que coincidan con estos filtros.'}</p>`;
  }
  [category,search,freeOnly].forEach(control => control.addEventListener('input',renderCatalog)); renderCatalog();

  const panel=document.querySelector('#xochitl-panel'), opener=document.querySelector('#xochitl-open'), closer=document.querySelector('#xochitl-close'), log=document.querySelector('#chat-log'), options=document.querySelector('#chat-options');
  const questions=[
    {key:'business',label:'¿Qué tipo de negocio tienes?',choices:[['Vivero','vivero'],['Floristería','floristería'],['Productor de flores','productor'],['Comercio local','comercio local'],['Emprendimiento','emprendimiento'],['Otro','otro']]},
    {key:'area',label:'¿Qué área te gustaría mejorar?',choices:[['Marketing y publicidad','marketing'],['Ventas','ventas'],['Administración','administración'],['Herramientas digitales','herramientas digitales'],['Floricultura','floricultura'],['Ciberseguridad','ciberseguridad'],['Atención al cliente','atención al cliente']]},
    {key:'need',label:'¿Qué necesitas aprender o solucionar?',choices:[]},
    {key:'modality',label:'¿Qué modalidad prefieres?',choices:[['En línea','online'],['Presencial','in-person'],['Cualquiera','any']]},
    {key:'budget',label:'¿Qué presupuesto tienes?',choices:[['Gratuito','free'],['De bajo costo','low'],['Cualquiera','any']]}
  ];
  const needs={marketing:[['Promocionar mis productos en redes sociales','promocionar mis productos en redes sociales'],['Aumentar mis ventas','aumentar mis ventas']],ventas:[['Aumentar mis ventas','aumentar mis ventas'],['Promocionar mis productos en redes sociales','promocionar mis productos en redes sociales']],administración:[['Organizar las finanzas de mi negocio','organizar las finanzas'],['Organizar mejor mi negocio','organizar mejor mi negocio']], 'herramientas digitales':[['Aprender a utilizar Excel','aprender excel'],['Aprender Word','aprender word']],floricultura:[['Mejorar el cuidado de mis flores','cuidado de mis flores'],['Manejar mejor mi vivero','manejo viveros']],ciberseguridad:[['Proteger mis cuentas y datos','proteger mis cuentas'],['Prevenir riesgos digitales','seguridad digital']], 'atención al cliente':[['Mejorar la atención a mis clientes','atención al cliente']]};
  const answers={}; let step=0;
  function say(text,kind='bot'){const p=document.createElement('p');p.className=`chat-message ${kind}`;p.textContent=text;log.append(p);log.scrollTop=log.scrollHeight;}
  function showQuestion(){if(step===2){questions[2].choices=needs[answers.area]||[];if(!questions[2].choices.length){say('Aún no tenemos opciones verificadas para esta categoría.');questions[2].choices=[['Consultar opciones próximas','próximamente']];}}
    const q=questions[step];say(q.label);options.replaceChildren();q.choices.forEach(([label,value])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>{answers[q.key]=value;say(label,'user');step++;if(step<questions.length)showQuestion();else showResults();});options.append(b);});
    if(step>0){const back=document.createElement('button');back.type='button';back.className='chat-back';back.textContent='← Pregunta anterior';back.addEventListener('click',()=>{step--;showQuestion();});options.append(back);}}
  function showResults(){options.replaceChildren();say('Estoy comparando tus respuestas con el catálogo…');const results=window.FLORECE_RECOMMENDER.recommend(answers);if(!results.length){say('No encontré coincidencias compatibles con tus preferencias. Puedes probar “Cualquiera” en modalidad o presupuesto.');}else{results.forEach(item=>{const article=document.createElement('article');article.className='chat-result';const title=document.createElement('strong');title.textContent=item.name;const details=document.createElement('p');details.textContent=`${item.provider} · ${item.status} · Coincidencia ${item.score}/100`;const reason=document.createElement('p');reason.textContent=item.reason;const link=document.createElement('a');link.href=safeExternalUrl(item.url);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Consultar fuente ↗';article.append(title,details,reason,link);log.append(article);});}const restart=document.createElement('button');restart.textContent='Empezar de nuevo';restart.addEventListener('click',()=>{answers.business=answers.area=answers.need=answers.modality=answers.budget=undefined;step=0;log.replaceChildren();say('Hola, soy Xóchitl. Te ayudaré a encontrar opciones relacionadas con tu negocio. No necesito datos personales.');showQuestion();});options.append(restart);}
  function openChat(){panel.hidden=false;opener.setAttribute('aria-expanded','true');if(!log.childElementCount){say('Hola, soy Xóchitl. Te ayudaré a encontrar opciones relacionadas con tu negocio. No necesito datos personales.');say('¿Iniciamos una recomendación?');const start=document.createElement('button');start.textContent='Iniciar recomendación';start.addEventListener('click',()=>{start.remove();showQuestion();});options.append(start);}}
  opener.addEventListener('click',openChat);closer.addEventListener('click',()=>{panel.hidden=true;opener.setAttribute('aria-expanded','false');opener.focus();});
  const privacyDialog = document.querySelector('#privacy-dialog');
  const privacyOpener = document.querySelector('[data-open-privacy]');
  const privacyCloser = document.querySelector('[data-close-privacy]');
  if (privacyDialog && privacyOpener && privacyCloser) {
    privacyOpener.addEventListener('click', () => privacyDialog.showModal());
    privacyCloser.addEventListener('click', () => privacyDialog.close());
    privacyDialog.addEventListener('click', event => {
      if (event.target === privacyDialog) privacyDialog.close();
    });
  }
});
