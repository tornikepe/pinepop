import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Jar } from './jar.js';
import { createPineappleAssets, createPineapple } from './pineapple.js';

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

export class PinepopScene {
  constructor(canvas, { mobile = false } = {}) {
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    // far pineapples sink into the page background for depth
    this.scene.fog = new THREE.Fog('#11150d', 10.5, 21);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    this.camera.position.set(0, 0.35, 10);
    this.camera.lookAt(0, 0, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight('#fff1d6', 1.4);
    key.position.set(4, 6, 6);
    const rim = new THREE.DirectionalLight('#ffd23f', 1.4);
    rim.position.set(-6, 2, -4);
    this.scene.add(key, rim, new THREE.AmbientLight('#ffffff', 0.08));

    // Everything the scroll/intro code is allowed to drive.
    this.state = { x: 0, y: 0, s: 1, ry: 0, lid: 0, coat: 1, fill: 1, powder: 0, spin: 0, intro: 0 };
    this.scrollPx = 0;
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    this.jar = new Jar({ mobile });
    this.scene.add(this.jar.group);

    const assets = createPineappleAssets();
    this.pineapples = PINEAPPLES.slice(0, mobile ? 4 : 6).map((cfg, i) => {
      const g = createPineapple(assets);
      // phones: smaller and further back so they don't fight with the text
      if (mobile) cfg = { ...cfg, z: cfg.z - 1.5, s: cfg.s * 0.8 };
      g.scale.setScalar(cfg.s);
      g.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.7);
      this.scene.add(g);
      return { g, cfg, phase: i * 1.7, spin: (0.12 + Math.random() * 0.2) * (i % 2 ? 1 : -1), tilt: g.rotation.z };
    });

    window.addEventListener('pointermove', (e) => {
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
    this.jar.setFlavor(hex, name);
  }

  setLabel(brand, sizeMl) {
    this.jar.label = { brand, sizeMl };
    this.jar.drawLabel();
  }

  // Precompile shaders so the first scroll doesn't hitch.
  warmup() {
    this.jar.update({ ...this.state, powder: 0.5 }, 0);
    this.renderer.compile(this.scene, this.camera);
    this.render(0, 0);
  }

  render(time, dt) {
    const st = this.state;
    const m = this.mouse;
    m.x += (m.tx - m.x) * Math.min(1, dt * 3);
    m.y += (m.ty - m.y) * Math.min(1, dt * 3);

    // jar pose
    const view = this.halfView(0);
    const intro = st.intro;
    const jar = this.jar;
    jar.group.position.set(st.x * view.w, st.y * view.h + Math.sin(time * 1.1) * 0.06 - (1 - intro) * 0.6, 0);
    jar.group.scale.setScalar(st.s * (0.55 + 0.45 * intro));
    jar.group.rotation.set(m.y * 0.12 + 0.06, m.x * 0.25, -m.x * 0.05 + Math.sin(time * 0.8) * 0.02);
    jar.body.rotation.y = time * 0.18 + st.ry + st.spin + (1 - intro) * -2.2;
    jar.update(st, time);

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
      p.g.rotation.y += p.spin * dt;
      p.g.rotation.z = p.tilt + Math.sin(time * 0.7 + p.phase) * 0.08;
      p.g.visible = intro > 0.02;
      p.g.scale.setScalar(cfg.s * Math.min(1, intro * 1.2));
    }

    this.renderer.render(this.scene, this.camera);
  }
}
