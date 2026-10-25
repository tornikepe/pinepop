import * as THREE from 'three';

// A dark photo studio with a few bright softboxes, baked into an environment map.
// Glass only looks like glass when it reflects shaped lights against darkness:
// the tall boxes give the jar its vertical highlight streaks, the warm one a rim.
export function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color('#0b0e08');

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(24, 14, 24),
    new THREE.MeshBasicMaterial({ color: '#151a10', side: THREE.BackSide })
  );
  env.add(room);

  const softbox = (w, h, color, intensity, x, y, z) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };

  softbox(2.4, 10, '#ffffff', 7, -6.5, 1, 4); // key: tall strip front-left
  softbox(1.1, 10, '#fff2d8', 5, 6.5, 0.5, 3); // fill: thin strip front-right
  softbox(9, 2.2, '#ffffff', 2.5, 0, 7, 1); // top
  softbox(4, 7, '#ffd23f', 2.2, -4, 0, -8); // warm back-left rim (pineapple yellow)
  softbox(4, 7, '#ff8a5c', 1.4, 5, -1, -7); // coral back-right rim

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  env.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return texture;
}

// Soft round light texture for the glow behind the jar.
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
