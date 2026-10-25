// Small shared toolkit for the admin pages: API calls, formatting, icons, toasts, modals.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- formatting ----------

// Prices are built by hand: a no-break space between the amount and ₾, so they never split.
export function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const fixed = Math.abs(n % 1) > 0 ? Number(n).toFixed(2) : String(Math.round(n));
  const [int, dec] = fixed.split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec ? `.${dec}` : ''} ₾`;
}

export const num = (n) => String(Math.round(n ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const MONTHS = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
const pad = (n) => String(n).padStart(2, '0');

export function date(value, { time = true } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  return time ? `${s}, ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
}

export function ago(value) {
  if (!value) return 'არასდროს';
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'ახლახან';
  if (s < 3600) return `${Math.floor(s / 60)} წთ წინ`;
  if (s < 86400) return `${Math.floor(s / 3600)} სთ წინ`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} დღის წინ`;
  return date(value, { time: false });
}

export const shortDay = (iso) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

export const prettyPhone = (p) => String(p || '').replace(/^\+995(\d{3})(\d{2})(\d{2})(\d{2})$/, '+995 $1 $2 $3 $4');

export const STATUS = {
  new: 'ახალი',
  confirmed: 'დადასტურებული',
  delivering: 'გზაშია',
  delivered: 'მიწოდებული',
  cancelled: 'გაუქმებული',
};

export const statusBadge = (s) => `<span class="badge st-${esc(s)}">${esc(STATUS[s] || s)}</span>`;

export const stars = (n) => `<span class="stars" aria-label="${n} ვარსკვლავი">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;

// ---------- icons (Lucide, ISC licence) ----------

const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
};

export const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// Elements written as <button data-icon="moon"> get their icon prepended.
export function hydrateIcons(root = document) {
  for (const el of $$('[data-icon]', root)) {
    if (el.querySelector(':scope > .ic')) continue;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
  }
}

// ---------- API ----------

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/admin/login') {
    onUnauthorized();
    throw new ApiError(401, 'საჭიროა თავიდან შესვლა');
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'შეცდომა');
  return data;
}

// ---------- toasts ----------

export function toast(message, { error = false } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' toast--err' : ''}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), error ? 5000 : 2800);
}

// Runs an action with its button disabled and reports the outcome.
export async function run(btn, fn, okMessage) {
  if (btn) btn.disabled = true;
  try {
    const result = await fn();
    if (okMessage) toast(okMessage);
    return result;
  } catch (err) {
    toast(err.message, { error: true });
    return undefined;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- modal ----------

// openModal({ title, body (html), actions: [{ label, kind, value }] }) → resolves with the
// clicked action's value (or null on close). `onOpen(dialog)` can wire the body.
export function openModal({ title, body, actions = [{ label: 'დახურვა', value: null }], onOpen, onAction }) {
  const dialog = $('#modal');
  dialog.innerHTML = `
    <div class="modal__head"><h2>${esc(title)}</h2>
      <button class="icon-btn" data-close aria-label="დახურვა">${icon('x')}</button></div>
    <form class="modal__body" method="dialog" novalidate>${body}</form>
    <div class="modal__foot">${actions
      .map((a, i) => `<button class="btn ${a.kind ? `btn--${a.kind}` : ''}" data-action="${i}" type="button">${esc(a.label)}</button>`)
      .join('')}</div>`;
  hydrateIcons(dialog);
  dialog.showModal();
  onOpen?.(dialog);

  return new Promise((resolve) => {
    const close = (value) => {
      dialog.close();
      dialog.onclick = null;
      dialog.onclose = null;
      resolve(value);
    };
    dialog.onclose = () => resolve(null);
    dialog.onclick = async (e) => {
      if (e.target === dialog || e.target.closest('[data-close]')) return close(null);
      if (e.target.closest('a[href^="#"]')) return close(null); // following a link leaves the dialog
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = actions[Number(btn.dataset.action)];
      if (onAction && action.value !== null) {
        // onAction may throw to keep the dialog open (e.g. validation errors)
        btn.disabled = true;
        try {
          const keep = await onAction(action.value, dialog);
          if (keep !== false) close(action.value);
        } catch (err) {
          toast(err.message, { error: true });
        } finally {
          btn.disabled = false;
        }
        return;
      }
      close(action.value);
    };
    // Enter in a single-line field triggers the primary action
    dialog.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const primary = actions.findIndex((a) => a.kind === 'primary');
      if (primary >= 0) dialog.querySelector(`[data-action="${primary}"]`).click();
    };
  });
}

export const confirmModal = (title, text, { danger = true, label = 'დიახ' } = {}) =>
  openModal({
    title,
    body: `<p style="margin:0">${esc(text)}</p>`,
    actions: [
      { label: 'გაუქმება', value: null },
      { label, kind: danger ? 'danger' : 'primary', value: true },
    ],
  });

// Shown once: a generated password with a copy button.
export function secretModal(title, intro, secret) {
  return openModal({
    title,
    body: `<p style="margin:0">${esc(intro)}</p>
      <div class="secret"><span style="flex:1">${esc(secret)}</span>
        <button class="btn btn--sm" type="button" data-copy>${icon('copy')} კოპირება</button></div>
      <p class="note">ეს პაროლი მხოლოდ ახლა ჩანს. შეინახე ან გადაეცი უსაფრთხოდ.</p>`,
    actions: [{ label: 'შევინახე', kind: 'primary', value: true }],
    onOpen: (d) => {
      d.querySelector('[data-copy]').onclick = async (e) => {
        await navigator.clipboard?.writeText(secret).catch(() => {});
        e.currentTarget.textContent = 'დაკოპირდა ✓';
      };
    },
  });
}

// ---------- forms ----------

export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else out[el.name] = el.value;
  }
  return out;
}

export const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export const emptyState = (title, text = '') => `<div class="empty"><b>${esc(title)}</b>${esc(text)}</div>`;

export function pager({ page, pages }, onPage) {
  const el = document.createElement('div');
  el.className = 'pager';
  if (pages <= 1) return el;
  el.innerHTML = `<span>გვერდი ${page} / ${pages}</span>
    <button class="btn btn--sm" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← წინა</button>
    <button class="btn btn--sm" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>შემდეგი →</button>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (b) onPage(Number(b.dataset.p));
  };
  return el;
}
