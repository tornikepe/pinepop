import { esc, gel } from './content.js';
import { createDrawer, phoneOk, postJson } from './drawer.js';

const ORDER = ['new', 'confirmed', 'delivering', 'delivered'];
const LABELS = { new: 'მიღებულია', confirmed: 'დადასტურებულია', delivering: 'გზაშია', delivered: 'მიწოდებულია' };

// built by hand: not every browser ships Georgian month names
const MONTHS = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
const time = (v) => {
  const d = new Date(v);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// "Where is my jar?" — order number + phone → status steps, items, and once the
// order is delivered, a review form (one per order, published after moderation).
export function initTrack(lenis) {
  const el = document.getElementById('track');
  const form = document.getElementById('trackForm');
  const errorEl = document.getElementById('trackError');
  const result = document.getElementById('trackResult');
  const drawer = createDrawer(el, lenis, { onOpen: () => setTimeout(() => form.elements.code.focus(), 350) });
  let lookup = null;

  document.querySelectorAll('[data-open-track]').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.body.classList.contains('menu-open') && document.getElementById('menuBtn').click();
      drawer.open();
    })
  );

  function render(o) {
    const cancelled = o.status === 'cancelled';
    const reached = new Map(o.timeline.map((s) => [s.status, s.at]));
    const steps = cancelled
      ? `<li class="is-done"><b>მიღებულია</b><small>${time(o.createdAt)}</small></li>
         <li class="is-done is-cancelled"><b>გაუქმებულია</b><small>${time(reached.get('cancelled'))}</small></li>`
      : ORDER.map((s) => {
          const at = reached.get(s);
          const current = s === o.status;
          return `<li class="${at ? 'is-done' : ''} ${current ? 'is-current' : ''}"><b>${LABELS[s]}</b>${at ? `<small>${time(at)}</small>` : ''}</li>`;
        }).join('');

    result.innerHTML = `
      <div class="track__head"><span class="success__code">${esc(o.code)}</span><span class="track__status">${esc(o.statusLabel)}</span></div>
      <ol class="track__steps">${steps}</ol>
      <ul class="checkout__summary">${o.items
        .map((i) => `<li><span>${esc(i.flavor)} × ${i.qty}</span><span>${gel(i.price * i.qty)}</span></li>`)
        .join('')}${o.discount ? `<li class="discount"><span>ფასდაკლება</span><span>−${gel(o.discount)}</span></li>` : ''}
        <li><span>მიწოდება</span><span>${o.shipping ? gel(o.shipping) : 'უფასო'}</span></li>
        <li class="total"><span>სულ</span><span>${gel(o.total)}</span></li></ul>
      ${
        o.canReview
          ? `<form class="review-form" id="reviewForm" novalidate>
              <p class="eyebrow">შეაფასე</p>
              <div class="rate" role="radiogroup" aria-label="შეფასება">${[1, 2, 3, 4, 5]
                .map((n) => `<button type="button" role="radio" aria-checked="${n === 5}" data-r="${n}" aria-label="${n}">★</button>`)
                .join('')}</div>
              <label class="field"><span>სახელი <small>(საიტზე ჩანს)</small></span><input name="name" maxlength="40" value="${esc(o.name.split(' ')[0])}" /></label>
              <label class="field"><span>როგორი იყო?</span><textarea name="body" rows="3" maxlength="600" required></textarea></label>
              <p class="checkout__error" id="reviewError" role="alert"></p>
              <button class="btn btn--accent btn--block" type="submit">შეფასების გაგზავნა</button>
            </form>`
          : ''
      }
      <button class="btn btn--ghost btn--block" type="button" id="trackAgain" style="margin-top:12px">სხვა შეკვეთა</button>`;

    result.querySelector('#trackAgain').onclick = () => {
      result.hidden = true;
      form.hidden = false;
      form.reset();
      form.elements.code.focus();
    };

    const rf = result.querySelector('#reviewForm');
    if (!rf) return;
    let rating = 5;
    const paint = () => rf.querySelectorAll('[data-r]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.r) <= rating));
    paint();
    rf.querySelector('.rate').onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      rating = Number(b.dataset.r);
      rf.querySelectorAll('[data-r]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      paint();
    };
    rf.onsubmit = async (e) => {
      e.preventDefault();
      const btn = rf.querySelector('[type=submit]');
      const err = rf.querySelector('#reviewError');
      err.textContent = '';
      btn.disabled = true;
      try {
        await postJson('/api/reviews', { ...lookup, rating, name: rf.elements.name.value, body: rf.elements.body.value });
        rf.outerHTML = '<p class="note-ok">მადლობა! შეფასება გამოჩნდება საიტზე მოდერაციის შემდეგ 🍍</p>';
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const code = form.elements.code.value.trim().toUpperCase();
    const phone = form.elements.phone.value;
    if (!code || !phoneOk(phone)) {
      errorEl.textContent = 'შეიყვანე შეკვეთის ნომერი და სწორი ტელეფონი';
      return;
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      lookup = { code, phone };
      const order = await postJson('/api/track', lookup);
      form.hidden = true;
      result.hidden = false;
      render(order);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}
