document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('promoOverlay');

  if (!overlay) return;

  overlay.classList.add('is-visible');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
});
