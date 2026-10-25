import gsap from 'gsap';

// Phone menu: a yellow sheet that grows out of the menu button as a circle,
// then the links rise one by one. Returns close() for the nav links to call.
export function initMenu(lenis) {
  const menu = document.getElementById('menu');
  const btn = document.getElementById('menuBtn');
  const links = menu.querySelectorAll('.menu__links a span');
  const foot = menu.querySelector('.menu__foot');
  let open = false;
  let tl = null;

  function show() {
    open = true;
    const at = `${window.innerWidth - 38}px 40px`;
    tl?.kill();
    tl = gsap
      .timeline({
        onReverseComplete: () => {
          gsap.set(menu, { visibility: 'hidden' });
          document.body.classList.remove('menu-open');
        },
      })
      .set(menu, { visibility: 'visible' })
      .fromTo(menu, { clipPath: `circle(0% at ${at})` }, { clipPath: `circle(150% at ${at})`, duration: 0.8, ease: 'expo.inOut' })
      .fromTo(links, { yPercent: 110 }, { yPercent: 0, duration: 0.8, stagger: 0.06, ease: 'expo.out' }, '-=0.35')
      .fromTo(foot, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, '<0.2');
    document.body.classList.add('menu-open');
    btn.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-hidden', 'false');
    lenis?.stop();
  }

  function close() {
    if (!open) return false;
    open = false;
    tl?.timeScale(1.6).reverse();
    btn.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
    lenis?.start();
    return true;
  }

  btn.addEventListener('click', () => (open ? close() : show()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // the menu only exists on phones; never leave it stuck open after a resize
  window.matchMedia('(max-width: 860px)').addEventListener('change', (e) => {
    if (!e.matches) close();
  });

  return { close };
}
