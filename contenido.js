'use strict';

(() => {
  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiRoot = localHost
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : '/api';

  function safeMediaUrl(value, video = false) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const candidate = value.trim();
    if (!video && !candidate.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(candidate)) {
      return candidate.split('/').includes('..') || candidate.includes('\\') ? null : candidate;
    }
    try {
      const parsed = new URL(candidate);
      const hosts = video
        ? ['drive.google.com', 'youtube.com', 'www.youtube.com', 'youtu.be']
        : null;
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (hosts && !hosts.includes(parsed.hostname.toLowerCase()))) return null;
      if (video && parsed.hostname.toLowerCase() === 'drive.google.com') {
        const driveId = parsed.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1];
        if (driveId) return `https://drive.google.com/file/d/${driveId}/preview`;
      }
      if (video && ['youtube.com', 'www.youtube.com', 'youtu.be'].includes(parsed.hostname.toLowerCase())) {
        const youtubeId = parsed.hostname.toLowerCase() === 'youtu.be'
          ? parsed.pathname.split('/').filter(Boolean)[0]
          : (parsed.searchParams.get('v') || parsed.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]+)/)?.[1]);
        if (!youtubeId || !/^[A-Za-z0-9_-]+$/.test(youtubeId)) return null;
        return `https://www.youtube.com/embed/${youtubeId}`;
      }
      return parsed.href;
    } catch { return null; }
  }

  async function getItems(type) {
    const response = await fetch(`${apiRoot}/${type}`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return null;
    const body = await response.json().catch(() => ({}));
    return Array.isArray(body.items) ? body.items : null;
  }

  function renderComercios(items) {
    const container = document.querySelector('#comercios .center-grid');
    if (!container) return;
    if (items === null || !items.length) {
      const empty = document.createElement('p');
      empty.className = 'public-content-empty';
      empty.textContent = items === null
        ? 'No fue posible cargar los comercios en este momento.'
        : 'No hay comercios disponibles por el momento.';
      container.replaceChildren(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'center-card commerce-card';
      const imageUrl = safeMediaUrl(item.imagen_url);
      if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'commerce-image';
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        card.append(image);
      }
      const category = document.createElement('span');
      category.className = 'center-type';
      category.textContent = item.categoria || 'Comercio local';
      const title = document.createElement('h3');
      title.textContent = item.nombre || '';
      const description = document.createElement('p');
      description.textContent = item.descripcion || '';
      card.append(category, title, description);
      if (item.ubicacion) {
        const location = document.createElement('span');
        location.className = 'center-contact';
        location.textContent = item.ubicacion;
        card.append(location);
      }
      if (item.contacto) {
        const contact = document.createElement('span');
        contact.className = 'center-contact';
        contact.textContent = item.contacto;
        card.append(contact);
      }
      const website = safeMediaUrl(item.sitio_web);
      if (website) {
        const link = document.createElement('a');
        link.className = 'commerce-link';
        link.href = website;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Visitar sitio';
        card.append(link);
      }
      fragment.append(card);
    }
    container.replaceChildren(fragment);
  }

  function renderVideos(items) {
    const container = document.querySelector('#videos .video-grid');
    if (!container || items === null) return;
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'public-content-empty';
      empty.textContent = 'No hay videos publicados por el momento.';
      container.replaceChildren(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const source = safeMediaUrl(item.video_url, true);
      if (!source) continue;
      const card = document.createElement('article');
      card.className = 'video-card';
      const frame = document.createElement('iframe');
      frame.className = 'video-player video-embed';
      frame.src = source;
      frame.title = item.titulo || 'Video de Tenango de las Flores';
      frame.loading = 'lazy';
      frame.allow = 'autoplay; encrypted-media';
      frame.allowFullscreen = true;
      const kicker = document.createElement('p');
      kicker.className = 'card-kicker';
      kicker.textContent = 'Relato audiovisual';
      const title = document.createElement('h3');
      title.textContent = item.titulo || '';
      card.append(frame, kicker, title);
      if (item.descripcion) {
        const description = document.createElement('p');
        description.textContent = item.descripcion;
        card.append(description);
      }
      fragment.append(card);
    }
    if (fragment.childNodes.length) container.replaceChildren(fragment);
  }

  function renderGaleria(items) {
    const container = document.querySelector('#galeria .gallery-grid');
    if (!container || items === null) return;
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'public-content-empty';
      empty.textContent = 'No hay fotografías publicadas por el momento.';
      container.replaceChildren(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const [index, item] of items.entries()) {
      const source = safeMediaUrl(item.imagen_url);
      if (!source) continue;
      const figure = document.createElement('figure');
      figure.className = `gallery-item${index === 0 ? ' gallery-tall' : ''}`;
      const image = document.createElement('img');
      image.src = source;
      image.alt = item.texto_alternativo || item.titulo || 'Fotografía de Tenango de las Flores';
      image.loading = 'lazy';
      image.decoding = 'async';
      figure.append(image);
      fragment.append(figure);
    }
    if (fragment.childNodes.length) container.replaceChildren(fragment);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const [comercios, videos, galeria] = await Promise.all([
      getItems('comercios').catch(() => null),
      getItems('videos').catch(() => null),
      getItems('galeria').catch(() => null)
    ]);
    renderComercios(comercios);
    renderVideos(videos);
    renderGaleria(galeria);
  });
})();
