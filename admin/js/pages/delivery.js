import { api, esc, run, confirmModal, formValues, icon } from '../core.js';

export async function render(view, { can }) {
  const write = can('settings:write');
  view.innerHTML = `
    <div class="page-head">
      <div><h1>მიწოდება</h1>
        <p>თითო ზონას (ქალაქს ან უბანს) თავისი ფასი და დრო აქვს. „უფასოა თანხიდან“ — რა თანხის შეკვეთიდან აღარ ვითვლით მიწოდებას. ერთზე მეტი ზონისას შეკვეთის ფორმაში ასარჩევი გამოჩნდება.</p></div>
    </div>
    <div class="stack" id="list"></div>`;

  const card = (z) => {
    const isNew = !z.id;
    const dis = write ? '' : 'disabled';
    return `<form class="card" data-id="${z.id || ''}" novalidate ${isNew ? 'style="border-style:dashed;box-shadow:none"' : ''}>
      <div class="card__head"><h2>${isNew ? 'ახალი ზონა' : esc(z.name)}</h2>${isNew ? '' : `<span class="muted small">${z.orders} შეკვეთა</span>`}</div>
      <div class="grid-4">
        <label class="field"><span>სახელი</span><input name="name" value="${esc(z.name)}" maxlength="60" placeholder="მაგ. რუსთავი" ${dis}></label>
        <label class="field"><span>ფასი ₾ <small>(0 = უფასო)</small></span><input name="fee" type="number" min="0" step="0.5" value="${z.fee}" ${dis}></label>
        <label class="field"><span>უფასოა თანხიდან ₾</span><input name="freeAbove" type="number" min="0" step="1" value="${z.freeAbove ?? ''}" placeholder="არასდროს" ${dis}></label>
        <label class="field"><span>დრო</span><input name="eta" value="${esc(z.eta)}" maxlength="40" placeholder="მაგ. იმავე დღეს" ${dis}></label>
      </div>
      <div class="row" style="margin-top:14px">
        <label class="field" style="width:110px"><span>რიგი</span><input name="sort" type="number" step="1" value="${z.sort}" ${dis}></label>
        <label class="switch" style="margin-top:22px"><input type="checkbox" name="active" ${z.active ? 'checked' : ''} ${dis}> ჩართულია</label>
        <span class="spacer"></span>
        ${write ? `${isNew ? '' : `<button class="icon-btn" type="button" data-delete aria-label="წაშლა" style="margin-top:22px">${icon('trash')}</button>`}
          <button class="btn btn--primary" type="submit" style="margin-top:22px">${isNew ? 'დამატება' : 'შენახვა'}</button>` : ''}
      </div></form>`;
  };

  async function load() {
    const zones = await api('/api/admin/zones');
    const blank = { name: '', fee: 0, freeAbove: null, eta: '', sort: (zones.at(-1)?.sort ?? 0) + 1, active: true };
    view.querySelector('#list').innerHTML = zones.map(card).join('') + (write ? card(blank) : '');
  }

  const list = view.querySelector('#list');
  list.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = e.target.dataset.id;
    const v = formValues(e.target);
    run(e.submitter, async () => {
      await api(id ? `/api/admin/zones/${id}` : '/api/admin/zones', {
        method: id ? 'PUT' : 'POST',
        body: { ...v, fee: Number(v.fee || 0), freeAbove: v.freeAbove === '' ? null : Number(v.freeAbove), sort: Number(v.sort || 0) },
      });
      await load();
    }, id ? 'შენახულია' : 'ზონა დაემატა');
  });
  list.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-delete]')) return;
    const form = e.target.closest('form');
    if (!(await confirmModal('ზონის წაშლა', `წავშალო „${form.elements.name.value}“? ძველ შეკვეთებში ქალაქი შენახული რჩება.`, { label: 'წაშლა' }))) return;
    await run(null, async () => {
      await api(`/api/admin/zones/${form.dataset.id}`, { method: 'DELETE' });
      await load();
    }, 'წაიშალა');
  });

  await load();
}
