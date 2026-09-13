document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('promoOverlay');
  const closeButtons = [
    document.getElementById('promoClose'),
    document.getElementById('promoLater')
  ].filter(Boolean);

  if (!overlay) return;

  const openPopup = () => {
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  };

  const closePopup = () => {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  };

  const hideForSession = () => {
    if (window.sessionStorage) {
      sessionStorage.setItem('portalPopupClosed', 'true');
    }
  };

  const shouldShowPopup = !(window.sessionStorage && sessionStorage.getItem('portalPopupClosed'));

  if (shouldShowPopup) {
    setTimeout(openPopup, 700);
  }

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      hideForSession();
      closePopup();
    });
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      hideForSession();
      closePopup();
    }
  });
});
