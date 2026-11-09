const photos = [...document.querySelectorAll('.portal-photos img')];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let timer;
let current = 0;

function updateSlideshow() {
  clearInterval(timer);
  if (reduceMotion.matches || document.hidden || photos.length < 2) return;
  timer = setInterval(() => {
    const next = (current + 1) % photos.length;
    if (!photos[next].complete || !photos[next].naturalWidth) return;
    photos[current].classList.remove('is-current');
    photos[next].classList.add('is-current');
    current = next;
  }, 5500);
}

document.addEventListener('visibilitychange', updateSlideshow);
reduceMotion.addEventListener('change', updateSlideshow);
updateSlideshow();
