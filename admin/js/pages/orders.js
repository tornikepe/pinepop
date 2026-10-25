import {
  api, esc, money, date, prettyPhone, statusBadge, STATUS, emptyState, pager, debounce, run, openModal, toast, icon,
} from '../core.js';

// Next step for an order, as the one obvious button.
const NEXT = {
  new: ['confirmed', 'დადასტურება'],
  confirmed: ['delivering', 'გზაშია'],
  delivering: ['delivered', 'მიწოდებულია'],
};

const FILTERS = [
  ['', 'ყველა'],
  ['open', 'მიმდინარე'],
  ['new', STATUS.new],
  ['confirmed', STATUS.confirmed],
  ['delivering', STATUS.delivering],
  ['delivered', STATUS.delivered],
  ['cancelled', STATUS.cancelled],
];

export async function render(view, ctx) {
  const [id, sub] = ctx.params;
  if (id && sub === 'print') return renderInvoice(view, Number(id));
  if (id) return renderOrder(view, Number(id), ctx);
  return renderList(view, ctx);
}

// ---------- list ----------

async function renderList(view, { query, go }) {
  const state = { status: query.status || '', q: '', from: '', to: '', page: 1 };
  view.innerHTML = `
    <div class="page-head">
      <div><h1>შეკვეთები</h1><p>ყველა შეკვეთა, მისი სტატუსი და ისტორია. დააჭირე რიგს დეტალებისთვის.</p></div>
      <a class="btn" id="csv" href="#">${icon('download')} CSV ექსპორტი</a>
    </div>
    <div class="toolbar">
      <div class="seg" id="status" role="group" aria-label="სტატუსი"></div>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search')}<input type="search" id="q" placeholder="კოდი, სახელი, ტელეფონი, მისამართი" aria-label="ძებნა"></label>
      <input type="date" id="from" aria-label="თარიღიდან"> <span class="muted">—</span>
      <input type="date" id="to" aria-label="თარიღამდე">
    </div>
    <div class="card card--flush"><div class="table-wrap"><table>
      <thead><tr><th>კოდი</th><th>თარიღი</th><th>მომხმარებელი</th><th>შეკვეთა</th><th class="right">ჯამი</th><th>სტატუსი</th></tr></thead>
      <tbody id="rows"></tbody></table></div><div id="pager"></div></div>`;

  const qs = () => {
    const p = new URLSearchParams();
    for (const k of ['status', 'q', 'from', 'to']) if (state[k]) p.set(k, state[k]);
    return p;
  };

  async function load() {
    const p = qs();
    p.set('page', state.page);
    const d = await api(`/api/admin/orders?${p}`);
    const all = Object.values(d.counts).reduce((a, b) => a + b, 0);
    const open = (d.counts.new || 0) + (d.counts.confirmed || 0) + (d.counts.delivering || 0);
    view.querySelector('#status').innerHTML = FILTERS.map(([v, l]) => {
      const n = v === '' ? all : v === 'open' ? open : d.counts[v] || 0;
      return `<button type="button" data-v="${v}" aria-pressed="${state.status === v}">${l}<span class="count">${n}</span></button>`;
    }).join('');
    view.querySelector('#rows').innerHTML = d.orders.length
      ? d.orders
          .map(
            (o) => `<tr class="clickable" data-id="${o.id}" tabindex="0">
              <td><span class="code">${esc(o.code)}</span></td>
              <td>${date(o.createdAt)}</td>
              <td>${esc(o.name)}<small>${esc(prettyPhone(o.phone))} · ${esc(o.city)}</small></td>
              <td>${esc(o.items || '—')}<small>${o.jars} ქილა${o.couponCode ? ` · ${esc(o.couponCode)}` : ''}</small></td>
              <td class="right num"><b>${money(o.total)}</b></td>
              <td>${statusBadge(o.status)}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="6">${emptyState('შეკვეთები ვერ მოიძებნა', state.q || state.status ? 'სცადე სხვა ფილტრი' : 'როგორც კი ვინმე იყიდის, აქ გამოჩნდება')}</td></tr>`;
    const pg = view.querySelector('#pager');
    pg.replaceChildren(pager(d, (page) => ((state.page = page), load())));
    view.querySelector('#csv').href = `/api/admin/orders.csv?${qs()}`;
  }

  view.querySelector('#status').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    state.status = b.dataset.v;
    state.page = 1;
    history.replaceState(null, '', `#/orders${state.status ? `?status=${state.status}` : ''}`);
    load();
  });
  view.querySelector('#q').addEventListener('input', debounce((e) => ((state.q = e.target.value.trim()), (state.page = 1), load())));
  for (const k of ['from', 'to']) view.querySelector(`#${k}`).addEventListener('change', (e) => ((state[k] = e.target.value), (state.page = 1), load()));
  const open = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && (e.type === 'click' || e.key === 'Enter')) go(`orders/${tr.dataset.id}`);
  };
  view.querySelector('#rows').addEventListener('click', open);
  view.querySelector('#rows').addEventListener('keydown', open);

  await load();
}

