import * as THREE from 'three';

// Medium glass jar: refractive glass shell, printed label, painted screw lid,
// pineapple chunks inside (instanced) and a powder stream for the process scene.

const R = 1.0; // outer radius
const BOTTOM = -1.3;
const SHOULDER = 0.8;
const NECK_R = 0.84;
const NECK_TOP = 1.3;
const LID_Y = 1.21;

const YELLOWS = ['#ffd23f', '#ffc933', '#f7b731', '#ffdc5e', '#ffbf2e'].map((c) => new THREE.Color(c));

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function glassProfile() {
  const p = [new THREE.Vector2(0, BOTTOM), new THREE.Vector2(R - 0.14, BOTTOM)];
  const cr = 0.14;
  for (let i = 1; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    p.push(new THREE.Vector2(R - cr + Math.cos(a) * cr, BOTTOM + cr + Math.sin(a) * cr));
  }
  p.push(new THREE.Vector2(R, SHOULDER));
  // shoulder → neck (quadratic curve)
  const a = new THREE.Vector2(R, SHOULDER);
  const c = new THREE.Vector2(R, 1.07);
  const b = new THREE.Vector2(NECK_R, 1.09);
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    p.push(
      new THREE.Vector2(
        (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
        (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y
      )
    );
  }
  p.push(new THREE.Vector2(NECK_R, NECK_TOP));
  p.push(new THREE.Vector2(NECK_R - 0.05, NECK_TOP + 0.01));
  return p;
}

function chunkGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.045, -0.075);
  shape.lineTo(0.045, -0.075);
  shape.lineTo(0.095, 0.075);
  shape.lineTo(-0.095, 0.075);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.026,
    bevelSegments: 3,
    curveSegments: 1,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function knurledLid() {
  const geo = new THREE.CylinderGeometry(0.9, 0.9, 0.3, 256, 2, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.85) continue;
    const theta = Math.atan2(x, z);
    const k = 0.9 + 0.011 * Math.sin(theta * 64);
    pos.setX(i, (x / r) * k);
    pos.setZ(i, (z / r) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Jar {
  constructor({ mobile = false } = {}) {
    this.group = new THREE.Group(); // positioned by the scroll pose
    this.body = new THREE.Group(); // spins
    this.group.add(this.body);

    this.flavor = { color: new THREE.Color('#ff2e4d'), name: '' };
    this.label = { brand: 'PINEPOP', sizeMl: 720 };
    this._flavorKey = '';
    this._lastCoat = -1;
    this._lastFill = -1;

    this.#buildGlass();
    this.#buildLabel();
    this.#buildLid();
    this.#buildContents(mobile ? 300 : 520);
    this.#buildPowder(mobile ? 260 : 520);
  }

  #buildGlass() {
    const glass = new THREE.Mesh(
      new THREE.LatheGeometry(glassProfile(), 128),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: 0.03,
        transmission: 1,
        thickness: 0.35,
        ior: 1.5,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.25,
        attenuationColor: new THREE.Color('#f2fff6'),
        attenuationDistance: 4,
        side: THREE.DoubleSide,
      })
    );
    glass.renderOrder = 2;
    this.body.add(glass);
  }

  #buildLabel() {
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 2048;
    this.labelCanvas.height = 400;
    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    this.labelTex.anisotropy = 8;
    const arc = Math.PI * 2 * 0.62;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.78, 128, 1, true, -arc / 2, arc),
      new THREE.MeshPhysicalMaterial({
        map: this.labelTex,
        roughness: 0.42,
        clearcoat: 0.6,
        clearcoatRoughness: 0.3,
        side: THREE.DoubleSide,
      })
    );
    label.position.y = -0.22;
    this.body.add(label);
  }

  drawLabel() {
    const c = this.labelCanvas;
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    const accent = '#' + this.flavor.color.getHexString(THREE.SRGBColorSpace);

    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, W, H);
    g.fillStyle = accent;
    g.fillRect(0, 0, W, 34);
    g.fillRect(0, H - 34, W, 34);

    g.fillStyle = '#141a0f';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    // shrink long brand names so they stay between the side texts
    let size = 210;
    do {
      g.font = `900 ${size}px "Archivo", "Noto Sans Georgian", sans-serif`;
      g.fontStretch = 'condensed';
      size -= 10;
    } while (g.measureText(this.label.brand).width > 1100 && size > 80);
    g.fillText(this.label.brand, W / 2, 250);

    g.font = 'italic 64px "Instrument Serif", "Noto Serif Georgian", serif';
    g.fillStyle = accent;
    g.fillText(`ანანასი · ${this.flavor.name}`, W / 2, 330);

    g.font = '600 38px "Archivo", "Noto Sans Georgian", sans-serif';
    g.fillStyle = '#141a0f';
    g.textAlign = 'left';
    g.fillText(`${this.label.sizeMl} მლ`, 120, 200);
    g.textAlign = 'right';
    g.fillText('Kool-Aid ფხვნილით', W - 120, 200);

    this.labelTex.needsUpdate = true;
  }

  #buildLid() {
    this.lid = new THREE.Group();
    this.lidMat = new THREE.MeshStandardMaterial({ color: this.flavor.color, metalness: 0.55, roughness: 0.3 });
    const lid = new THREE.Mesh(knurledLid(), this.lidMat);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.885, 0.022, 12, 128),
      new THREE.MeshStandardMaterial({ color: '#f4ecd8', metalness: 0.2, roughness: 0.4 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.15;
    this.lid.add(lid, rim);
    this.lid.position.y = LID_Y;
    this.body.add(this.lid);
  }

  #buildContents(count) {
    // Syrup / packed core so the jar never looks see-through when full.
    this.coreMat = new THREE.MeshPhysicalMaterial({ color: '#ffc933', roughness: 0.25, clearcoat: 1 });
    this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 1, 48), this.coreMat);
    this.core.geometry.translate(0, 0.5, 0); // pivot at the bottom so it can "fill up"
    this.core.position.y = BOTTOM + 0.06;
    this.body.add(this.core);

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.48,
      sheen: 0.6,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color('#ffffff').multiplyScalar(0.25),
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    });
    this.chunks = new THREE.InstancedMesh(chunkGeometry(), mat, count);
    this.chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const maxR = (y) => (y > 0.72 ? 0.66 : y < BOTTOM + 0.16 ? 0.74 : 0.82);
    const yMin = BOTTOM + 0.12;
    const yMax = 0.88;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const y = yMin + Math.random() * (yMax - yMin);
      const r = maxR(y) * (1 - 0.5 * Math.random() ** 2.2);
      const a = Math.random() * Math.PI * 2;
      const s = 0.85 + Math.random() * 0.45;
      const yellow = YELLOWS[(Math.random() * YELLOWS.length) | 0].clone();
      this.items.push({
        pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
        quat: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
        ),
        scale: new THREE.Vector3(s, s * (0.85 + Math.random() * 0.3), s),
        yellow,
        coatAmt: 0.8 + Math.random() * 0.2,
        lightJitter: (Math.random() - 0.5) * 0.16,
        // bottom chunks drop in first
        start: ((y - yMin) / (yMax - yMin)) * 0.78 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.body.add(this.chunks);
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._hsl = { h: 0, s: 0, l: 0 };
  }

  #buildPowder(count) {
    this.powderSeeds = Array.from({ length: count }, () => ({
      r: Math.sqrt(Math.random()) * 0.5,
      a: Math.random() * Math.PI * 2,
      o: Math.random(),
      s: 0.55 + Math.random() * 0.5,
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.powderMat = new THREE.PointsMaterial({
      size: 0.05,
      map: dotTexture(),
      color: this.flavor.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.powder = new THREE.Points(geo, this.powderMat);
    this.powder.frustumCulled = false;
    this.powder.renderOrder = 3;
    this.body.add(this.powder);
  }

  setFlavor(hex, name) {
    this.flavor.color.set(hex);
    this.flavor.name = name;
    this.drawLabel();
  }

  update(state, time) {
    const { lid, coat, fill, powder } = state;

    // lid lifts up and to the side
    this.lid.position.set(lid * 1.7, LID_Y + lid * 0.7, lid * 0.3);
    this.lid.rotation.set(lid * 0.3, 0, -lid * 0.9);

    // flavour-driven materials
    const fc = this.flavor.color;
    this.lidMat.color.copy(fc);
    this.powderMat.color.copy(fc);
    this.coreMat.color.copy(YELLOWS[2]).lerp(this._c.copy(fc).multiplyScalar(0.7), coat * 0.85);

    // chunk colours (only when something changed)
    const key = fc.getHex();
    if (Math.abs(coat - this._lastCoat) > 0.001 || key !== this._flavorKey) {
      fc.getHSL(this._hsl);
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        this._c.setHSL(this._hsl.h, this._hsl.s, Math.min(0.8, Math.max(0.12, this._hsl.l + it.lightJitter)));
        this._c.lerpColors(it.yellow, this._c, coat * it.coatAmt);
        this.chunks.setColorAt(i, this._c);
      }
      this.chunks.instanceColor.needsUpdate = true;
      this._lastCoat = coat;
      this._flavorKey = key;
    }

    // chunk transforms: dropping in on fill, bobbing while the lid is open
    const animating = lid > 0.001 || fill < 0.999;
    if (animating || Math.abs(fill - this._lastFill) > 0.0001) {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        const local = clamp01((fill - it.start) / 0.12);
        this._p.copy(it.pos);
        this._p.y += (1 - easeOutCubic(local)) * 2.6 + Math.sin(time * 3 + it.phase) * 0.012 * lid;
        const k = local <= 0 ? 0 : 0.35 + 0.65 * easeOutCubic(local);
        this._s.copy(it.scale).multiplyScalar(k);
        this._m.compose(this._p, it.quat, this._s);
        this.chunks.setMatrixAt(i, this._m);
      }
      this.chunks.instanceMatrix.needsUpdate = true;
      this._lastFill = fill;
    }

    // syrup level follows the fill
    const level = clamp01((fill - 0.05) / 0.9);
    this.core.scale.set(1, Math.max(0.0001, level * 1.95), 1);
    this.core.visible = level > 0.001;

    // powder stream
    this.powder.visible = powder > 0.01;
    if (this.powder.visible) {
      this.powderMat.opacity = Math.min(1, powder * 1.3);
      const arr = this.powder.geometry.attributes.position.array;
      for (let i = 0; i < this.powderSeeds.length; i++) {
        const sd = this.powderSeeds[i];
        const yN = (sd.o + time * sd.s * 0.45) % 1;
        const a = sd.a + time * 0.9 + yN * 2.5;
        const r = sd.r * (0.35 + 0.9 * yN);
        arr[i * 3] = Math.cos(a) * r;
        arr[i * 3 + 1] = 3.0 - yN * 2.25;
        arr[i * 3 + 2] = Math.sin(a) * r;
      }
      this.powder.geometry.attributes.position.needsUpdate = true;
    }
  }
}
