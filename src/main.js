import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import './styles.css';
import { PinepopScene } from './scene/Scene.js';
import { initScroll } from './scroll.js';
import { initShop, loadSite } from './shop.js';
import { applySite } from './content.js';
import { initTrack } from './track.js';
import { initTopo } from './topo.js';
import { initCursor } from './cursor.js';
import { initMenu } from './menu.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = window.matchMedia('(max-width: 860px)').matches;

document.body.classList.add('is-loading');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

// ---------- loader ----------

const loaderCount = document.getElementById('loaderCount');
const progress = { v: 0 };
const progressTween = gsap.to(progress, {
  v: 90,
  duration: 1.8,
  ease: 'power2.out',
  onUpdate: () => (loaderCount.textContent = Math.round(progress.v)),
});

// ---------- smooth scroll ----------

const lenis = reducedMotion ? null : new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}

const menu = initMenu(lenis);

document.querySelectorAll('[data-scroll]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    menu.close();
    if (lenis) lenis.scrollTo(target, { duration: 1.6, force: true });
    else target.scrollIntoView();
  });
});

// ---------- boot ----------

async function boot() {
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);

  const scene = new PinepopScene(document.getElementById('webgl'), { mobile });
  if (location.hostname === 'localhost') window.__pinepop = scene; // handy for poking at the scene from devtools
  const topo = initTopo(document.getElementById('topo'));

  let site = null;
  try {
    site = await loadSite();
  } catch {
    console.warn('საიტის მონაცემები ვერ ჩაიტვირთა — სერვერი ჩართულია?');
  }
  if (site) {
    const { t, brand } = applySite(site);
    scene.setLabel(brand, site.settings.jarSizeMl);
    if (site.products.length) initShop({ site, t, scene, lenis });
    // one cookieless visit per page load, for the admin's visitor count
    fetch('/api/visit', { method: 'POST', keepalive: true }).catch(() => {});
  }
  if (!site?.products.length) scene.setFlavor('#ff2e4d', 'ალუბალი');
  initTrack(lenis);

  scene.warmup();
  initScroll({ scene, topo });
  initCursor(document.getElementById('cursor'));
  ScrollTrigger.refresh();

  await progressTween.then();
  intro(scene);
}

function intro(scene) {
  const heroWord = new SplitText('.hero__giant', { type: 'chars', charsClass: 'char' });
  const tl = gsap.timeline({ defaults: { ease: 'expo.inOut' } });
  tl.to(progress, { v: 100, duration: 0.4, ease: 'none', onUpdate: () => (loaderCount.textContent = Math.round(progress.v)) })
    .to('#loader', { yPercent: -100, duration: 1.1 })
    .from(heroWord.chars, { yPercent: 110, duration: 1.3, stagger: 0.05, ease: 'expo.out' }, '-=0.45')
    .to(scene.state, { intro: 1, duration: 2, ease: 'expo.out' }, '<')
    .from('.hero__content > *', { y: 40, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out' }, '<0.3')
    .from('.nav > *', { y: -30, opacity: 0, duration: 0.9, stagger: 0.06, ease: 'expo.out' }, '<')
    .add(() => {
      document.body.classList.remove('is-loading');
      document.getElementById('loader').remove();
      lenis?.start();
    }, '-=1.2');
}

boot();
