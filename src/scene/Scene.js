import * as THREE from 'three';
import { Jar } from './jar.js';
import { createPineappleAssets, createPineapple } from './pineapple.js';
import { studioEnvironment, glowTexture } from './studio.js';

// Floating whole pineapples. fx/fy are fractions of the visible half-width/height
// at that depth, k is the scroll-parallax factor (bigger = moves faster).
const PINEAPPLES = [
  { fx: -0.8, fy: 0.32, z: -2.5, s: 0.85, k: 0.55 },
  { fx: 0.82, fy: 0.42, z: -4.2, s: 0.95, k: 0.38 },
  { fx: -0.45, fy: -1.25, z: -1.0, s: 0.7, k: 0.8 },
  { fx: 0.7, fy: -0.48, z: -1.4, s: 0.66, k: 1.05 },
  { fx: -0.2, fy: 1.25, z: -5.5, s: 1.0, k: 0.3 },
  { fx: 0.28, fy: -1.3, z: -3.2, s: 0.8, k: 0.5 },
];

// Phones: fewer, further back, and none starting over the hero text at the bottom.
const PINEAPPLES_MOBILE = [
  { fx: -0.9, fy: 0.6, z: -3.5, s: 0.7, k: 0.5 },
  { fx: 0.92, fy: 0.8, z: -5, s: 0.8, k: 0.35 },
  { fx: 0.88, fy: 0.12, z: -2.8, s: 0.6, k: 0.75 },
  { fx: -0.7, fy: -1.4, z: -3, s: 0.65, k: 0.6 },
];

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export class PinepopScene {
  constructor(canvas, { mobile = false } = {}) {
    this.mobile = mobile;
    const dpr = window.devicePixelRatio || 1;
    // On dense screens antialiasing costs a lot and is barely visible.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(dpr, mobile ? 1.5 : 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    // far pineapples sink into the page background for depth
    this.scene.fog = new THREE.Fog('#11150d', 10.5, 21);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    this.camera.position.set(0, 0.35, 10);
    this.camera.lookAt(0, 0, 0);

    this.scene.environment = studioEnvironment(this.renderer);

    const key = new THREE.DirectionalLight('#fff1d6', 1.6);
    key.position.set(4, 6, 6);
    const rim = new THREE.DirectionalLight('#ffd23f', 1.6);
    rim.position.set(-6, 2, -4);
    this.scene.add(key, rim, new THREE.HemisphereLight('#fff7e0', '#1c2216', 0.7));

    // Everything the scroll/intro code is allowed to drive.
    this.state = { x: 0, y: 0, s: 1, ry: 0, lid: 0, coat: 1, fill: 1, powder: 0, spin: 0, intro: 0, vel: 0 };
    this.scrollPx = 0;
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.kickAt = -10; // time of the last flavour change (spin + hop)

    this.jar = new Jar({ mobile });
    this.scene.add(this.jar.group);

    // coloured light behind the jar, follows its position but never rotates
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff2e4d', transparent: true, opacity: 0.32, depthWrite: false, fog: false })
    );
    this.glow.renderOrder = -1;
    this.scene.add(this.glow);

    const assets = createPineappleAssets();
    this.pineapples = (mobile ? PINEAPPLES_MOBILE : PINEAPPLES).map((cfg, i) => {
      const g = createPineapple(assets);
      g.scale.setScalar(cfg.s);
      g.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.7);
      this.scene.add(g);
      return { g, cfg, phase: i * 1.7, spin: (0.12 + Math.random() * 0.2) * (i % 2 ? 1 : -1), tilt: g.rotation.z };
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    });
    this._w = 0;
    this._h = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Ignore the small height jumps from mobile address bars.
    if (w === this._w && Math.abs(h - this._h) < 120) return;
    this._w = w;
    this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  halfView(z = 0) {
    const h = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.camera.position.z - z);
    return { h, w: h * this.camera.aspect };
  }

  setFlavor(hex, name) {
    const first = !this.jar.flavor.name;
    this.jar.setFlavor(hex, name, { instant: first });
    if (!first) this.kickAt = this._time ?? 0;
  }

  setLabel(brand, sizeMl) {
    this.jar.label = { brand, sizeMl };
    this.jar.drawLabel();
  }

  // Precompile shaders so the first scroll doesn't hitch.
  warmup() {
    this.jar.update({ ...this.state, powder: 0.5 }, 0, 0);
    this.renderer.compile(this.scene, this.camera);
    this.render(0, 0);
  }

  render(time, dt) {
    this._time = time;
    const st = this.state;
    const m = this.mouse;
    m.x += (m.tx - m.x) * Math.min(1, dt * 3);
    m.y += (m.ty - m.y) * Math.min(1, dt * 3);

    // flavour change: one quick turn and a little hop
    const k = Math.min(1, (time - this.kickAt) / 1.1);
    const kickSpin = k < 1 ? easeOutCubic(k) * Math.PI * 2 : 0;
    const hop = k < 1 ? Math.sin(k * Math.PI) * 0.16 : 0;

    // jar pose
    const view = this.halfView(0);
    const intro = st.intro;
    const jar = this.jar;
    const scale = st.s * (0.55 + 0.45 * intro);
    jar.group.position.set(st.x * view.w, st.y * view.h + Math.sin(time * 1.1) * 0.06 - (1 - intro) * 0.6 + hop, 0);
    jar.group.scale.setScalar(scale);
    // tilts with the mouse on desktop and leans into fast scrolling everywhere
    jar.group.rotation.set(
      m.y * 0.12 + 0.06 + st.vel * 0.22,
      m.x * 0.25,
      -m.x * 0.05 + Math.sin(time * 0.8) * 0.02
    );
    jar.body.rotation.y = time * 0.18 + st.ry + st.spin + kickSpin + (1 - intro) * -2.2;
    jar.update(st, time, dt);

    this.glow.position.set(jar.group.position.x, jar.group.position.y - 0.1, -1.8);
    this.glow.scale.setScalar(6.2 * scale);
    this.glow.material.color.copy(jar.flavor.color);
    this.glow.material.opacity = 0.3 * intro;

    // pineapples drift with scroll (parallax) and wrap around vertically.
    // Once the jar moves to one side they gather on that side, keeping the text side clean.
    const side = Math.max(-1, Math.min(1, st.x / 0.46));
    const gather = Math.abs(side);
    for (const p of this.pineapples) {
      const { cfg } = p;
      const v = this.halfView(cfg.z);
      const pxPerUnit = this._h / (2 * v.h);
      const range = 2 * v.h + 3.2;
      let y = cfg.fy * v.h + (this.scrollPx * cfg.k) / pxPerUnit;
      y = ((((y + range / 2) % range) + range) % range) - range / 2;
      const fx = cfg.fx * (1 - 0.58 * gather) + side * 0.56;
      p.g.position.set(fx * v.w + m.x * 0.25 * (1 + cfg.z * 0.1), y + Math.sin(time * 0.9 + p.phase) * 0.12, cfg.z);
      p.g.rotation.y += p.spin * dt * (1 + Math.abs(st.vel) * 6);
      p.g.rotation.z = p.tilt + Math.sin(time * 0.7 + p.phase) * 0.08 + st.vel * 0.3 * Math.sign(p.spin);
      p.g.visible = intro > 0.02;
      p.g.scale.setScalar(cfg.s * Math.min(1, intro * 1.2));
    }

    this.renderer.render(this.scene, this.camera);
  }
}
