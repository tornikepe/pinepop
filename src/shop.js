import gsap from 'gsap';
import { esc, gel, inCity } from './content.js';
import { createDrawer, phoneOk, postJson } from './drawer.js';

export async function loadSite() {
  const res = await fetch('/api/site');
  if (!res.ok) throw new Error('site');
  return res.json();
}

export function initShop({ site, t, scene, lenis }) {
  const { products, settings, zones } = site;
  const qty = new Map(products.map((p) => [p.id, 0]));
  const maxPer = settings.maxPerFlavor;
  const flavorList = document.getElementById('flavorList');
  const rows = document.getElementById('shopRows');
  const totalEl = document.getElementById('shopTotal');
  const buyBtn = document.getElementById('buyBtn');
  const navCount = document.getElementById('navCount');
  const closedEl = document.getElementById('shopClosed');
  const root = document.documentElement;

  // the zone the customer picks in the checkout; the first one until then
  let zone = zones[0] || { id: null, name: '', fee: 0, freeAbove: null, eta: '' };
  let coupon = null; // { code, discount, label } once applied

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
          <span class="row__stock">${p.stock > 0 ? `${settings.jarSizeMl} მლ${p.stock <= 5 ? ` · დარჩა ${p.stock}` : ''}` : 'ამოიწურა'}</span>
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

  const cart = () => products.filter((p) => qty.get(p.id) > 0).map((p) => ({ product: p, qty: qty.get(p.id) }));

  // the same arithmetic the server does; the server's answer is the one that counts
  function totals() {
    const items = cart();
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
    const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
    const shipping = !count ? 0 : zone.freeAbove != null && subtotal >= zone.freeAbove ? 0 : zone.fee;
    return { items, count, subtotal, discount, shipping, total: subtotal - discount + shipping };
  }

  function refresh() {
    const { total, count, subtotal } = totals();
    const short = settings.minOrder > 0 && count > 0 && subtotal < settings.minOrder;
    totalEl.textContent = gel(total);
    navCount.textContent = count;
    buyBtn.disabled = !settings.shopOpen || count === 0 || short;
    buyBtn.textContent = !settings.shopOpen
      ? 'შეკვეთები დროებით გაჩერებულია'
      : short
        ? `მინიმალური შეკვეთა — ${gel(settings.minOrder)}`
        : count
          ? `${t('shop.buy')} — ${gel(total)}`
          : t('shop.pick');
    rows.querySelectorAll('.row').forEach((row) => {
      const p = products.find((x) => x.id === Number(row.dataset.id));
      const n = qty.get(p.id);
      row.querySelector('output').textContent = n;
      row.querySelector('[data-step="-1"]').disabled = n === 0;
      row.querySelector('[data-step="1"]').disabled = n >= Math.min(maxPer, p.stock);
    });
  }

  rows.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    const id = Number(btn.closest('.row').dataset.id);
    qty.set(id, Math.max(0, qty.get(id) + Number(btn.dataset.step)));
    if (Number(btn.dataset.step) > 0) selectFlavor(id);
    coupon = null; // a coupon is checked against the basket it was applied to
    refresh();
  });

  if (!settings.shopOpen) {
    closedEl.hidden = false;
    closedEl.textContent = settings.closedMessage;
  }

  // ---------- checkout drawer ----------

  const form = document.getElementById('checkoutForm');
  const summary = document.getElementById('checkoutSummary');
  const errorEl = document.getElementById('checkoutError');
  const submitBtn = document.getElementById('checkoutSubmit');
  const success = document.getElementById('checkoutSuccess');
  const successCode = document.getElementById('successCode');
  const zoneField = document.getElementById('zoneField');
  const zoneSelect = document.getElementById('zoneSelect');
  const addressLabel = document.getElementById('addressLabel');
  const couponInput = document.getElementById('couponInput');
  const couponApply = document.getElementById('couponApply');
  const couponMsg = document.getElementById('couponMsg');

  // A zone picker only appears when there is more than one delivery zone.
  zoneSelect.innerHTML = zones
    .map((z) => `<option value="${z.id}">${esc(z.name)} — ${z.fee > 0 ? gel(z.fee) : 'უფასო'}${z.eta ? ` · ${esc(z.eta)}` : ''}</option>`)
    .join('');
  zoneField.hidden = zones.length < 2;
  const showZone = () => {
    zone = zones.find((z) => z.id === Number(zoneSelect.value)) || zones[0] || zone;
    addressLabel.textContent = zone.name ? `მისამართი ${inCity(zone.name)}` : 'მისამართი';
  };
  zoneSelect.addEventListener('change', () => {
    showZone();
    renderSummary();
    refresh();
  });
  showZone();

  function renderSummary() {
    const s = totals();
    const free = zone.freeAbove != null && zone.fee > 0 && s.subtotal < zone.freeAbove;
    summary.innerHTML =
      s.items.map((i) => `<li><span>${esc(i.product.flavor)} × ${i.qty}</span><span>${gel(i.product.price * i.qty)}</span></li>`).join('') +
      (s.discount ? `<li class="discount"><span>პრომოკოდი ${esc(coupon.code)} (${esc(coupon.label)})</span><span>−${gel(s.discount)}</span></li>` : '') +
      `<li><span>მიწოდება${zone.name ? ` (${esc(zone.name)})` : ''}</span><span>${s.shipping > 0 ? gel(s.shipping) : 'უფასო'}</span></li>` +
      (free ? `<li class="hint"><span>${gel(zone.freeAbove)}-დან მიწოდება უფასოა</span><span></span></li>` : '') +
      `<li class="total"><span>სულ</span><span>${gel(s.total)}</span></li>`;
  }

  async function applyCoupon() {
    const code = couponInput.value.trim();
    couponMsg.className = 'coupon__msg';
    if (!code) {
      coupon = null;
      couponMsg.textContent = '';
      renderSummary();
      refresh();
      return;
    }
    couponApply.disabled = true;
    try {
      coupon = await postJson('/api/coupons/check', { code, subtotal: totals().subtotal });
      couponMsg.textContent = `✓ ${coupon.code} — ფასდაკლება ${gel(coupon.discount)}`;
      couponMsg.classList.add('is-ok');
    } catch (err) {
      coupon = null;
      couponMsg.textContent = err.message;
      couponMsg.classList.add('is-bad');
    } finally {
      couponApply.disabled = false;
      renderSummary();
      refresh();
    }
  }
  couponApply.addEventListener('click', applyCoupon);
  couponInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCoupon();
    }
  });

  const drawer = createDrawer(document.getElementById('checkout'), lenis, {
    onOpen: () => setTimeout(() => form.elements.name.focus(), 350),
  });

  buyBtn.addEventListener('click', () => {
    if (!cart().length) return;
    form.hidden = false;
    success.hidden = true;
    errorEl.textContent = '';
    if (!coupon) {
      couponInput.value = '';
      couponMsg.textContent = '';
    }
    renderSummary();
    drawer.open();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('is-invalid'));
    const bad = [];
    if (String(data.name).trim().length < 2) bad.push('name');
    if (!phoneOk(data.phone)) bad.push('phone');
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
      const order = await postJson('/api/orders', {
        customer: { name: data.name, phone: data.phone, address: data.address, note: data.note, zoneId: zone.id },
        items: cart().map((i) => ({ productId: i.product.id, qty: i.qty })),
        coupon: coupon?.code || '',
      });
      successCode.textContent = order.code;
      form.hidden = true;
      success.hidden = false;
      form.reset();
      showZone();
      cart().forEach((i) => {
        i.product.stock -= i.qty;
        qty.set(i.product.id, 0);
      });
      coupon = null;
      refresh();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t('checkout.submit');
    }
  });

  selectFlavor(products[0]?.id);
  refresh();
}
