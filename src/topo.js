// Topographic contour lines (marching squares over smooth value noise),
// drawn once to a fixed canvas and drifted slightly with scroll.

function makeNoise(seed) {
  const size = 256;
  const perm = new Uint8Array(size * 2);
  const vals = new Float32Array(size);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < size; i++) perm[i + size] = perm[i];
  const smooth = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * tx;
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * tx;
    return a + (b - a) * ty;
  };
}

export function initTopo(canvas) {
  const noise = makeNoise(20261021);
  const field = (x, y) =>
    noise(x * 0.004, y * 0.004) * 0.6 + noise(x * 0.009 + 40, y * 0.009) * 0.3 + noise(x * 0.02, y * 0.02 + 90) * 0.1;

  let lastW = 0;
  let height = 0;

  function draw() {
    const w = window.innerWidth;
    if (w === lastW) return;
    lastW = w;
    const dpr = Math.min(window.devicePixelRatio, 2);
    height = Math.round(window.innerHeight * 1.6);
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);

    const cell = 12;
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(height / cell) + 1;
    const grid = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) grid[j * cols + i] = field(i * cell, j * cell);

    const levels = 16;
    g.lineWidth = 1;
    for (let l = 1; l < levels; l++) {
      const iso = 0.18 + (l / levels) * 0.62;
      g.strokeStyle = l % 4 === 0 ? 'rgba(244,236,216,0.11)' : 'rgba(244,236,216,0.05)';
      g.beginPath();
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = grid[j * cols + i];
          const b = grid[j * cols + i + 1];
          const c = grid[(j + 1) * cols + i + 1];
          const d = grid[(j + 1) * cols + i];
          const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x = i * cell;
          const y = j * cell;
          const lerp = (p, q) => (iso - p) / (q - p);
          const top = [x + cell * lerp(a, b), y];
          const right = [x + cell, y + cell * lerp(b, c)];
          const bottom = [x + cell * lerp(d, c), y + cell];
          const left = [x, y + cell * lerp(a, d)];
          const seg = (p, q) => {
            g.moveTo(p[0], p[1]);
            g.lineTo(q[0], q[1]);
          };
          switch (idx) {
            case 1: case 14: seg(left, bottom); break;
            case 2: case 13: seg(bottom, right); break;
            case 3: case 12: seg(left, right); break;
            case 4: case 11: seg(top, right); break;
            case 5: seg(left, top); seg(bottom, right); break;
            case 6: case 9: seg(top, bottom); break;
            case 7: case 8: seg(left, top); break;
            case 10: seg(top, right); seg(left, bottom); break;
          }
        }
      }
      g.stroke();
    }
  }

  draw();
  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(draw, 200);
  });

  // drift: the texture is 1.6 viewports tall, move it through 0.6 of a viewport over the page
  return (scrollY, maxScroll) => {
    const travel = height - window.innerHeight;
    const p = maxScroll > 0 ? scrollY / maxScroll : 0;
    canvas.style.transform = `translate3d(0, ${-p * travel}px, 0)`;
  };
}
