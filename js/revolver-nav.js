(() => {
  const nav = document.getElementById('noticiasTrack');
  if (!nav) return;

  const originalItems = [...nav.children];
  if (!originalItems.length) return;

  originalItems.forEach((item) => {
    item.style.flexShrink = '0';
    const clone = item.cloneNode(true);
    nav.appendChild(clone);
  });

  const getOneSetWidth = () => {
    const items = [...nav.children].slice(0, originalItems.length);
    const gap = parseFloat(getComputedStyle(nav).gap) || 28;
    const width = items.reduce((total, item) => total + item.getBoundingClientRect().width, 0);
    return width + gap * (items.length - 1) + gap;
  };

  let offset = 0;
  let autoSpeed = 0.9;
  let isDragging = false;       // true solo cuando ya se superó el umbral de arrastre
  let isPointerDown = false;    // true desde pointerdown hasta pointerup/cancel/leave
  let justDragged = false;      // evita que el click se dispare justo después de arrastrar
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let velocity = 0;
  const DRAG_THRESHOLD = 6; // px de tolerancia antes de considerarlo arrastre real

  const wrapOffset = () => {
    const cycleWidth = getOneSetWidth();
    if (!cycleWidth) return;

    if (offset < -cycleWidth) {
      offset += cycleWidth;
    }

    if (offset > 0) {
      offset -= cycleWidth;
    }
  };

  const applyTransform = () => {
    nav.style.transform = `translate3d(${offset}px, 0, 0)`;
  };

  const animate = () => {
    if (!isDragging) {
      offset -= autoSpeed;
    } else {
      offset += velocity;
      velocity *= 0.9;
      if (Math.abs(velocity) < 0.04) velocity = 0;
    }

    wrapOffset();
    applyTransform();
    requestAnimationFrame(animate);
  };

  nav.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return; // solo click/touch primario

    isPointerDown = true;
    startX = event.clientX;
    startY = event.clientY;
    lastX = event.clientX;
    velocity = 0;
    // Ojo: NO se activa isDragging ni se captura el puntero todavía.
    // Así, si el usuario solo hace clic, el evento sigue llegando normalmente al <a>.
  });

  nav.addEventListener('pointermove', (event) => {
    if (!isPointerDown) return;

    if (!isDragging) {
      const deltaXTotal = event.clientX - startX;
      const deltaYTotal = event.clientY - startY;

      if (Math.abs(deltaXTotal) < DRAG_THRESHOLD && Math.abs(deltaYTotal) < DRAG_THRESHOLD) {
        return; // movimiento mínimo, todavía podría ser un clic
      }

      // Se superó el umbral: recién ahora empieza el arrastre real
      isDragging = true;
      nav.classList.add('is-dragging');
      nav.setPointerCapture(event.pointerId);
    }

    const deltaX = event.clientX - lastX;
    offset += deltaX * 0.9;
    velocity = deltaX * 0.12;
    lastX = event.clientX;

    wrapOffset();
    applyTransform();
  });

  const stopDragging = () => {
    if (!isPointerDown) return;
    isPointerDown = false;

    if (isDragging) {
      isDragging = false;
      nav.classList.remove('is-dragging');
      justDragged = true;
      // Se limpia en el siguiente tick, después de que el navegador dispare 'click'
      setTimeout(() => { justDragged = false; }, 0);

      const nextSpeed = Math.abs(velocity) > 0.25 ? Math.abs(velocity) * 0.8 : 0.9;
      autoSpeed = Math.min(Math.max(nextSpeed, 0.4), 2.4);
    }
  };

  nav.addEventListener('pointerup', stopDragging);
  nav.addEventListener('pointercancel', stopDragging);
  nav.addEventListener('pointerleave', stopDragging);

  // Si hubo un arrastre real, se cancela el click resultante para que no navegue por error
  nav.addEventListener('click', (event) => {
    if (justDragged) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  applyTransform();
  requestAnimationFrame(animate);
})();