// ---------- one order ----------

async function renderOrder(view, id, { can, go, refreshBadges }) {
  const write = can('orders:write');

  async function load() {
    const { order: o, items, events, review, customer } = await api(`/api/admin/orders/${id}`);
    const cost = items.reduce((s, i) => s + i.cost * i.qty, 0);
    const profit = o.subtotal - o.discount - cost;
    const next = NEXT[o.status];
    const wa = o.phone.replace('+', '');

    view.innerHTML = `
      <a class="back" href="#/orders">${icon('back')} შეკვეთები</a>
      <div class="page-head">
        <div><h1><span class="code">${esc(o.code)}</span> ${statusBadge(o.status)}</h1>
          <p>${date(o.createdAt)} · ${esc(o.city)}</p></div>
        <div class="row">
          <a class="btn" href="#/orders/${o.id}/print">${icon('printer')} ზედნადები</a>
          ${write && o.status !== 'cancelled' && o.status !== 'delivered' ? '<button class="btn btn--danger" data-status="cancelled">გაუქმება</button>' : ''}
          ${write && o.status === 'cancelled' ? '<button class="btn" data-status="new">აღდგენა</button>' : ''}
          ${write && next ? `<button class="btn btn--primary" data-status="${next[0]}">${next[1]} →</button>` : ''}
        </div>
      </div>

      <div class="split">
        <div class="stack">
          <div class="card card--flush">
            <div class="card__head"><h2>შეკვეთა</h2></div>
            <div class="table-wrap"><table>
              <thead><tr><th>გემო</th><th class="right">რაოდ.</th><th class="right">ფასი</th><th class="right">ჯამი</th>${can('staff') ? '<th class="right">მოგება</th>' : ''}</tr></thead>
              <tbody>${items
                .map(
                  (i) => `<tr><td><span class="dot" style="--c:${esc(i.color)}"></span> ${esc(i.flavor)}</td>
                    <td class="right num">${i.qty}</td><td class="right num">${money(i.price)}</td><td class="right num">${money(i.price * i.qty)}</td>
                    ${can('staff') ? `<td class="right num">${money((i.price - i.cost) * i.qty)}</td>` : ''}</tr>`
                )
                .join('')}</tbody></table></div>
            <div style="padding:16px 20px">
              <dl class="kv">
                <dt>პროდუქცია</dt><dd>${money(o.subtotal)}</dd>
                ${o.discount ? `<dt>ფასდაკლება${o.couponCode ? ` (${esc(o.couponCode)})` : ''}</dt><dd>−${money(o.discount)}</dd>` : ''}
                <dt>მიწოდება</dt><dd>${o.shipping ? money(o.shipping) : 'უფასო'}</dd>
                <dt class="total">სულ</dt><dd class="total">${money(o.total)}</dd>
                ${can('staff') ? `<dt>მოგება</dt><dd>${money(profit)}${cost === 0 ? ' <span class="muted small">(თვითღირებულება 0)</span>' : ''}</dd>` : ''}
              </dl>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><h2>ისტორია</h2></div>
            <ol class="timeline">${events
              .map(
                (e, i) => `<li class="${i === 0 || e.status !== events[i - 1].status ? 'is-status' : ''}">
                  <b>${i === 0 || e.status !== events[i - 1].status ? esc(e.label) : 'ჩანაწერი'}</b>
                  <small>${date(e.at)} · ${esc(e.actor === 'customer' ? 'მომხმარებელი' : e.actor)}</small>
                  ${e.note ? `<p>${esc(e.note)}</p>` : ''}</li>`
              )
              .join('')}</ol>
            ${
              write
                ? `<form class="row" id="noteForm" style="margin-top:4px">
                    <input name="note" placeholder="ჩანაწერი (მხოლოდ თანამშრომლებისთვის)" maxlength="500" style="flex:1" aria-label="ჩანაწერი">
                    <button class="btn" type="submit">დამატება</button></form>`
                : ''
            }
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card__head"><h2>მომხმარებელი</h2>${customer ? `<a class="btn btn--sm btn--ghost" href="#/customers/${customer.id}">პროფილი →</a>` : ''}</div>
            <p style="margin:0 0 6px;font-size:17px"><b>${esc(o.name)}</b></p>
            <div class="row" style="margin-bottom:12px">
              <a class="btn btn--sm" href="tel:${esc(o.phone)}">${icon('phone')} ${esc(prettyPhone(o.phone))}</a>
              <a class="btn btn--sm" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>
            </div>
            <dl class="kv">
              <dt>ქალაქი</dt><dd>${esc(o.city)}</dd>
              <dt>მისამართი</dt><dd>${esc(o.address)}</dd>
              ${customer ? `<dt>შეკვეთები</dt><dd>${customer.orders}</dd><dt>სულ დახარჯა</dt><dd>${money(customer.spent)}</dd>` : ''}
            </dl>
            ${o.note ? `<p class="note" style="margin:14px 0 0">💬 ${esc(o.note)}</p>` : ''}
            ${customer?.note ? `<p class="muted small" style="margin:12px 0 0">შენიშვნა მომხმარებელზე: ${esc(customer.note)}</p>` : ''}
          </div>
          ${
            review
              ? `<div class="card"><div class="card__head"><h2>შეფასება</h2><a class="btn btn--sm btn--ghost" href="#/reviews">ყველა →</a></div>
                  <div>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} <span class="badge st-${esc(review.status)}">${review.status === 'published' ? 'გამოქვეყნებული' : review.status === 'hidden' ? 'დამალული' : 'მოლოდინში'}</span></div>
                  <p class="review__body" style="margin-top:8px">${esc(review.body)}</p></div>`
              : ''
          }
        </div>
      </div>`;

    view.querySelectorAll('[data-status]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const status = btn.dataset.status;
        let note = '';
        if (status === 'cancelled') {
          const r = await openModal({
            title: 'შეკვეთის გაუქმება',
            body: `<p style="margin:0">ქილები მარაგში დაბრუნდება${o.couponCode ? ', პრომოკოდის გამოყენებაც გაუქმდება' : ''}.</p>
              <label class="field"><span>მიზეზი <small>(არასავალდებულო)</small></span><input name="note" maxlength="300"></label>`,
            actions: [
              { label: 'არა', value: null },
              { label: 'გაუქმება', kind: 'danger', value: 'go' },
            ],
            onAction: (_v, d) => {
              note = d.querySelector('[name=note]').value;
            },
          });
          if (!r) return;
        }
        await run(btn, async () => {
          await api(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: { status, note } });
          toast(`სტატუსი: ${STATUS[status]}`);
          await load();
          refreshBadges();
        });
      })
    );
    view.querySelector('#noteForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.target.elements.note;
      if (!input.value.trim()) return;
      await run(e.submitter, async () => {
        await api(`/api/admin/orders/${id}/notes`, { method: 'POST', body: { note: input.value } });
        await load();
      });
    });
  }

  try {
    await load();
  } catch (err) {
    if (err.status === 404) go('orders');
    throw err;
  }
}

