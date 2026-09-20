document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('promoOverlay');
  const closeBtn = document.getElementById('promoClose');

  if (!overlay) return;

  function cerrar() {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    try {
      localStorage.setItem('promoAnuncioCerrado', '1');
    } catch (e) {}
  }

  if (localStorage.getItem('promoAnuncioCerrado') === '1') {
    cerrar();
    return;
  }

  overlay.classList.add('is-visible');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  if (closeBtn) {
    closeBtn.addEventListener('click', cerrar);
  }

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) cerrar();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') cerrar();
  });
});
