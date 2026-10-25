import { api, esc, run } from '../core.js';

const GROUPS = [
  ['ბრენდი', ['brandBold', 'brandItalic'], 'სახელი ორ ნაწილად: პირველი სქლად, მეორე დახრილად (PINE + POP).'],
  ['ქილა', ['jarSizeMl', 'shelfLifeDays'], 'ჩანს ეტიკეტზე, ციფრებში და შეკვეთის გვერდზე.'],
  ['შეკვეთები', ['shopOpen', 'closedMessage', 'minOrder', 'maxPerFlavor', 'reviewsEnabled'], 'შეკვეთების დროებით გაჩერება (მაგ. შვებულება), მინიმალური თანხა და ლიმიტები.'],
  ['კონტაქტები', ['phone', 'email', 'facebook', 'tiktok', 'instagram'], 'ცარიელი ველი საიტზე საერთოდ არ ჩანს.'],
];

const SUFFIX = { jarSizeMl: 'მლ', shelfLifeDays: 'დღე', minOrder: '₾', maxPerFlavor: 'ქილა' };

export async function render(view, { can }) {
  const write = can('settings:write');
  const { fields, values } = await api('/api/admin/settings');
  const dis = write ? '' : 'disabled';

  const input = (key) => {
    const f = fields[key];
    const v = values[key];
    if (f.type === 'bool') return `<label class="switch"><input type="checkbox" name="${key}" ${v ? 'checked' : ''} ${dis}> ${esc(f.label)}</label>`;
    const type = { int: 'number', money: 'number', email: 'email', phone: 'tel' }[f.type] || 'text';
    const step = f.type === 'money' ? '0.5' : f.type === 'int' ? '1' : '';
    const shown = f.type === 'phone' ? String(v).replace(/^\+995/, '') : v;
    const placeholder = { phone: '599 12 34 56', facebook: 'https://facebook.com/…', tiktok: 'https://tiktok.com/@…', instagram: 'https://instagram.com/…', email: 'hello@…' }[key] || '';
    return `<label class="field"><span>${esc(f.label)}${SUFFIX[key] ? ` <small>${SUFFIX[key]}</small>` : ''}</span>
      <input name="${key}" type="${type}" ${step ? `step="${step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null && f.type !== 'text' ? `max="${f.max}"` : ''}
        ${f.type === 'text' && f.max ? `maxlength="${f.max}"` : ''} value="${esc(shown)}" placeholder="${placeholder}" ${dis}></label>`;
  };

  view.innerHTML = `
    <div class="page-head"><div><h1>პარამეტრები</h1><p>მაღაზიის ძირითადი პარამეტრები. მიწოდების ფასები — „მიწოდებაში“, ტექსტები — „ტექსტებში“.</p></div></div>
    <form id="form" class="stack" novalidate>
      ${GROUPS.map(
        ([title, keys, hint]) => `<fieldset class="card"><legend>${title}</legend>
          <p class="muted small" style="margin:0 0 14px">${hint}</p>
          <div class="grid-2">${keys.map(input).join('')}</div>
          ${title === 'ბრენდი' ? '<p style="margin:14px 0 0" class="muted">საიტზე: <span class="brand" id="preview" style="font-size:30px;color:var(--ink)"></span></p>' : ''}
        </fieldset>`
      ).join('')}
      ${write ? '<div class="savebar"><span class="muted">ცვლილებები საიტზე გამოჩნდება გვერდის განახლების შემდეგ</span><button class="btn btn--primary" type="submit">შენახვა</button></div>' : ''}
    </form>`;

  const form = view.querySelector('#form');
  const preview = () => {
    view.querySelector('#preview').innerHTML = `${esc(form.elements.brandBold.value)}<em>${esc(form.elements.brandItalic.value)}</em>`;
  };
  form.addEventListener('input', preview);
  preview();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      body[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    run(e.submitter, () => api('/api/admin/settings', { method: 'PUT', body }), 'პარამეტრები შენახულია');
  });
}
