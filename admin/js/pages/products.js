import { api, esc, money, num, date, run, openModal, confirmModal, formValues, toast, icon } from '../core.js';

const REASONS = { order: 'შეკვეთა', cancel: 'გაუქმება', restock: 'შევსება', adjust: 'კორექცია', import: 'საწყისი' };

export async function render(view, { can, refreshBadges }) {
  const write = can('products:write');
  const showMoney = can('staff');

  view.innerHTML = `
    <div class="page-head">
      <div><h1>გემოები და მარაგი</h1>
        <p>ფასი, თვითღირებულება, მარაგი და ფერი (ქილის შიგთავსს და საიტის აქცენტს ცვლის). გამორთული გემო საიტზე არ ჩანს.</p></div>
    </div>
    <div class="products" id="grid"></div>`;

  const card = (p) => {
    const isNew = !p.id;
    const margin = p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
    const low = !isNew && p.stock <= p.lowStock;
    return `<form class="card product ${isNew ? 'product--new' : ''}" data-id="${p.id || ''}" style="--c:${esc(p.color)}" novalidate>
      <div class="card__head">
        <h2 class="row" style="gap:10px"><span class="dot" style="--c:${esc(p.color)};width:18px;height:18px"></span>${isNew ? 'ახალი გემო' : esc(p.flavor)}</h2>
        ${isNew ? '' : `<span class="badge ${p.stock === 0 ? 'badge--bad' : low ? 'badge--warn' : 'badge--good'} stock-badge">${p.stock} ქილა</span>`}
      </div>
      ${
        isNew
          ? ''
          : `<div class="product__stats">
              <div><b>${num(p.sold)}</b>გაიყიდა</div>
              <div><b>${money(p.revenue)}</b>შემოსავალი</div>
              ${showMoney ? `<div><b>${money(p.profit)}</b>მოგება</div><div><b>${margin}%</b>მარჟა</div>` : ''}
            </div>`
      }
      <div class="stack">
        <label class="field"><span>გემო</span><input name="flavor" value="${esc(p.flavor)}" maxlength="40" required ${write ? '' : 'disabled'}></label>
        <label class="field"><span>აღწერა <small>(საიტზე ჩანს)</small></span><textarea name="description" rows="2" maxlength="300" ${write ? '' : 'disabled'}>${esc(p.description)}</textarea></label>
        <div class="grid-3">
          <label class="field"><span>ფასი ₾</span><input name="price" type="number" min="0.5" step="0.01" value="${p.price}" ${write ? '' : 'disabled'}></label>
          <label class="field"><span>თვითღირ. ₾</span><input name="cost" type="number" min="0" step="0.01" value="${p.cost}" ${write ? '' : 'disabled'}></label>
          <label class="field"><span>ფერი</span><input name="color" type="color" value="${esc(p.color)}" ${write ? '' : 'disabled'}></label>
        </div>
        <div class="grid-3">
          ${isNew ? `<label class="field"><span>საწყისი მარაგი</span><input name="stock" type="number" min="0" step="1" value="50"></label>` : ''}
          <label class="field"><span>გაფრთხილება ≤</span><input name="lowStock" type="number" min="0" step="1" value="${p.lowStock}" ${write ? '' : 'disabled'}></label>
          <label class="field"><span>რიგი</span><input name="sort" type="number" step="1" value="${p.sort}" ${write ? '' : 'disabled'}></label>
        </div>
        <label class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} ${write ? '' : 'disabled'}> საიტზე ჩანს</label>
      </div>
      <div class="row" style="margin-top:16px">
        ${write ? `<button class="btn btn--primary" type="submit">${isNew ? `${icon('plus')} დამატება` : 'შენახვა'}</button>` : ''}
        ${!isNew && write ? '<button class="btn" type="button" data-stock>მარაგი ±</button>' : ''}
        ${!isNew ? '<button class="btn btn--ghost" type="button" data-history>ისტორია</button>' : ''}
        <span class="spacer"></span>
        ${!isNew && write ? `<button class="icon-btn" type="button" data-delete aria-label="წაშლა" ${p.orders ? 'disabled title="შეკვეთები აქვს — გამორთე"' : ''}>${icon('trash')}</button>` : ''}
      </div>
    </form>`;
  };

  let products = [];
  async function load() {
    products = await api('/api/admin/products');
    const blank = { flavor: '', description: '', price: 20, cost: 0, color: '#ffd23f', lowStock: 10, sort: products.length + 1, active: true };
    view.querySelector('#grid').innerHTML = products.map(card).join('') + (write ? card(blank) : '');
  }

  const grid = view.querySelector('#grid');
  grid.addEventListener('input', (e) => {
    if (e.target.name === 'color') {
      e.target.form.style.setProperty('--c', e.target.value);
      e.target.form.querySelector('.dot').style.setProperty('--c', e.target.value);
    }
  });

  grid.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const v = formValues(form);
    const id = form.dataset.id;
    run(
      e.submitter,
      async () => {
        await api(id ? `/api/admin/products/${id}` : '/api/admin/products', {
          method: id ? 'PUT' : 'POST',
          body: { ...v, price: Number(v.price), cost: Number(v.cost || 0), lowStock: Number(v.lowStock), sort: Number(v.sort || 0), stock: Number(v.stock || 0) },
        });
        await load();
        refreshBadges();
      },
      id ? 'შენახულია' : 'ახალი გემო დაემატა'
    );
  });

  grid.addEventListener('click', async (e) => {
    const form = e.target.closest('form[data-id]');
    if (!form?.dataset.id) return;
    const p = products.find((x) => x.id === Number(form.dataset.id));

    if (e.target.closest('[data-delete]')) {
      if (!(await confirmModal('გემოს წაშლა', `წავშალო „${p.flavor}“? ამას ვერ დააბრუნებ.`, { label: 'წაშლა' }))) return;
      await run(null, async () => {
        await api(`/api/admin/products/${p.id}`, { method: 'DELETE' });
        await load();
      }, 'წაიშალა');
    }

    if (e.target.closest('[data-stock]')) {
      const ok = await openModal({
        title: `მარაგი — ${p.flavor}`,
        body: `<p style="margin:0">ახლა მარაგშია <b>${p.stock}</b> ქილა.</p>
          <div class="seg" role="group" aria-label="მოქმედება" id="kind">
            <button type="button" data-k="restock" aria-pressed="true">+ შევსება</button>
            <button type="button" data-k="adjust" aria-pressed="false">± კორექცია</button></div>
          <label class="field"><span id="deltaLabel">რამდენი ქილა დაემატა</span><input name="delta" type="number" step="1" required autofocus></label>
          <label class="field"><span>შენიშვნა <small>(არასავალდებულო)</small></span><input name="note" maxlength="200" placeholder="მაგ. ახალი პარტია, დაზიანებული ქილა"></label>`,
        actions: [
          { label: 'გაუქმება', value: null },
          { label: 'შენახვა', kind: 'primary', value: 'save' },
        ],
        onOpen: (d) => {
          d.querySelector('#kind').onclick = (ev) => {
            const b = ev.target.closest('[data-k]');
            if (!b) return;
            d.querySelectorAll('#kind button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            d.querySelector('#deltaLabel').textContent = b.dataset.k === 'restock' ? 'რამდენი ქილა დაემატა' : 'ცვლილება (მაგ. −2 ან +3)';
          };
        },
        onAction: async (_v, d) => {
          const kind = d.querySelector('#kind [aria-pressed="true"]').dataset.k;
          let delta = Number(d.querySelector('[name=delta]').value);
          if (kind === 'restock') delta = Math.abs(delta);
          await api(`/api/admin/products/${p.id}/stock`, {
            method: 'POST',
            body: { delta, reason: kind, note: d.querySelector('[name=note]').value },
          });
        },
      });
      if (ok) {
        toast('მარაგი განახლდა');
        await load();
        refreshBadges();
      }
    }

    if (e.target.closest('[data-history]')) {
      const rows = await api(`/api/admin/products/${p.id}/movements`);
      openModal({
        title: `მარაგის ისტორია — ${p.flavor}`,
        body: rows.length
          ? `<div class="table-wrap" style="max-height:60vh"><table>
              <thead><tr><th>როდის</th><th>რა</th><th class="right">±</th><th class="right">ნაშთი</th></tr></thead>
              <tbody>${rows
                .map(
                  (m) => `<tr><td>${date(m.at)}<small>${esc(m.actor === 'customer' ? 'მომხმარებელი' : m.actor)}</small></td>
                    <td>${REASONS[m.reason] || m.reason}${m.orderCode ? ` · <a href="#/orders/${m.orderId}">${esc(m.orderCode)}</a>` : ''}${m.note ? `<small>${esc(m.note)}</small>` : ''}</td>
                    <td class="right num ${m.delta > 0 ? 'delta-up' : 'delta-down'}">${m.delta > 0 ? '+' : ''}${m.delta}</td>
                    <td class="right num">${m.balance}</td></tr>`
                )
                .join('')}</tbody></table></div>`
          : '<p class="muted">ჯერ მოძრაობა არ ყოფილა.</p>',
      });
    }
  });

  await load();
}
