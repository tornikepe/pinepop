import { api, esc, run, icon } from '../core.js';

// Every text on the site, grouped by section. Leaving a field empty puts the original back.
export async function render(view, { can }) {
  const write = can('content:write');
  const { fields, values } = await api('/api/admin/content');
  const groups = [...new Set(fields.map((f) => f.group))];

  view.innerHTML = `
    <div class="page-head">
      <div><h1>საიტის ტექსტები</h1>
        <p>ყველა წარწერა საიტზე. <b>{brand}</b> ავტომატურად შეიცვლება მაღაზიის სახელით. ცარიელი ველი თავდაპირველ ტექსტს აბრუნებს.</p></div>
      <a class="btn" href="/" target="_blank" rel="noopener">${icon('external')} საიტზე ნახვა</a>
    </div>
    <form id="form" class="stack" novalidate>
      ${groups
        .map(
          (g) => `<fieldset class="card"><legend>${esc(g)}</legend><div class="stack">${fields
            .filter((f) => f.group === g)
            .map((f) => {
              const v = values[f.key];
              const changed = v !== f.default;
              const input = f.lines
                ? `<textarea name="${esc(f.key)}" rows="3" maxlength="${f.max}" placeholder="${esc(f.default)}" ${write ? '' : 'disabled'}>${esc(v)}</textarea>`
                : `<input name="${esc(f.key)}" value="${esc(v)}" maxlength="${f.max}" placeholder="${esc(f.default)}" ${write ? '' : 'disabled'}>`;
              return `<label class="field"><span>${esc(f.label)} <small data-count="${esc(f.key)}">${v.length}/${f.max}${changed ? ' · შეცვლილი' : ''}</small></span>${input}</label>`;
            })
            .join('')}</div></fieldset>`
        )
        .join('')}
      ${write ? '<div class="savebar"><span class="muted" id="dirty">ცვლილებები არ არის</span><button class="btn btn--primary" type="submit">შენახვა</button></div>' : ''}
    </form>`;

  const form = view.querySelector('#form');
  const byKey = new Map(fields.map((f) => [f.key, f]));
  let dirty = false;

  form.addEventListener('input', (e) => {
    const f = byKey.get(e.target.name);
    if (!f) return;
    form.querySelector(`[data-count="${CSS.escape(f.key)}"]`).textContent = `${e.target.value.length}/${f.max}`;
    dirty = true;
    const d = view.querySelector('#dirty');
    if (d) d.textContent = 'არის შეუნახავი ცვლილებები';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = {};
    for (const el of form.elements) if (el.name) body[el.name] = el.value;
    run(e.submitter, async () => {
      const saved = await api('/api/admin/content', { method: 'PUT', body });
      for (const el of form.elements) if (el.name && el.value.trim() === '') el.value = saved[el.name];
      dirty = false;
      view.querySelector('#dirty').textContent = 'შენახულია — საიტზე გამოჩნდება გვერდის განახლების შემდეგ';
    }, 'ტექსტები შენახულია');
  });

  // leaving with unsaved edits asks first
  const guard = (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', guard);
  return () => window.removeEventListener('beforeunload', guard);
}
