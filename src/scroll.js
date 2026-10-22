import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------- jar poses ----------
// Every section carries data-pose="fx,fy,scale,rotY" (data-pose-m for phones).
// The jar holds a section's pose while that section fills the screen and
// eases to the next pose while the next section scrolls in.

function createPoseTrack(mobileQuery) {
  const els = [...document.querySelectorAll('[data-pose]')];
  let anchors = [];

  function measure() {
    const vh = window.innerHeight;
    const maxScroll = document.documentElement.scrollHeight - vh;
    const mobile = mobileQuery.matches;
    anchors = els.map((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const raw = (mobile && el.dataset.poseM) || el.dataset.pose;
      const [x, y, s, ry] = raw.split(',').map(Number);
      const start = Math.min(top, maxScroll);
      const end = Math.min(Math.max(top, top + el.offsetHeight - vh), maxScroll);
      return { start, end, pose: { x, y, s, ry } };
    });
  }

  const out = { x: 0, y: 0, s: 1, ry: 0 };
  function at(scroll) {
    const first = anchors[0];
    if (!first) return out;
    let a = first;
    let b = null;
    for (let i = 0; i < anchors.length; i++) {
      if (scroll >= anchors[i].start) a = anchors[i];
      if (scroll < anchors[i].start) {
        b = anchors[i];
        break;
      }
    }
    if (!b || scroll <= a.end) return Object.assign(out, a.pose);
    const t = easeInOut(clamp01((scroll - a.end) / (b.start - a.end || 1)));
    for (const k of ['x', 'y', 's', 'ry']) out[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * t;
    return out;
  }

  return { measure, at };
}

// ---------- process (sticky) ----------

function processState(p) {
  // 0.00–0.07  lid opens, the jar "rewinds" to empty
  // 0.08–0.33  fresh yellow chunks drop in        (step 1: cut)
  // 0.36–0.64  powder falls, chunks change colour  (step 2: sprinkle)
  // 0.68–1.00  lid closes, jar spins               (step 3: seal)
  const open = smooth(seg(p, 0, 0.07));
  return {
    lid: open * (1 - smooth(seg(p, 0.68, 0.82))),
    fill: p < 0.075 ? 1 - open : seg(p, 0.08, 0.33),
    coat: p < 0.075 ? 1 - open : smooth(seg(p, 0.38, 0.62)),
    powder: Math.sin(Math.PI * seg(p, 0.34, 0.66)),
    spin: smooth(seg(p, 0.66, 1)) * Math.PI * 2,
  };
}

export function initScroll({ scene, lenis, topo }) {
  const mobileQuery = window.matchMedia('(max-width: 860px)');
  const poses = createPoseTrack(mobileQuery);

  const processEl = document.querySelector('.process');
  const steps = [...processEl.querySelectorAll('.step')];
  const stepNum = document.getElementById('stepNum');
  const stepBar = document.getElementById('stepBar');
  let processTop = 0;
  let processLen = 1;
  let activeStep = -1;
  let maxScroll = 1;

  function measure() {
    poses.measure();
    processTop = processEl.getBoundingClientRect().top + window.scrollY;
    processLen = processEl.offsetHeight - window.innerHeight;
    maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  }
  measure();
  ScrollTrigger.addEventListener('refresh', measure);
  mobileQuery.addEventListener('change', () => ScrollTrigger.refresh());

  function setStep(i) {
    if (i === activeStep) return;
    activeStep = i;
    steps.forEach((el, k) => {
      el.classList.toggle('is-active', k === i);
      el.classList.toggle('is-past', k < i);
    });
    stepNum.textContent = String(i + 1).padStart(2, '0');
  }
  setStep(0);

  // Drive the 3D scene from the (Lenis-smoothed) scroll position every frame.
  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const y = window.scrollY;

    Object.assign(scene.state, poses.at(y));
    const p = clamp01((y - processTop) / processLen);
    Object.assign(scene.state, processState(p));
    setStep(p < 0.34 ? 0 : p < 0.66 ? 1 : 2);
    stepBar.style.transform = `scaleX(${p})`;

    scene.scrollPx = y;
    topo(y, maxScroll);
    scene.render(now / 1000, dt);
  });

  initReveals();
  initMarquee(lenis);
}

// ---------- text & UI reveals ----------

function initReveals() {
  // statement: words light up as you scroll through it
  const statement = new SplitText('#statement', { type: 'words', wordsClass: 'word' });
  gsap.to(statement.words, {
    opacity: 1,
    stagger: 0.1,
    ease: 'none',
    scrollTrigger: { trigger: '#statement', start: 'top 80%', end: 'bottom 45%', scrub: true },
  });

  // hand-drawn doodle draws itself
  const path = document.querySelector('.doodle path');
  const len = path.getTotalLength();
  gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
  gsap.to(path, {
    strokeDashoffset: 0,
    ease: 'none',
    scrollTrigger: { trigger: '.doodle', start: 'top 85%', end: 'bottom 35%', scrub: true },
  });

  // stats count up
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const obj = { v: 0 };
    el.textContent = '0';
    gsap.to(obj, {
      v: target,
      duration: 1.6,
      ease: 'power3.out',
      onUpdate: () => (el.textContent = Math.round(obj.v)),
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  // section titles: lines slide up out of a mask
  document.querySelectorAll('.reveal').forEach((el) => {
    const split = new SplitText(el, { type: 'lines', mask: 'lines', linesClass: 'line' });
    gsap.from(split.lines, {
      yPercent: 110,
      duration: 1.1,
      stagger: 0.08,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  // footer wordmark letters
  const footerWord = new SplitText('.footer__giant', { type: 'chars' });
  gsap.from(footerWord.chars, {
    yPercent: 100,
    opacity: 0,
    stagger: 0.04,
    duration: 1,
    ease: 'expo.out',
    scrollTrigger: { trigger: '.footer__giant', start: 'top 90%' },
  });

  // hero wordmark drifts apart as you leave the hero
  gsap.to('.hero__giant', {
    y: () => window.innerHeight * 0.3,
    opacity: 0.25,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
  });
}

// Marquee speed follows scroll velocity and flips with scroll direction.
function initMarquee(lenis) {
  const rows = [...document.querySelectorAll('.marquee__row')].map((row) => {
    const track = row.querySelector('.marquee__track');
    // clone enough copies to cover wide screens
    for (let i = 0; i < 3; i++) row.appendChild(track.cloneNode(true));
    return { row, tracks: [...row.querySelectorAll('.marquee__track')], dir: Number(row.dataset.dir), x: 0 };
  });
  let direction = 1;
  gsap.ticker.add((_t, deltaMs) => {
    const v = lenis ? lenis.velocity : 0;
    if (v > 0.1) direction = 1;
    else if (v < -0.1) direction = -1;
    const speed = (40 + Math.min(600, Math.abs(v) * 30)) * (deltaMs / 1000);
    for (const r of rows) {
      const w = r.tracks[0].offsetWidth;
      if (!w) continue;
      r.x -= speed * r.dir * direction;
      r.x = ((r.x % w) - w) % w;
      for (const t of r.tracks) t.style.transform = `translate3d(${r.x}px,0,0)`;
    }
  });
}
