import { api, esc, run, confirmModal, formValues, icon } from '../core.js';

export async function render(view, { can }) {
  const write = can('content:write');
  view.innerHTML = `
    <div class="page-head">
      <div><h1>კითხვა-პასუხი</h1><p>საიტის ბოლოში „ხშირად გვეკითხებიან“ სექცია. რიგი განსაზღვრავს თანმიმდევრობას; გამორთული კითხვა საიტზე არ ჩანს.</p></div>
    </div>
    <div class="stack" id="list"></div>`;

  const card = (f) => {
    const isNew = !f.id;
    return `<form class="card" data-id="${f.id || ''}" novalidate ${isNew ? 'style="border-style:dashed;box-shadow:none"' : ''}>
      ${isNew ? '<div class="card__head"><h2>ახალი კითხვა</h2></div>' : ''}
      <div class="stack">
        <label class="field"><span>კითხვა</span><input name="question" value="${esc(f.question)}" maxlength="200" ${write ? '' : 'disabled'}></label>
        <label class="field"><span>პასუხი</span><textarea name="answer" rows="3" maxlength="1200" ${write ? '' : 'disabled'}>${esc(f.answer)}</textarea></label>
        <div class="row">
          <label class="field" style="width:110px"><span>რიგი</span><input name="sort" type="number" step="1" value="${f.sort}" ${write ? '' : 'disabled'}></label>
          <label class="switch" style="margin-top:22px"><input type="checkbox" name="active" ${f.active ? 'checked' : ''} ${write ? '' : 'disabled'}> საიტზე ჩანს</label>
          <span class="spacer"></span>
          ${write ? `${isNew ? '' : `<button class="icon-btn" type="button" data-delete aria-label="წაშლა" style="margin-top:22px">${icon('trash')}</button>`}
            <button class="btn btn--primary" type="submit" style="margin-top:22px">${isNew ? 'დამატება' : 'შენახვა'}</button>` : ''}
        </div>
      </div></form>`;
  };

  async function load() {
    const faqs = await api('/api/admin/faqs');
    const blank = { question: '', answer: '', sort: (faqs.at(-1)?.sort ?? 0) + 1, active: true };
    view.querySelector('#list').innerHTML = faqs.map(card).join('') + (write ? card(blank) : '');
  }

  const list = view.querySelector('#list');
  list.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = e.target.dataset.id;
    const v = formValues(e.target);
    run(e.submitter, async () => {
      await api(id ? `/api/admin/faqs/${id}` : '/api/admin/faqs', { method: id ? 'PUT' : 'POST', body: { ...v, sort: Number(v.sort || 0) } });
      await load();
    }, id ? 'შენახულია' : 'კითხვა დაემატა');
  });
  list.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-delete]')) return;
    const form = e.target.closest('form');
    if (!(await confirmModal('კითხვის წაშლა', `წავშალო „${form.elements.question.value}“?`, { label: 'წაშლა' }))) return;
    await run(null, async () => {
      await api(`/api/admin/faqs/${form.dataset.id}`, { method: 'DELETE' });
      await load();
    }, 'წაიშალა');
  });

  await load();
}
