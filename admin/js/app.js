import { $, api, esc, hydrateIcons, icon, setUnauthorizedHandler, toast } from './core.js';

// Hash router: #/orders/12 → pages/orders.js, params ['12'].
// Each page module exports render(view, { params, me, can, go, setBadge }) and may
// return a cleanup function.
const NAV = [
  { group: 'მაღაზია' },
  { path: 'dashboard', label: 'დაფა', icon: 'home', load: () => import('./pages/dashboard.js') },
  { path: 'orders', label: 'შეკვეთები', icon: 'bag', badge: 'orders', load: () => import('./pages/orders.js') },
  { path: 'customers', label: 'მომხმარებლები', icon: 'users', load: () => import('./pages/customers.js') },
  { group: 'კატალოგი' },
  { path: 'products', label: 'გემოები და მარაგი', icon: 'box', badge: 'stock', load: () => import('./pages/products.js') },
  { path: 'coupons', label: 'პრომოკოდები', icon: 'ticket', load: () => import('./pages/coupons.js') },
  { path: 'reviews', label: 'შეფასებები', icon: 'star', badge: 'reviews', load: () => import('./pages/reviews.js') },
  { group: 'საიტი' },
  { path: 'content', label: 'ტექსტები', icon: 'type', load: () => import('./pages/content.js') },
  { path: 'faq', label: 'კითხვა-პასუხი', icon: 'help', load: () => import('./pages/faq.js') },
  { path: 'delivery', label: 'მიწოდება', icon: 'truck', load: () => import('./pages/delivery.js') },
  { path: 'settings', label: 'პარამეტრები', icon: 'sliders', load: () => import('./pages/settings.js') },
  { group: 'სისტემა', admin: true },
  { path: 'staff', label: 'თანამშრომლები', icon: 'shield', perm: 'staff', load: () => import('./pages/staff.js') },
  { path: 'audit', label: 'ცვლილებების ისტორია', icon: 'history', perm: 'audit', load: () => import('./pages/audit.js') },
  { path: 'database', label: 'ბაზა', icon: 'database', perm: 'database', load: () => import('./pages/database.js') },
  { path: 'account', label: 'ჩემი ანგარიში', icon: 'user', hidden: true, load: () => import('./pages/account.js') },
];

let me = null;
let cleanup = null;
const badges = {};

const can = (perm) => !!me?.permissions.includes(perm);
const go = (path) => (location.hash = `#/${path}`);

function renderNav() {
  const html = NAV.filter((n) => !n.hidden)
    .filter((n) => (n.group ? !n.admin || can('staff') : !n.perm || can(n.perm)))
    .map((n) =>
      n.group
        ? `<div class="side__group">${esc(n.group)}</div>`
        : `<a class="side__link" href="#/${n.path}" data-path="${n.path}">${icon(n.icon)}<span>${esc(n.label)}</span>${
            badges[n.badge] ? `<span class="side__badge">${badges[n.badge]}</span>` : ''
          }</a>`
    )
    .join('');
  $('#nav').innerHTML = html;
  markCurrent();
}

function markCurrent() {
  const current = location.hash.slice(2).split(/[/?]/)[0] || 'dashboard';
  for (const a of document.querySelectorAll('#nav .side__link')) {
    if (a.dataset.path === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

// Sidebar counters: new orders, low stock, reviews waiting. Refreshed on every route.
async function refreshBadges() {
  try {
    const d = await api('/api/admin/dashboard?days=1');
    badges.orders = d.open.new || 0;
    badges.stock = d.lowStock.length;
    badges.reviews = d.pendingReviews;
    renderNav();
  } catch {
    /* the page itself reports errors */
  }
}

async function route() {
  if (!me) return;
  // #/orders/12?status=new → path 'orders', params ['12'], query { status: 'new' }
  const [pathPart, queryPart = ''] = location.hash.slice(2).split('?');
  const [path = 'dashboard', ...params] = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  const entry = NAV.find((n) => n.path === path && n.load) || NAV[1];
  document.body.classList.remove('side-open');
  markCurrent();
  if (entry.perm && !can(entry.perm)) {
    go('dashboard');
    return;
  }
  cleanup?.();
  cleanup = null;
  const view = $('#view');
  $('#pageTitle').textContent = entry.label;
  document.title = `${entry.label} — PINEPOP ადმინი`;
  view.innerHTML = '<div class="empty">იტვირთება…</div>';
  try {
    const mod = await entry.load();
    view.innerHTML = '';
    cleanup = (await mod.render(view, { params, query, me, can, go, refreshBadges })) || null;
    hydrateIcons(view);
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    view.innerHTML = `<div class="card"><div class="empty"><b>ვერ ჩაიტვირთა</b>${esc(err.message)}</div></div>`;
  }
  refreshBadges();
}

// ---------- session ----------

function showLogin() {
  me = null;
  $('#appView').hidden = true;
  $('#loginView').hidden = false;
  $('#loginForm').elements.username.focus();
}

async function showApp() {
  me = await api('/api/admin/me');
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  const initial = (me.name || me.username).trim()[0]?.toUpperCase() || '?';
  $('#whoami').innerHTML = `<span class="avatar">${esc(initial)}</span><span>${esc(me.name || me.username)}</span>`;
  renderNav();
  if (!location.hash) location.hash = '#/dashboard';
  else route();
}

setUnauthorizedHandler(showLogin);

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const btn = e.target.querySelector('button');
  $('#loginError').textContent = '';
  btn.disabled = true;
  try {
    await api('/api/admin/login', { method: 'POST', body: { username: f.username.value.trim(), password: f.password.value } });
    f.password.value = '';
    await showApp();
  } catch (err) {
    $('#loginError').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// ---------- chrome ----------

$('#menuBtn').addEventListener('click', () => document.body.classList.toggle('side-open'));
$('#sideScrim').addEventListener('click', () => document.body.classList.remove('side-open'));

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function paintThemeButton() {
  const btn = $('#themeBtn');
  btn.innerHTML = icon(currentTheme() === 'dark' ? 'sun' : 'moon');
}
$('#themeBtn').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('pp-admin-theme', next);
  } catch {}
  paintThemeButton(); // charts take their colour from CSS variables, so nothing to redraw
});

window.addEventListener('hashchange', route);
hydrateIcons();
paintThemeButton();

api('/api/admin/me')
  .then(showApp)
  .catch((err) => {
    if (err.status !== 401) toast(err.message, { error: true });
    showLogin();
  });
