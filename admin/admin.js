const STATUS = { new: 'ახალი', confirmed: 'დადასტურებული', delivered: 'მიწოდებული', cancelled: 'გაუქმებული' };

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `${Number(n).toFixed(2)} ₾`;

// ---------- helpers ----------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/admin/login') {
    showLogin();
    throw new Error('საჭიროა თავიდან შესვლა');
  }
  if (!res.ok) throw new Error(data.error || 'შეცდომა');
  return data;
}

let toastTimer;
function toast(message, ok = true) {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast is-on ${ok ? 'is-ok' : 'is-err'}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

// Runs a save action with the button disabled and a toast for the result.
async function withButton(btn, fn, okMessage) {
  btn.disabled = true;
  try {
    await fn();
    if (okMessage) toast(okMessage);
  } catch (err) {
    toast(err.message, false);
  } finally {
    btn.disabled = false;
  }
}

// ---------- login / logout ----------

function showLogin() {
  $('appView').hidden = true;
  $('loginView').hidden = false;
  $('loginForm').elements.username.focus();
}

function showApp(username) {
  $('loginView').hidden = true;
  $('appView').hidden = false;
  $('whoami').textContent = `(${username})`;
  openTab(location.hash.slice(1) || 'orders');
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  $('loginError').textContent = '';
  try {
    const { username } = await api('/api/admin/login', {
      method: 'POST',
      body: { username: f.username.value, password: f.password.value },
    });
    f.password.value = '';
    showApp(username);
  } catch (err) {
    $('loginError').textContent = err.message;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// ---------- tabs ----------

const loaders = { orders: loadOrders, products: loadProducts, settings: loadSettings, account: loadAccount };

function openTab(name) {
  if (!loaders[name]) name = 'orders';
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  history.replaceState(null, '', `#${name}`);
  loaders[name]().catch((err) => toast(err.message, false));
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (btn) openTab(btn.dataset.tab);
});

// ---------- orders ----------

async function loadOrders() {
  const orders = await api('/api/admin/orders');
  const active = orders.filter((o) => o.status !== 'cancelled');
  const revenue = active.reduce((s, o) => s + o.total, 0);
  const jars = active.reduce((s, o) => s + o.items.reduce((n, i) => n + i.qty, 0), 0);
  $('summary').innerHTML = `
    <div><strong>${orders.filter((o) => o.status === 'new').length}</strong><span>ახალი</span></div>
    <div><strong>${active.length}</strong><span>აქტიური შეკვეთა</span></div>
    <div><strong>${jars}</strong><span>ქილა</span></div>
    <div><strong>${money(revenue)}</strong><span>ჯამი (გაუქმებულის გარეშე)</span></div>`;

  $('orderRows').innerHTML = orders.length
    ? orders
        .map(
          (o) => `
      <tr class="status-${o.status}">
        <td class="code">${esc(o.code)}</td>
        <td>${esc(new Date(o.createdAt.replace(' ', 'T') + 'Z').toLocaleString('ka-GE'))}</td>
        <td>${esc(o.name)}<small><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></small></td>
        <td>${esc(o.city)}<small>${esc(o.address)}</small>${o.note ? `<small>💬 ${esc(o.note)}</small>` : ''}</td>
        <td>${o.items.map((i) => `${esc(i.flavor)} × ${i.qty}`).join('<br>')}</td>
        <td>${money(o.total)}${o.delivery ? `<small>მიწ. ${money(o.delivery)}</small>` : ''}</td>
        <td>
          <select data-order="${o.id}">
            ${Object.entries(STATUS)
              .map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`)
              .join('')}
          </select>
        </td>
      </tr>`
        )
        .join('')
    : '<tr><td colspan="7" class="empty">შეკვეთები ჯერ არ არის 🍍</td></tr>';
}

$('orderRows').addEventListener('change', async (e) => {
  const select = e.target.closest('select[data-order]');
  if (!select) return;
  try {
    await api(`/api/admin/orders/${select.dataset.order}`, { method: 'PATCH', body: { status: select.value } });
    toast(`სტატუსი: ${STATUS[select.value]}`);
    loadOrders();
  } catch (err) {
    toast(err.message, false);
  }
});

$('reloadOrders').addEventListener('click', () => loadOrders().catch((err) => toast(err.message, false)));

// ---------- products ----------

function productCard(p) {
  const isNew = !p.id;
  return `
    <form class="card product ${isNew ? 'product--new' : ''}" data-id="${p.id || ''}" style="--c:${esc(p.color)}" novalidate>
      <div class="product__head">
        <span class="product__dot"></span>
        <strong>${isNew ? 'ახალი გემო' : esc(p.flavor)}</strong>
        ${isNew ? '' : `<span class="badge ${p.active ? '' : 'badge--off'}">${p.active ? 'საიტზე ჩანს' : 'გამორთულია'}</span>`}
      </div>
      <label class="field"><span>გემო</span><input name="flavor" value="${esc(p.flavor)}" maxlength="40" required /></label>
      <label class="field"><span>აღწერა</span><textarea name="description" rows="2" maxlength="300">${esc(p.description)}</textarea></label>
      <div class="row-3">
        <label class="field"><span>ფასი ₾</span><input name="price" type="number" min="0.5" step="0.01" value="${p.price}" required /></label>
        <label class="field"><span>მარაგი (ქილა)</span><input name="stock" type="number" min="0" step="1" value="${p.stock}" required /></label>
        <label class="field"><span>ფერი</span><input name="color" type="color" value="${esc(p.color)}" /></label>
      </div>
      <div class="row-2">
        <label class="field"><span>რიგი საიტზე</span><input name="sort" type="number" step="1" value="${p.sort}" /></label>
        <label class="check" style="margin-top: 26px"><input name="active" type="checkbox" ${p.active ? 'checked' : ''} /> საიტზე ჩანს</label>
      </div>
      <div class="actions">
        <button class="btn" type="submit">${isNew ? 'დამატება' : 'შენახვა'}</button>
        ${
          isNew
            ? ''
            : `<button class="btn btn--danger" type="button" data-delete ${p.orders ? 'disabled title="ამ გემოზე უკვე არის შეკვეთები — გამორთე"' : ''}>წაშლა</button>`
        }
        ${!isNew && p.orders ? `<small>${p.orders} შეკვეთაში</small>` : ''}
      </div>
    </form>`;
}

async function loadProducts() {
  const products = await api('/api/admin/products');
  const blank = { flavor: '', description: '', price: 20, stock: 50, color: '#ffd23f', sort: products.length + 1, active: true };
  $('productGrid').innerHTML = products.map(productCard).join('') + productCard(blank);
}

$('productGrid').addEventListener('input', (e) => {
  if (e.target.name === 'color') e.target.form.style.setProperty('--c', e.target.value);
});

$('productGrid').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const f = form.elements;
  const body = {
    flavor: f.flavor.value,
    description: f.description.value,
    price: Number(f.price.value),
    stock: Number(f.stock.value),
    color: f.color.value,
    sort: Number(f.sort.value || 0),
    active: f.active.checked,
  };
  const id = form.dataset.id;
  withButton(
    e.submitter || form.querySelector('[type=submit]'),
    async () => {
      await api(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body });
      await loadProducts();
    },
    id ? 'შენახულია' : 'ახალი გემო დაემატა'
  );
});

$('productGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete]');
  if (!btn) return;
  const form = btn.closest('form');
  if (!confirm(`წავშალო „${form.elements.flavor.value}“?`)) return;
  withButton(
    btn,
    async () => {
      await api(`/api/admin/products/${form.dataset.id}`, { method: 'DELETE' });
      await loadProducts();
    },
    'წაიშალა'
  );
});

// ---------- settings ----------

const settingsForm = $('settingsForm');

function brandPreview() {
  const f = settingsForm.elements;
  $('brandPreview').innerHTML = `${esc(f.brandBold.value)}<em>${esc(f.brandItalic.value)}</em>`;
}

async function loadSettings() {
  const s = await api('/api/admin/settings');
  const f = settingsForm.elements;
  for (const [key, value] of Object.entries(s)) {
    if (!f[key]) continue;
    f[key].value = Array.isArray(value) ? value.join(', ') : key === 'phone' ? value.replace(/^\+995/, '') : value;
  }
  brandPreview();
}

settingsForm.addEventListener('input', brandPreview);

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(settingsForm));
  withButton(
    e.submitter,
    async () => {
      await api('/api/admin/settings', { method: 'PUT', body });
      await loadSettings();
    },
    'პარამეტრები შენახულია — საიტზე გამოჩნდება განახლების შემდეგ'
  );
});

// ---------- account ----------

const accountForm = $('accountForm');

async function loadAccount() {
  const { username } = await api('/api/admin/me');
  accountForm.reset();
  accountForm.elements.username.value = username;
}

accountForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = accountForm.elements;
  if (f.newPassword.value !== f.repeatPassword.value) {
    toast('ახალი პაროლები არ ემთხვევა', false);
    return;
  }
  withButton(
    e.submitter,
    async () => {
      const { username } = await api('/api/admin/account', {
        method: 'PUT',
        body: { username: f.username.value, currentPassword: f.currentPassword.value, newPassword: f.newPassword.value },
      });
      $('whoami').textContent = `(${username})`;
      await loadAccount();
    },
    'ანგარიში განახლდა'
  );
});

// ---------- start ----------

api('/api/admin/me')
  .then(({ username }) => showApp(username))
  .catch(() => showLogin());
