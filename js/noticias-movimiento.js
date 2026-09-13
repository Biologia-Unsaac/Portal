(function () {
  const track = document.getElementById('menuTrack');
  const prevBtn = document.getElementById('menuPrev');
  const nextBtn = document.getElementById('menuNext');

  if (!track) return;

  function scrollStep() {
    const item = track.querySelector('.Box-2');
    const gap = parseFloat(getComputedStyle(track).gap) || 28;
    return item ? item.offsetWidth + gap : 150;
  }

  prevBtn && prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -scrollStep(), behavior: 'smooth' });
  });

  nextBtn && nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: scrollStep(), behavior: 'smooth' });
  });

  let isDown = false;
  let startX = 0;
  let startScroll = 0;

  track.addEventListener('mousedown', (e) => {
    isDown = true;
    track.classList.add('dragging');
    startX = e.pageX;
    startScroll = track.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
    track.classList.remove('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    track.scrollLeft = startScroll - (e.pageX - startX);
  });
})();