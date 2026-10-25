import { api, esc, money, date, ago, prettyPhone, statusBadge, emptyState, pager, debounce, run, icon } from '../core.js';

export async function render(view, ctx) {
  const [id] = ctx.params;
  return id ? renderCustomer(view, Number(id), ctx) : renderList(view, ctx);
}

async function renderList(view, { go }) {
  const state = { q: '', sort: '', page: 1 };
  view.innerHTML = `
    <div class="page-head">
      <div><h1>მომხმარებლები</h1><p>ყველა, ვინც ერთხელ მაინც შეუკვეთა — ტელეფონის ნომრით გაერთიანებული.</p></div>
      <a class="btn" href="/api/admin/customers.csv">${icon('download')} CSV ექსპორტი</a>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search')}<input type="search" id="q" placeholder="სახელი ან ტელეფონი" aria-label="ძებნა"></label>
      <select id="sort" style="width:auto" aria-label="დალაგება">
        <option value="">ბოლო შეკვეთით</option><option value="spent">დახარჯული თანხით</option>
        <option value="orders">შეკვეთების რაოდენობით</option><option value="name">სახელით</option>
      </select>
    </div>
    <div class="card card--flush"><div class="table-wrap"><table>
      <thead><tr><th>მომხმარებელი</th><th class="right">შეკვეთები</th><th class="right">დახარჯა</th><th>ბოლო შეკვეთა</th><th>შენიშვნა</th></tr></thead>
      <tbody id="rows"></tbody></table></div><div id="pager"></div></div>`;

  async function load() {
    const p = new URLSearchParams({ page: state.page });
    if (state.q) p.set('q', state.q);
    if (state.sort) p.set('sort', state.sort);
    const d = await api(`/api/admin/customers?${p}`);
    view.querySelector('#rows').innerHTML = d.customers.length
      ? d.customers
          .map(
            (c) => `<tr class="clickable" data-id="${c.id}" tabindex="0">
              <td><b>${esc(c.name)}</b><small>${esc(prettyPhone(c.phone))}</small></td>
              <td class="right num">${c.orders}</td><td class="right num">${money(c.spent)}</td>
              <td>${ago(c.lastOrderAt)}</td><td class="muted">${esc(c.note.slice(0, 60))}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="5">${emptyState('მომხმარებლები ვერ მოიძებნა', state.q ? 'სცადე სხვა ძებნა' : 'პირველი შეკვეთის შემდეგ აქ გამოჩნდებიან')}</td></tr>`;
    view.querySelector('#pager').replaceChildren(pager(d, (page) => ((state.page = page), load())));
  }

  view.querySelector('#q').addEventListener('input', debounce((e) => ((state.q = e.target.value.trim()), (state.page = 1), load())));
  view.querySelector('#sort').addEventListener('change', (e) => ((state.sort = e.target.value), (state.page = 1), load()));
  const open = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && (e.type === 'click' || e.key === 'Enter')) go(`customers/${tr.dataset.id}`);
  };
  view.querySelector('#rows').addEventListener('click', open);
  view.querySelector('#rows').addEventListener('keydown', open);
  await load();
}

async function renderCustomer(view, id, { can, go }) {
  const { customer: c, orders, flavors } = await api(`/api/admin/customers/${id}`);
  const avg = c.orders ? c.spent / Math.max(1, orders.filter((o) => o.status !== 'cancelled').length) : 0;
  view.innerHTML = `
    <a class="back" href="#/customers">${icon('back')} მომხმარებლები</a>
    <div class="page-head">
      <div><h1>${esc(c.name)}</h1><p>${esc(prettyPhone(c.phone))} · კლიენტია ${date(c.since, { time: false })}-დან</p></div>
      <div class="row">
        <a class="btn" href="tel:${esc(c.phone)}">${icon('phone')} დარეკვა</a>
        <a class="btn" href="https://wa.me/${esc(c.phone.replace('+', ''))}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
    </div>
    <section class="kpis" style="margin-bottom:14px">
      <div class="card"><div class="kpi__label">შეკვეთები</div><div class="kpi__value">${c.orders}</div></div>
      <div class="card"><div class="kpi__label">სულ დახარჯა</div><div class="kpi__value">${money(c.spent)}</div></div>
      <div class="card"><div class="kpi__label">საშუალო შეკვეთა</div><div class="kpi__value">${money(Math.round(avg * 100) / 100)}</div></div>
    </section>
    <div class="split">
      <div class="card card--flush">
        <div class="card__head"><h2>შეკვეთები</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>კოდი</th><th>თარიღი</th><th>შეკვეთა</th><th class="right">ჯამი</th><th>სტატუსი</th></tr></thead>
          <tbody>${orders
            .map(
              (o) => `<tr class="clickable" data-id="${o.id}" tabindex="0"><td class="code">${esc(o.code)}</td><td>${date(o.createdAt)}</td>
                <td>${esc(o.items || '—')}<small>${esc(o.address)}</small></td><td class="right num">${money(o.total)}</td><td>${statusBadge(o.status)}</td></tr>`
            )
            .join('')}</tbody></table></div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card__head"><h2>საყვარელი გემოები</h2></div>
          ${
            flavors.length
              ? `<div class="list">${flavors
                  .map((f) => `<div class="list__item"><span class="dot" style="--c:${esc(f.color)}"></span><span class="list__main">${esc(f.flavor)}</span><b class="num">${f.qty} ქილა</b></div>`)
                  .join('')}</div>`
              : emptyState('ჯერ არაფერი', '')
          }
        </div>
        <form class="card" id="noteForm">
          <div class="card__head"><h2>შენიშვნა</h2></div>
          <textarea name="note" maxlength="1000" placeholder="მაგ. ურჩევნია საღამოს მიტანა" ${can('customers:write') ? '' : 'disabled'} aria-label="შენიშვნა">${esc(c.note)}</textarea>
          <p class="muted small">მხოლოდ თანამშრომლები ხედავენ.</p>
          ${can('customers:write') ? '<button class="btn btn--primary" type="submit">შენახვა</button>' : ''}
        </form>
      </div>
    </div>`;

  view.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) go(`orders/${tr.dataset.id}`);
  });
  view.querySelector('#noteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.submitter, () => api(`/api/admin/customers/${id}`, { method: 'PATCH', body: { note: e.target.elements.note.value } }), 'შენიშვნა შენახულია');
  });
}
