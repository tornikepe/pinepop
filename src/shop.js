import gsap from 'gsap';
import { esc, gel, inCity } from './content.js';

export async function loadSite() {
  const res = await fetch('/api/site');
  if (!res.ok) throw new Error('site');
  return res.json();
}

export function initShop({ products, settings, scene, lenis }) {
  const qty = new Map(products.map((p) => [p.id, 0]));
  const fee = settings.deliveryFee;
  const flavorList = document.getElementById('flavorList');
  const rows = document.getElementById('shopRows');
  const totalEl = document.getElementById('shopTotal');
  const buyBtn = document.getElementById('buyBtn');
  const navCount = document.getElementById('navCount');
  const root = document.documentElement;

  // ---------- flavour picker (drives the 3D jar + page accent) ----------

  flavorList.innerHTML = products
    .map(
      (p) => `
      <button class="flavor" role="radio" aria-checked="false" data-id="${p.id}" style="--c:${esc(p.color)}">
        <span class="flavor__dot"></span>
        <span>
          <span class="flavor__name">${esc(p.flavor)}</span>
          <span class="flavor__desc">${esc(p.description)}</span>
        </span>
        <span class="flavor__arrow">→</span>
      </button>`
    )
    .join('');

  function selectFlavor(id) {
    const p = products.find((x) => x.id === id) || products[0];
    flavorList.querySelectorAll('.flavor').forEach((el) => el.setAttribute('aria-checked', String(Number(el.dataset.id) === p.id)));
    scene.setFlavor(p.color, p.flavor);
    gsap.to(root, { '--accent': p.color, duration: 0.6, ease: 'power2.out' });
  }

  flavorList.addEventListener('click', (e) => {
    const btn = e.target.closest('.flavor');
    if (btn) selectFlavor(Number(btn.dataset.id));
  });

  // ---------- quantities ----------

  rows.innerHTML = products
    .map(
      (p) => `
      <div class="row" style="--c:${esc(p.color)}" data-id="${p.id}">
        <span class="row__dot"></span>
        <span class="row__name">${esc(p.flavor)}
          <span class="row__stock">${p.stock > 0 ? `${settings.jarSizeMl} მლ` : 'ამოიწურა'}</span>
        </span>
        <span class="row__price">${gel(p.price)}</span>
        <span class="stepper">
          <button type="button" data-step="-1" aria-label="${esc(p.flavor)} — შემცირება">−</button>
          <output>0</output>
          <button type="button" data-step="1" aria-label="${esc(p.flavor)} — გაზრდა" ${p.stock > 0 ? '' : 'disabled'}>+</button>
        </span>
      </div>`
    )
    .join('');

  function cart() {
    return products.filter((p) => qty.get(p.id) > 0).map((p) => ({ product: p, qty: qty.get(p.id) }));
  }

  function totals() {
    const items = cart();
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    return { items, count, total: subtotal + (count ? fee : 0) };
  }

  function refresh() {
    const { total, count } = totals();
    totalEl.textContent = gel(total);
    navCount.textContent = count;
    buyBtn.disabled = count === 0;
    buyBtn.textContent = count ? `ყიდვა — ${gel(total)}` : 'აირჩიე რაოდენობა';
    rows.querySelectorAll('.row').forEach((row) => {
      const p = products.find((x) => x.id === Number(row.dataset.id));
      const n = qty.get(p.id);
      row.querySelector('output').textContent = n;
      row.querySelector('[data-step="-1"]').disabled = n === 0;
      row.querySelector('[data-step="1"]').disabled = n >= Math.min(20, p.stock);
    });
  }

  rows.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    const row = btn.closest('.row');
    const id = Number(row.dataset.id);
    qty.set(id, Math.max(0, qty.get(id) + Number(btn.dataset.step)));
    if (Number(btn.dataset.step) > 0) selectFlavor(id);
    refresh();
  });

  // ---------- checkout drawer ----------

  const drawer = document.getElementById('checkout');
  const form = document.getElementById('checkoutForm');
  const summary = document.getElementById('checkoutSummary');
  const errorEl = document.getElementById('checkoutError');
  const submitBtn = document.getElementById('checkoutSubmit');
  const success = document.getElementById('checkoutSuccess');
  const successCode = document.getElementById('successCode');
  const cityField = document.getElementById('cityField');
  const citySelect = document.getElementById('citySelect');
  const addressLabel = document.getElementById('addressLabel');
  let lastFocus = null;

  // A city picker only appears when delivery goes to more than one city.
  const cities = settings.deliveryCities;
  citySelect.innerHTML = cities.map((c) => `<option>${esc(c)}</option>`).join('');
  cityField.hidden = cities.length < 2;
  const showCity = () => (addressLabel.textContent = `მისამართი ${inCity(citySelect.value)}`);
  citySelect.addEventListener('change', showCity);
  showCity();

  function openDrawer() {
    const { items, total } = totals();
    if (!items.length) return;
    summary.innerHTML =
      items.map((i) => `<li><span>${esc(i.product.flavor)} × ${i.qty}</span><span>${gel(i.product.price * i.qty)}</span></li>`).join('') +
      `<li><span>მიწოდება</span><span>${fee > 0 ? gel(fee) : 'უფასო'}</span></li>` +
      `<li class="total"><span>სულ</span><span>${gel(total)}</span></li>`;
    form.hidden = false;
    success.hidden = true;
    errorEl.textContent = '';
    lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    lenis?.stop();
    setTimeout(() => form.elements.name.focus(), 350);
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    lenis?.start();
    lastFocus?.focus?.();
  }

  buyBtn.addEventListener('click', openDrawer);
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    const phoneOk = /^5\d{8}$/.test(String(data.phone).replace(/[\s\-().]/g, '').replace(/^\+?995/, ''));
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('is-invalid'));
    const bad = [];
    if (String(data.name).trim().length < 2) bad.push('name');
    if (!phoneOk) bad.push('phone');
    if (String(data.address).trim().length < 4) bad.push('address');
    if (bad.length) {
      bad.forEach((n) => form.elements[n].closest('.field').classList.add('is-invalid'));
      errorEl.textContent = bad.includes('phone') && bad.length === 1 ? 'ტელეფონის ნომერი არასწორია (მაგ. 555 12 34 56)' : 'შეავსე მონიშნული ველები';
      form.elements[bad[0]].focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'იგზავნება…';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: data,
          items: cart().map((i) => ({ productId: i.product.id, qty: i.qty })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'შეკვეთა ვერ გაიგზავნა');

      successCode.textContent = body.code;
      form.hidden = true;
      success.hidden = false;
      form.reset();
      showCity();
      cart().forEach((i) => {
        i.product.stock -= i.qty;
        qty.set(i.product.id, 0);
      });
      refresh();
    } catch (err) {
      errorEl.textContent = err.message || 'შეკვეთა ვერ გაიგზავნა. სცადე თავიდან.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'შეკვეთის დადასტურება';
    }
  });

  selectFlavor(products[0]?.id);
  refresh();
}