// ---------- invoice ----------

async function renderInvoice(view, id) {
  const [{ order: o, items }, site] = await Promise.all([api(`/api/admin/orders/${id}`), api('/api/site')]);
  const s = site.settings;
  view.innerHTML = `
    <div class="row no-print" style="margin-bottom:16px">
      <a class="back" href="#/orders/${id}" style="margin:0">${icon('back')} შეკვეთა</a><span class="spacer"></span>
      <button class="btn btn--primary" id="print">${icon('printer')} ბეჭდვა</button>
    </div>
    <article class="invoice">
      <div class="row row--between" style="align-items:flex-start;margin-bottom:28px">
        <div><div class="brand" style="font-size:40px;color:#111">${esc(s.brandBold)}<em>${esc(s.brandItalic)}</em></div>
          <div style="color:#555;margin-top:6px">${s.phone ? esc(prettyPhone(s.phone)) : ''}${s.email ? ` · ${esc(s.email)}` : ''}</div></div>
        <div style="text-align:right"><div style="font-size:13px;color:#666">ზედნადები</div>
          <div class="code" style="font-size:24px">${esc(o.code)}</div><div style="color:#555">${date(o.createdAt)}</div></div>
      </div>
      <div style="margin-bottom:24px"><div style="font-size:13px;color:#666">მიმღები</div>
        <b>${esc(o.name)}</b><br>${esc(prettyPhone(o.phone))}<br>${esc(o.city)}, ${esc(o.address)}${o.note ? `<br><i>${esc(o.note)}</i>` : ''}</div>
      <table><thead><tr><th>გემო</th><th class="right">რაოდ.</th><th class="right">ფასი</th><th class="right">ჯამი</th></tr></thead>
        <tbody>${items
          .map((i) => `<tr><td>${esc(i.flavor)} · ${s.jarSizeMl} მლ</td><td class="right">${i.qty}</td><td class="right">${money(i.price)}</td><td class="right">${money(i.price * i.qty)}</td></tr>`)
          .join('')}</tbody></table>
      <dl class="kv" style="max-width:300px;margin:20px 0 0 auto">
        <dt>პროდუქცია</dt><dd>${money(o.subtotal)}</dd>
        ${o.discount ? `<dt>ფასდაკლება</dt><dd>−${money(o.discount)}</dd>` : ''}
        <dt>მიწოდება</dt><dd>${o.shipping ? money(o.shipping) : 'უფასო'}</dd>
        <dt class="total" style="color:#111">გადასახდელი</dt><dd class="total" style="color:#111">${money(o.total)}</dd>
      </dl>
      <p style="margin-top:36px;color:#666;font-size:13px">გადახდა მიტანისას. ინახება მაცივარში. მადლობა, რომ ${esc(s.brandBold + s.brandItalic)} აირჩიე 🍍</p>
    </article>`;
  view.querySelector('#print').onclick = () => window.print();
}
