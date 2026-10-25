import { api, esc, date, emptyState, pager } from '../core.js';

const ENTITIES = {
  '': 'ყველა',
  order: 'შეკვეთები',
  product: 'გემოები',
  stock: 'მარაგი',
  coupon: 'პრომოკოდები',
  review: 'შეფასებები',
  customer: 'მომხმარებლები',
  content: 'ტექსტები',
  faq: 'კითხვები',
  zone: 'მიწოდება',
  settings: 'პარამეტრები',
  staff: 'თანამშრომლები',
  account: 'ანგარიში',
  database: 'ბაზა',
};

const ACTIONS = {
  create: 'შექმნა',
  update: 'შეცვალა',
  delete: 'წაშალა',
  status: 'სტატუსი',
  restock: 'შეავსო მარაგი',
  adjust: 'მარაგის კორექცია',
  password: 'ახალი პაროლი',
  login: 'შევიდა',
  backup: 'სარეზერვო ასლი',
};

const show = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'კი';
  if (v === false) return 'არა';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
};

export async function render(view) {
  const state = { entity: '', page: 1 };
  view.innerHTML = `
    <div class="page-head"><div><h1>ცვლილებების ისტორია</h1><p>ვინ, რა და როდის შეცვალა — და რა იყო მანამდე.</p></div>
      <select id="entity" style="width:auto" aria-label="ფილტრი">${Object.entries(ENTITIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="card card--flush"><div class="table-wrap"><table>
      <thead><tr><th>როდის</th><th>ვინ</th><th>რა</th><th>ცვლილება</th></tr></thead>
      <tbody id="rows"></tbody></table></div><div id="pager"></div></div>`;

  async function load() {
    const p = new URLSearchParams({ page: state.page });
    if (state.entity) p.set('entity', state.entity);
    const d = await api(`/api/admin/audit?${p}`);
    view.querySelector('#rows').innerHTML = d.entries.length
      ? d.entries
          .map((e) => {
            const changes = Object.entries(e.changes || {});
            const link = e.entity === 'order' ? `#/orders/${e.entityId}` : e.entity === 'customer' ? `#/customers/${e.entityId}` : '';
            return `<tr>
              <td style="white-space:nowrap">${date(e.at)}</td>
              <td><b>${esc(e.actor)}</b></td>
              <td>${esc(ACTIONS[e.action] || e.action)} <span class="muted">· ${esc(ENTITIES[e.entity] || e.entity)}</span>
                <small>${link ? `<a href="${link}">${esc(e.label)}</a>` : esc(e.label)}</small></td>
              <td>${
                changes.length
                  ? changes
                      .map(([k, c]) => `<div class="small"><span class="muted">${esc(k)}:</span> <s class="muted">${esc(show(c.from))}</s> → <b>${esc(show(c.to))}</b></div>`)
                      .join('')
                  : '<span class="muted">—</span>'
              }</td></tr>`;
          })
          .join('')
      : `<tr><td colspan="4">${emptyState('ჩანაწერები არ არის', '')}</td></tr>`;
    view.querySelector('#pager').replaceChildren(pager(d, (page) => ((state.page = page), load())));
  }

  view.querySelector('#entity').addEventListener('change', (e) => ((state.entity = e.target.value), (state.page = 1), load()));
  await load();
}
