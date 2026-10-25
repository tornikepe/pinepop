import { api, esc, money, date, emptyState, openModal, confirmModal, run, toast, icon } from '../core.js';

export async function render(view, { can }) {
  const write = can('coupons:write');
  view.innerHTML = `
    <div class="page-head">
      <div><h1>პრომოკოდები</h1><p>პროცენტული ან ფიქსირებული ფასდაკლება, მინიმალური შეკვეთით, ვადით და გამოყენების ლიმიტით. მომხმარებელი კოდს შეკვეთის ფორმაში წერს.</p></div>
      ${write ? `<button class="btn btn--primary" id="add">${icon('plus')} ახალი პრომოკოდი</button>` : ''}
    </div>
    <div class="card card--flush"><div class="table-wrap"><table>
      <thead><tr><th>კოდი</th><th>ფასდაკლება</th><th>პირობა</th><th class="right">გამოყენება</th><th class="right">დაზოგეს</th><th>ვადა</th><th>სტატუსი</th></tr></thead>
      <tbody id="rows"></tbody></table></div></div>`;

  let coupons = [];
  const statusOf = (c) => {
    if (!c.active) return '<span class="badge st-cancelled">გამორთული</span>';
    if (c.expiresAt && new Date(c.expiresAt) < new Date()) return '<span class="badge badge--bad">ვადაგასული</span>';
    if (c.maxUses != null && c.usedCount >= c.maxUses) return '<span class="badge badge--warn">ამოწურული</span>';
    return '<span class="badge badge--good">აქტიური</span>';
  };

  async function load() {
    coupons = await api('/api/admin/coupons');
    view.querySelector('#rows').innerHTML = coupons.length
      ? coupons
          .map(
            (c) => `<tr class="${write ? 'clickable' : ''}" data-id="${c.id}" tabindex="0">
              <td><span class="code">${esc(c.code)}</span>${c.note ? `<small>${esc(c.note)}</small>` : ''}</td>
              <td><b>${c.percentOff ? `${c.percentOff}%` : money(c.amountOff)}</b></td>
              <td>${c.minOrder ? `${money(c.minOrder)}-დან` : '<span class="muted">ნებისმიერი</span>'}</td>
              <td class="right num">${c.usedCount}${c.maxUses != null ? ` / ${c.maxUses}` : ''}</td>
              <td class="right num">${money(c.discountGiven)}</td>
              <td>${c.expiresAt ? date(c.expiresAt, { time: false }) : '<span class="muted">უვადო</span>'}</td>
              <td>${statusOf(c)}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="7">${emptyState('პრომოკოდები ჯერ არ არის', write ? 'შექმენი პირველი — მაგ. PINE10 ათპროცენტიანი ფასდაკლებით' : '')}</td></tr>`;
  }

  async function edit(c) {
    const isNew = !c;
    c ||= { code: '', percentOff: 10, amountOff: null, minOrder: 0, maxUses: null, expiresAt: null, active: true, note: '' };
    const kind = c.amountOff ? 'amount' : 'percent';
    const result = await openModal({
      title: isNew ? 'ახალი პრომოკოდი' : `პრომოკოდი ${c.code}`,
      body: `
        <label class="field"><span>კოდი</span><input name="code" value="${esc(c.code)}" maxlength="30" placeholder="PINE10" style="text-transform:uppercase" required></label>
        <div class="grid-2">
          <label class="field"><span>ტიპი</span><select name="kind">
            <option value="percent" ${kind === 'percent' ? 'selected' : ''}>პროცენტი (%)</option>
            <option value="amount" ${kind === 'amount' ? 'selected' : ''}>ფიქსირებული (₾)</option></select></label>
          <label class="field"><span>ფასდაკლება</span><input name="value" type="number" min="0" step="0.01" value="${c.percentOff ?? c.amountOff}"></label>
        </div>
        <div class="grid-2">
          <label class="field"><span>მინ. შეკვეთა ₾ <small>(0 = ნებისმიერი)</small></span><input name="minOrder" type="number" min="0" step="0.5" value="${c.minOrder}"></label>
          <label class="field"><span>ლიმიტი <small>(ცარიელი = ულიმიტო)</small></span><input name="maxUses" type="number" min="1" step="1" value="${c.maxUses ?? ''}"></label>
        </div>
        <label class="field"><span>მოქმედებს <small>(ცარიელი = უვადოდ)</small></span><input name="expiresAt" type="date" value="${c.expiresAt ? c.expiresAt.slice(0, 10) : ''}"></label>
        <label class="field"><span>შენიშვნა <small>(მხოლოდ შენთვის)</small></span><input name="note" maxlength="200" value="${esc(c.note)}" placeholder="მაგ. Instagram-ის კამპანია"></label>
        <label class="switch"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> ჩართულია</label>`,
      actions: [
        ...(isNew ? [] : [{ label: 'წაშლა', kind: 'danger', value: 'delete' }]),
        { label: 'გაუქმება', value: null },
        { label: 'შენახვა', kind: 'primary', value: 'save' },
      ],
      onAction: async (v, d) => {
        if (v !== 'save') return true;
        const f = d.querySelector('form').elements;
        const body = {
          code: f.code.value,
          kind: f.kind.value,
          value: Number(f.value.value),
          minOrder: Number(f.minOrder.value || 0),
          maxUses: f.maxUses.value,
          // end of the chosen day, Tbilisi time
          expiresAt: f.expiresAt.value ? `${f.expiresAt.value}T23:59:59+04:00` : null,
          note: f.note.value,
          active: f.active.checked,
        };
        await api(isNew ? '/api/admin/coupons' : `/api/admin/coupons/${c.id}`, { method: isNew ? 'POST' : 'PUT', body });
        toast(isNew ? 'პრომოკოდი შეიქმნა' : 'შენახულია');
      },
    });
    if (result === 'delete') {
      if (await confirmModal('პრომოკოდის წაშლა', `წავშალო ${c.code}? შეკვეთებში კოდი დარჩება, მაგრამ ხელახლა ვერ გამოიყენებენ.`, { label: 'წაშლა' })) {
        await run(null, () => api(`/api/admin/coupons/${c.id}`, { method: 'DELETE' }), 'წაიშალა');
      }
    }
    if (result) await load();
  }

  view.querySelector('#add')?.addEventListener('click', () => edit(null));
  const open = (e) => {
    if (!write) return;
    const tr = e.target.closest('tr[data-id]');
    if (tr && (e.type === 'click' || e.key === 'Enter')) edit(coupons.find((c) => c.id === Number(tr.dataset.id)));
  };
  view.querySelector('#rows').addEventListener('click', open);
  view.querySelector('#rows').addEventListener('keydown', open);
  await load();
}
