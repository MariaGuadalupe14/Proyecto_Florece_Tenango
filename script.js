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

  const password = document.querySelector('#password');
  const passwordToggle = document.querySelector('#toggle-password');
  passwordToggle.addEventListener('click', () => {
    const showing = password.type === 'password';
    password.type = showing ? 'text' : 'password';
    passwordToggle.textContent = showing ? 'Ocultar' : 'Mostrar';
    passwordToggle.setAttribute('aria-label', showing ? 'Ocultar contraseña' : 'Mostrar contraseña');
    passwordToggle.setAttribute('aria-pressed', String(showing));
  });

  const email = document.querySelector('#email');
  const loginStatus = document.querySelector('#login-status');
  document.querySelector('#login-submit').addEventListener('click', () => {
    if (!email.reportValidity() || !password.reportValidity()) return;
    email.value = '';
    password.value = '';
    password.type = 'password';
    passwordToggle.textContent = 'Mostrar';
    passwordToggle.setAttribute('aria-label', 'Mostrar contraseña');
    passwordToggle.setAttribute('aria-pressed', 'false');
    loginStatus.textContent = 'Interfaz de demostración: no se verificó, envió ni guardó ningún dato.';
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
