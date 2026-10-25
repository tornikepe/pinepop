import { api, esc, money, num, date, shortDay, statusBadge, emptyState } from '../core.js';
import { columnChart, hbars, tableToggle } from '../charts.js';

const PERIODS = [
  [7, '7 დღე'],
  [30, '30 დღე'],
  [90, '90 დღე'],
];

let days = 30;

function delta(cur, prev, { invert = false, percent = false } = {}) {
  if (prev == null || cur == null) return '<span class="muted">წინა პერიოდთან შედარება არ არის</span>';
  if (prev === 0) return cur > 0 ? '<span class="delta-up">ახალი</span> <span class="muted">წინა პერიოდში 0</span>' : '<span class="muted">უცვლელი</span>';
  const change = percent ? (cur - prev) * 100 : ((cur - prev) / prev) * 100;
  const up = change >= 0;
  const good = invert ? !up : up;
  const text = `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(percent ? 1 : 0)}${percent ? ' პ.პ.' : '%'}`;
  return `<span class="${good ? 'delta-up' : 'delta-down'}">${text}</span> <span class="muted">წინა ${days} დღესთან</span>`;
}

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

export async function render(view) {
  const cleanups = [];
  view.innerHTML = `
    <div class="page-head">
      <div><h1>დაფა</h1><p>როგორ მიდის მაღაზია — შემოსავალი, შეკვეთები, ვიზიტორები და მარაგი.</p></div>
      <div class="seg" role="group" aria-label="პერიოდი">${PERIODS.map(
        ([d, l]) => `<button type="button" data-days="${d}" aria-pressed="${d === days}">${l}</button>`
      ).join('')}</div>
    </div>
    <div id="dash"></div>`;

  async function load() {
    const host = view.querySelector('#dash');
    host.style.opacity = host.childElementCount ? '0.5' : '';
    const d = await api(`/api/admin/dashboard?days=${days}`);
    cleanups.splice(0).forEach((fn) => fn());
    const openTotal = (d.open.new || 0) + (d.open.confirmed || 0) + (d.open.delivering || 0);

    host.innerHTML = `
      <section class="hero">
        <div>
          <div class="hero__label">დღეს</div>
          <div class="hero__value">${money(d.today.revenue)}</div>
          <div class="hero__label" style="margin-top:6px">${num(d.today.orders)} შეკვეთა</div>
        </div>
        <div class="hero__alerts">
          ${d.open.new ? `<a class="pill-link" href="#/orders?status=new"><b>${d.open.new}</b> ახალი შეკვეთა</a>` : ''}
          ${openTotal ? `<a class="pill-link" href="#/orders"><b>${openTotal}</b> მიმდინარე</a>` : ''}
          ${d.pendingReviews ? `<a class="pill-link" href="#/reviews"><b>${d.pendingReviews}</b> შეფასება მოდერაციაზე</a>` : ''}
          ${d.lowStock.length ? `<a class="pill-link" href="#/products"><b>${d.lowStock.length}</b> გემოს მარაგი იწურება</a>` : ''}
          ${!openTotal && !d.pendingReviews && !d.lowStock.length ? '<span class="hero__label">ყველაფერი მოწესრიგებულია ✓</span>' : ''}
        </div>
      </section>

      <section class="kpis" aria-label="მაჩვენებლები ${days} დღისთვის">
        ${[
          ['შემოსავალი', money(d.revenue.value), delta(d.revenue.value, d.revenue.prev)],
          ['შეკვეთები', num(d.orders.value), delta(d.orders.value, d.orders.prev)],
          ['მოგება', money(d.profit.value), delta(d.profit.value, d.profit.prev)],
          ['გაყიდული ქილა', num(d.jars.value), delta(d.jars.value, d.jars.prev)],
          ['ვიზიტორები', num(d.visitors.value), delta(d.visitors.value, d.visitors.prev)],
          ['კონვერსია', pct(d.conversion.value), delta(d.conversion.value, d.conversion.prev, { percent: true })],
        ]
          .map(
            ([label, value, dl]) => `<div class="card">
              <div class="kpi__label">${label}</div><div class="kpi__value">${value}</div><div class="kpi__delta">${dl}</div></div>`
          )
          .join('')}
      </section>
      <p class="muted small" style="margin:8px 2px 18px">მოგება = გაყიდვა ფასდაკლების შემდეგ − თვითღირებულება (გემოებში მითითებული). საშუალო შეკვეთა: ${money(d.aov.value)}.</p>

      <section class="grid-2" style="margin-bottom:14px">
        <div class="card">
          <div class="card__head"><h2>შემოსავალი დღეების მიხედვით</h2>
            <button class="btn btn--sm btn--ghost" data-table="rev" aria-expanded="false">ცხრილი</button></div>
          <div data-chart="rev"></div><div data-table-host="rev"></div>
        </div>
        <div class="card">
          <div class="card__head"><h2>ვიზიტორები დღეების მიხედვით</h2>
            <button class="btn btn--sm btn--ghost" data-table="vis" aria-expanded="false">ცხრილი</button></div>
          <div data-chart="vis"></div><div data-table-host="vis"></div>
        </div>
      </section>

      <section class="grid-3">
        <div class="card">
          <div class="card__head"><h2>გემოები — გაყიდული ქილა</h2></div>
          ${
            d.flavors.length
              ? hbars(d.flavors, {
                  value: (f) => f.qty,
                  label: (f) => f.flavor,
                  color: (f) => f.color,
                  format: (f) => `${num(f.qty)} · ${money(f.revenue)}`,
                })
              : emptyState('ჯერ არაფერი გაყიდულა', 'ამ პერიოდში')
          }
        </div>
        <div class="card">
          <div class="card__head"><h2>მარაგი იწურება</h2><a class="btn btn--sm btn--ghost" href="#/products">გემოები →</a></div>
          ${
            d.lowStock.length
              ? `<div class="list">${d.lowStock
                  .map(
                    (p) => `<a class="list__item" href="#/products"><span class="dot" style="--c:${esc(p.color)}"></span>
                      <span class="list__main"><b>${esc(p.flavor)}</b><small>გაფრთხილება ${p.lowStock}-ზე</small></span>
                      <span class="badge ${p.stock === 0 ? 'badge--bad' : 'badge--warn'}">${p.stock} ქილა</span></a>`
                  )
                  .join('')}</div>`
              : emptyState('ყველა გემო საკმარისია', 'გაფრთხილების ზღვარს ზემოთაა')
          }
        </div>
        <div class="card">
          <div class="card__head"><h2>ბოლო შეკვეთები</h2><a class="btn btn--sm btn--ghost" href="#/orders">ყველა →</a></div>
          ${
            d.recent.length
              ? `<div class="list">${d.recent
                  .map(
                    (o) => `<a class="list__item" href="#/orders/${o.id}">
                      <span class="list__main"><b class="code">${esc(o.code)}</b> · ${esc(o.name)}<small>${date(o.at)} · ${o.jars} ქილა</small></span>
                      <span style="text-align:right"><b class="num">${money(o.total)}</b><br>${statusBadge(o.status)}</span></a>`
                  )
                  .join('')}</div>`
              : emptyState('შეკვეთები ჯერ არ არის', 'როგორც კი ვინმე იყიდის, აქ გამოჩნდება')
          }
        </div>
      </section>`;
    host.style.opacity = '';

    const rev = d.series.map((s) => ({ label: shortDay(s.day), value: s.revenue }));
    const vis = d.series.map((s) => ({ label: shortDay(s.day), value: s.visitors }));
    cleanups.push(columnChart(host.querySelector('[data-chart="rev"]'), { data: rev, format: money, label: `შემოსავალი ბოლო ${days} დღეში` }));
    cleanups.push(columnChart(host.querySelector('[data-chart="vis"]'), { data: vis, format: (v) => `${num(v)} ვიზიტორი`, label: `ვიზიტორები ბოლო ${days} დღეში` }));
    tableToggle(host.querySelector('[data-table="rev"]'), host.querySelector('[data-table-host="rev"]'), {
      columns: ['დღე', 'შემოსავალი', 'შეკვეთები'],
      rows: d.series.map((s) => [shortDay(s.day), money(s.revenue), s.orders]).reverse(),
    });
    tableToggle(host.querySelector('[data-table="vis"]'), host.querySelector('[data-table-host="vis"]'), {
      columns: ['დღე', 'ვიზიტორები', 'შეკვეთები'],
      rows: d.series.map((s) => [shortDay(s.day), s.visitors, s.orders]).reverse(),
    });
  }

  view.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-days]');
    if (!b) return;
    days = Number(b.dataset.days);
    view.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    load();
  });

  await load();
  return () => cleanups.forEach((fn) => fn());
}
