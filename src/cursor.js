import gsap from 'gsap';

export function initCursor(el) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });

  window.addEventListener('pointermove', (e) => {
    el.style.opacity = '1';
    xTo(e.clientX);
    yTo(e.clientY);
  });
  document.addEventListener('pointerleave', () => (el.style.opacity = '0'));
  document.addEventListener('pointerover', (e) => {
    el.classList.toggle('is-big', !!e.target.closest('a, button, select, input, textarea, label'));
  });
}
