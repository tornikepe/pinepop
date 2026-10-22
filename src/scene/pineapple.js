import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A whole pineapple, built entirely from code: a lathed body with spiral
// diamond "eyes" pushed out of the surface, plus a crown of curled leaves.

const BODY_H = 1.6;
const BODY_R = 0.6;

const C = {
  scaleCenter: new THREE.Color('#f6b737'),
  scaleMid: new THREE.Color('#d9852a'),
  scaleEdge: new THREE.Color('#4a3510'),
  eye: new THREE.Color('#7a4e18'),
  green: new THREE.Color('#6d7a2a'),
  leafBase: new THREE.Color('#244d24'),
  leafTip: new THREE.Color('#86b46a'),
  leafRidge: new THREE.Color('#3f7a3a'),
};

function bodyGeometry() {
  const pts = [];
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = BODY_R * Math.pow(Math.sin(Math.PI * (0.03 + 0.94 * t)), 0.5) * (1 - 0.1 * t);
    pts.push(new THREE.Vector2(Math.max(r, 0.002), (t - 0.5) * BODY_H));
  }
  const geo = new THREE.LatheGeometry(pts, 144);
  geo.computeVertexNormals();

  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();

  // NU must be an integer so the pattern wraps seamlessly around the lathe.
  const NU = 13;
  const NV = 8.5;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const s = u * NU + v * NV;
    const t = u * NU - v * NV;
    const fs = s - Math.floor(s) - 0.5;
    const ft = t - Math.floor(t) - 0.5;
    const d = Math.max(Math.abs(fs), Math.abs(ft)) * 2; // 0 at scale centre → 1 at seam
    const bump = Math.pow(1 - d, 0.7);
    const pole = Math.pow(Math.sin(Math.PI * v), 0.6);
    const disp = bump * 0.055 * pole;

    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * disp,
      pos.getY(i) + nor.getY(i) * disp,
      pos.getZ(i) + nor.getZ(i) * disp
    );

    if (d > 0.82) col.copy(C.scaleEdge);
    else col.copy(C.scaleMid).lerp(C.scaleCenter, Math.min(1, (0.82 - d) * 2.2));
    if (d < 0.14) col.lerp(C.eye, 0.75);
    // greener near the crown and the base
    const greenAmt = Math.max(0, (v - 0.72) * 2.4) + Math.max(0, (0.12 - v) * 4);
    col.lerp(C.green, Math.min(0.65, greenAmt));
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// One leaf: a tapered ribbon with a V-shaped crease that curls outward (+Z).
function leafGeometry(length, width, curl) {
  const segs = 12;
  const positions = [];
  const colors = [];
  const indices = [];
  const p = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = curl * t * t;
    dir.set(0, Math.cos(a), Math.sin(a));
    nrm.set(0, -Math.sin(a), Math.cos(a));
    if (i > 0) p.addScaledVector(dir, length / segs);
    const w = width * Math.pow(1 - t, 0.9) * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.6)));
    const crease = -w * 0.45;
    positions.push(p.x - w, p.y, p.z); // left
    positions.push(p.x + nrm.x * crease, p.y + nrm.y * crease, p.z + nrm.z * crease); // ridge
    positions.push(p.x + w, p.y, p.z); // right

    col.copy(C.leafBase).lerp(C.leafTip, Math.pow(t, 0.8));
    colors.push(col.r, col.g, col.b);
    col.lerp(C.leafRidge, 0.35);
    colors.push(col.r, col.g, col.b);
    col.copy(C.leafBase).lerp(C.leafTip, Math.pow(t, 0.8));
    colors.push(col.r, col.g, col.b);

    if (i < segs) {
      const L = i * 3;
      const N = L + 3;
      indices.push(L, L + 1, N, L + 1, N + 1, N, L + 1, L + 2, N + 1, L + 2, N + 2, N + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

function crownGeometry() {
  const rings = [
    { n: 5, len: 0.95, w: 0.07, lean: 0.06, curl: 0.35, off: 0.02 },
    { n: 8, len: 0.85, w: 0.08, lean: 0.32, curl: 0.6, off: 0.07 },
    { n: 10, len: 0.66, w: 0.085, lean: 0.7, curl: 0.95, off: 0.13 },
    { n: 13, len: 0.46, w: 0.085, lean: 1.05, curl: 1.2, off: 0.19 },
  ];
  const leaves = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  rings.forEach((ring, r) => {
    for (let i = 0; i < ring.n; i++) {
      const theta = (i / ring.n) * Math.PI * 2 + r * 0.6 + (rand() - 0.5) * 0.25;
      const g = leafGeometry(ring.len * (0.85 + rand() * 0.3), ring.w, ring.curl * (0.85 + rand() * 0.3));
      g.rotateX(ring.lean + (rand() - 0.5) * 0.15);
      g.rotateY(theta);
      g.translate(Math.sin(theta) * ring.off, BODY_H / 2 - 0.08, Math.cos(theta) * ring.off);
      leaves.push(g);
    }
  });
  const geo = mergeGeometries(leaves);
  geo.computeVertexNormals();
  return geo;
}

export function createPineappleAssets() {
  return {
    bodyGeo: bodyGeometry(),
    crownGeo: crownGeometry(),
    bodyMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }),
    crownMat: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  };
}

export function createPineapple(assets) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(assets.bodyGeo, assets.bodyMat));
  group.add(new THREE.Mesh(assets.crownGeo, assets.crownMat));
  return group;
}
