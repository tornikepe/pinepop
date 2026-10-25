import { api, esc, ago, date, openModal, confirmModal, secretModal, run, toast, icon } from '../core.js';

export async function render(view, { me }) {
  view.innerHTML = `
    <div class="page-head">
      <div><h1>თანამშრომლები</h1>
        <p>ვის აქვს წვდომა ადმინზე და რა უფლებით. ახალ ანგარიშს ძლიერი პაროლი ავტომატურად ექმნება და მხოლოდ ერთხელ ჩანს.</p></div>
      <button class="btn btn--primary" id="add">${icon('plus')} თანამშრომლის დამატება</button>
    </div>
    <div class="card card--flush"><div class="table-wrap"><table>
      <thead><tr><th>თანამშრომელი</th><th>როლი</th><th>ბოლო შესვლა</th><th>პაროლი</th><th>სტატუსი</th><th></th></tr></thead>
      <tbody id="rows"></tbody></table></div></div>
    <div class="card" style="margin-top:14px"><div class="card__head"><h2>როლები</h2></div><dl class="kv" id="roles" style="grid-template-columns:auto 1fr"></dl></div>`;

  let roles = {};
  async function load() {
    const d = await api('/api/admin/staff');
    roles = d.roles;
    view.querySelector('#roles').innerHTML = Object.entries(roles)
      .map(([k, v]) => `<dt><b>${esc(v.split(' — ')[0])}</b></dt><dd style="text-align:left">${esc(v.split(' — ')[1] || '')}</dd>`)
      .join('');
    view.querySelector('#rows').innerHTML = d.staff
      .map((s) => {
        const self = s.id === me.id;
        const age = Math.floor((Date.now() - new Date(s.passwordChangedAt)) / 86400000);
        return `<tr data-id="${s.id}">
          <td><b>${esc(s.name || s.username)}</b>${self ? ' <span class="badge badge--plain">შენ</span>' : ''}<small>${esc(s.username)}</small></td>
          <td><select data-role aria-label="როლი" style="min-width:150px" ${self ? 'disabled' : ''}>${Object.entries(roles)
            .map(([k, v]) => `<option value="${k}" ${k === s.role ? 'selected' : ''}>${esc(v.split(' — ')[0])}</option>`)
            .join('')}</select></td>
          <td>${ago(s.lastLoginAt)}<small>${s.sessions} აქტიური სესია</small></td>
          <td>${age === 0 ? 'დღეს' : `${age} დღის`}<small>${date(s.passwordChangedAt, { time: false })}</small></td>
          <td><label class="switch"><input type="checkbox" data-active ${s.active ? 'checked' : ''} ${self ? 'disabled' : ''}> ${s.active ? 'აქტიური' : 'გამორთული'}</label></td>
          <td class="right"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
            <button class="btn btn--sm" data-reset title="ახალი პაროლის გენერაცია">${icon('key')} პაროლი</button>
            ${self ? '' : `<button class="icon-btn" data-delete aria-label="წაშლა">${icon('trash')}</button>`}</div></td></tr>`;
      })
      .join('');
  }

  view.querySelector('#add').addEventListener('click', async () => {
    let created = null;
    await openModal({
      title: 'ახალი თანამშრომელი',
      body: `<label class="field"><span>ლოგინი <small>ლათინური, 3–40</small></span><input name="username" maxlength="40" placeholder="მაგ. nino" autocomplete="off" required autofocus></label>
        <label class="field"><span>სახელი <small>(არასავალდებულო)</small></span><input name="name" maxlength="60"></label>
        <label class="field"><span>როლი</span><select name="role">${Object.entries(roles)
          .map(([k, v]) => `<option value="${k}" ${k === 'manager' ? 'selected' : ''}>${esc(v)}</option>`)
          .join('')}</select></label>`,
      actions: [
        { label: 'გაუქმება', value: null },
        { label: 'შექმნა', kind: 'primary', value: 'create' },
      ],
      onAction: async (_v, d) => {
        const f = d.querySelector('form').elements;
        created = await api('/api/admin/staff', { method: 'POST', body: { username: f.username.value.trim(), name: f.name.value, role: f.role.value } });
      },
    });
    if (created) {
      await load();
      await secretModal('ანგარიში შეიქმნა', `${created.staff.username}-ის პაროლი:`, created.password);
    }
  });

  const rows = view.querySelector('#rows');
  rows.addEventListener('change', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    const id = tr.dataset.id;
    const body = e.target.matches('[data-role]') ? { role: e.target.value } : e.target.matches('[data-active]') ? { active: e.target.checked } : null;
    if (!body) return;
    try {
      await api(`/api/admin/staff/${id}`, { method: 'PATCH', body });
      toast('შენახულია');
    } catch (err) {
      toast(err.message, { error: true });
    }
    load();
  });
  rows.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    const name = tr.querySelector('small').textContent;
    if (e.target.closest('[data-reset]')) {
      if (!(await confirmModal('ახალი პაროლი', `${name}-ს შეეცვლება პაროლი და ყველა მოწყობილობიდან გამოვა. გავაგრძელო?`, { danger: false, label: 'გენერაცია' }))) return;
      const r = await run(null, () => api(`/api/admin/staff/${id}/password`, { method: 'POST' }));
      if (r) {
        await secretModal('ახალი პაროლი', `${name}-ის ახალი პაროლი:`, r.password);
        load();
      }
    }
    if (e.target.closest('[data-delete]')) {
      if (!(await confirmModal('თანამშრომლის წაშლა', `წავშალო ${name}? შეიძლება უბრალოდ გამორთვაც.`, { label: 'წაშლა' }))) return;
      await run(null, async () => {
        await api(`/api/admin/staff/${id}`, { method: 'DELETE' });
        await load();
      }, 'წაიშალა');
    }
  });

  await load();
}
