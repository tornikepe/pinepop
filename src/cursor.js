import gsap from 'gsap';

// Desktop only: a blend-mode dot that follows the mouse, and buttons that lean
// towards the pointer ("magnetic") before you click them.
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

  document.querySelectorAll('[data-magnetic]').forEach((btn) => {
    const bx = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
    const by = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      bx((e.clientX - (r.left + r.width / 2)) * 0.28);
      by((e.clientY - (r.top + r.height / 2)) * 0.4);
    });
    btn.addEventListener('pointerleave', () => {
      bx(0);
      by(0);
    });
  });
}
