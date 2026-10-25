import { $, esc } from './core.js';

// Single-series column chart (one measure over days). One colour from the theme
// (--chart, validated for both themes), 4px rounded caps, square at the baseline,
// hairline grid, sparse x labels. Every column is its own hover/focus target, and
// a table view carries every value without hovering.

const NS = 'http://www.w3.org/2000/svg';

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

const compact = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(Math.round(n * 100) / 100));

export function columnChart(el, { data, format = String, height = 220, label }) {
  el.classList.add('chart');
  el.innerHTML = '';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  el.append(svg);
  const tip = $('#tooltip');

  function draw() {
    const width = Math.max(280, el.clientWidth);
    const pad = { top: 10, right: 6, bottom: 26, left: 40 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;
    const max = niceMax(Math.max(...data.map((d) => d.value), 0));
    const band = w / data.length;
    const barW = Math.max(2, Math.min(24, band - 2)); // ≤24px, 2px air between neighbours
    const y = (v) => pad.top + h - (v / max) * h;
    const ticks = [0, max / 2, max];
    const every = Math.ceil(data.length / Math.max(2, Math.floor(w / 64)));

    let out = `<g class="grid">${ticks.map((t) => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>`;
    out += `<g class="axis">${ticks.map((t) => `<text x="${pad.left - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('')}</g>`;
    out += '<g>';
    data.forEach((d, i) => {
      const cx = pad.left + band * i + band / 2;
      const x = cx - barW / 2;
      const top = y(d.value);
      const base = pad.top + h;
      const r = Math.min(4, barW / 2, base - top);
      const path =
        d.value > 0
          ? `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${base}Z`
          : '';
      out += `<g class="col" data-i="${i}">
        <path class="bar" d="${path}"/>
        <rect class="hit" x="${pad.left + band * i}" y="${pad.top}" width="${band}" height="${h}" tabindex="0"
              aria-label="${esc(d.label)}: ${esc(format(d.value))}"/>
      </g>`;
      // sparse x labels; the last day always, and no label crowding it
      const last = i === data.length - 1;
      if (last || (i % every === 0 && data.length - 1 - i >= every * 0.75)) {
        out += `<g class="axis"><text x="${cx}" y="${height - 6}" text-anchor="middle">${esc(d.short ?? d.label)}</text></g>`;
      }
    });
    out += '</g>';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('height', height);
    svg.innerHTML = out;
  }

  function show(col) {
    const d = data[Number(col.dataset.i)];
    el.querySelectorAll('.col.is-on').forEach((c) => c.classList.remove('is-on'));
    col.classList.add('is-on');
    const r = col.querySelector('.hit').getBoundingClientRect();
    // value leads, label follows; text set with textContent (labels are data)
    tip.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = format(d.value);
    const span = document.createElement('span');
    span.textContent = d.label;
    tip.append(strong, span);
    tip.hidden = false;
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.top = `${Math.max(r.top + 8, 60)}px`;
  }
  const hide = () => {
    tip.hidden = true;
    el.querySelectorAll('.col.is-on').forEach((c) => c.classList.remove('is-on'));
  };

  svg.addEventListener('pointerover', (e) => {
    const col = e.target.closest('.col');
    if (col) show(col);
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focusin', (e) => {
    const col = e.target.closest('.col');
    if (col) show(col);
  });
  svg.addEventListener('focusout', hide);

  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(el);
  return () => {
    ro.disconnect();
    hide();
  };
}

// A collapsible table with the same numbers — the chart's accessible twin.
export function tableToggle(btn, host, { columns, rows }) {
  let open = false;
  btn.onclick = () => {
    open = !open;
    btn.setAttribute('aria-expanded', String(open));
    host.innerHTML = open
      ? `<div class="chart-table"><table><thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
         <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '';
  };
}

// Horizontal bars for a ranked list (flavours). One measure, one colour; identity
// rides as a coloured dot beside the label text, never as text colour.
export function hbars(items, { value, format, label, color }) {
  const max = Math.max(...items.map(value), 1);
  return `<div class="hbars">${items
    .map(
      (it) => `<div>
        <div class="hbar__top"><span class="dot" style="--c:${esc(color(it))}"></span>${esc(label(it))}
          <span class="val">${esc(format(it))}</span></div>
        <div class="hbar__track"><div class="hbar__fill" style="width:${(value(it) / max) * 100}%"></div></div>
      </div>`
    )
    .join('')}</div>`;
}
