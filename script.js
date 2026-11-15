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
});
