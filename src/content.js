// Fills the page with what the owner edits in the admin: texts, brand, jar, delivery
// zones, contacts, reviews and FAQ. Runs once, before the animations measure the page.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const gel = (n) => `${Number.isInteger(n) ? n : n.toFixed(2)} ₾`;

// "თბილისი" → "თბილისში", "მცხეთა" → "მცხეთაში"
export const inCity = (city) => (city.endsWith('ი') ? city.slice(0, -1) : city) + 'ში';

const joinPlaces = (places) => (places.length > 1 ? `${places.slice(0, -1).join(', ')} და ${places.at(-1)}` : places[0] || '');

// One line about delivery for the whole site, from the active zones.
export function deliveryText(zones) {
  if (!zones.length) return { where: '', line: '' };
  const where = joinPlaces(zones.map((z) => inCity(z.name)));
  if (zones.length === 1) {
    const z = zones[0];
    const fee = z.fee > 0 ? gel(z.fee) : 'უფასოდ';
    const free = z.fee > 0 && z.freeAbove != null ? `, ${gel(z.freeAbove)}-დან უფასოდ` : '';
    return { where, line: `${where} — ${fee}${free}${z.eta ? `, ${z.eta}` : ''}` };
  }
  const fees = zones.map((z) => z.fee);
  const [min, max] = [Math.min(...fees), Math.max(...fees)];
  const fee = max === 0 ? 'უფასოდ' : min === max ? gel(min) : `${min === 0 ? 'უფასოდ' : gel(min)} – ${gel(max)}`;
  return { where, line: `${where} — ${fee}, ზონის მიხედვით` };
}

const set = (id, text) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

function links(container, items) {
  container.innerHTML = items
    .map(([label, href]) => {
      const external = href.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(href)}"${external}>${esc(label)}</a>`;
    })
    .join('');
  container.parentElement.hidden = items.length === 0;
}

const stars = (n) => `<span class="stars" aria-label="${n} / 5">${'★'.repeat(n)}<span>${'★'.repeat(5 - n)}</span></span>`;

export function applySite({ settings: s, content, products, zones, faqs, reviews }) {
  const brand = `${s.brandBold}${s.brandItalic}`;
  const t = (key) => String(content[key] ?? '').replaceAll('{brand}', brand);

  // every element tagged data-text="key" takes its text from the admin
  document.querySelectorAll('[data-text]').forEach((el) => {
    const v = t(el.dataset.text);
    if (v) el.textContent = v;
  });

  document.title = t('seo.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('seo.description'));
  document.querySelectorAll('[data-brand="split"]').forEach((el) => {
    el.innerHTML = `${esc(s.brandBold)}${s.brandItalic ? `<em>${esc(s.brandItalic)}</em>` : ''}`;
  });
  // giant wordmarks shrink for longer names so they always fit the width
  document.querySelectorAll('[data-brand="giant"]').forEach((el) => {
    el.textContent = brand;
    el.style.fontSize = `min(29vw, ${(205 / Math.max(brand.length, 4)).toFixed(1)}vw)`;
  });

  // marquee rows: comma-separated words with a ✦ between them
  document.querySelectorAll('[data-words]').forEach((track) => {
    const words = t(track.dataset.words)
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length) track.innerHTML = words.map((w) => `<span>${esc(w)}</span><i>✦</i>`).join('');
  });

  // stats
  const stat = (id, value) => {
    const el = document.getElementById(id);
    el.dataset.count = el.textContent = value;
  };
  stat('statFlavors', products.length);
  stat('statSize', s.jarSizeMl);
  stat('statDays', s.shelfLifeDays);

  const delivery = deliveryText(zones);
  const allFree = zones.every((z) => z.fee === 0);

  // shop
  document.getElementById('shopMeta').innerHTML = [
    `${s.jarSizeMl} მლ`,
    t('shop.fresh'),
    `მაცივარში — ${s.shelfLifeDays} დღე`,
    allFree ? `უფასო მიწოდება ${delivery.where}` : `მიწოდება ${delivery.where}`,
  ]
    .map((x) => `<li>${esc(x)}</li>`)
    .join('');
  set('shopNote', `მიწოდება ${delivery.line}. ${t('shop.payment')}`);
  set('checkoutDelivery', `🚚 მიწოდება ${delivery.line}`);
  set('menuDelivery', `მიწოდება ${delivery.line}`);
  set('footerDelivery', `${delivery.line}.`);

  // contacts
  const contact = [];
  if (s.phone) {
    const pretty = s.phone.replace(/^\+995(\d{3})(\d{2})(\d{2})(\d{2})$/, '+995 $1 $2 $3 $4');
    contact.push([pretty, `tel:${s.phone}`], ['WhatsApp', `https://wa.me/${s.phone.replace('+', '')}`]);
  }
  if (s.email) contact.push([s.email, `mailto:${s.email}`]);
  links(document.getElementById('footerContactLinks'), contact);
  links(
    document.getElementById('footerSocialLinks'),
    [
      ['Facebook', s.facebook],
      ['TikTok', s.tiktok],
      ['Instagram', s.instagram],
    ].filter(([, href]) => href)
  );

  // reviews: the section only exists when something is published
  const reviewsEl = document.getElementById('reviews');
  if (!reviews.count) {
    reviewsEl.remove();
  } else {
    set('reviewScore', `★ ${reviews.average} · ${reviews.count} შეფასება`);
    document.getElementById('reviewList').innerHTML = reviews.items
      .map(
        (r) => `<figure class="review">
          ${stars(r.rating)}
          <blockquote>${esc(r.body)}</blockquote>
          <figcaption><b>${esc(r.name)}</b>${r.flavors ? ` · ${esc(r.flavors)}` : ''}</figcaption>
          ${r.reply ? `<p class="review__reply"><b>${esc(brand)}:</b> ${esc(r.reply)}</p>` : ''}
        </figure>`
      )
      .join('');
  }

  // FAQ as native disclosure widgets (keyboard and screen readers for free)
  const faqEl = document.getElementById('faq');
  if (!faqs.length) {
    faqEl.remove();
    document.querySelectorAll('a[href="#faq"]').forEach((a) => a.remove());
  } else {
    document.getElementById('faqList').innerHTML = faqs
      .map((f) => `<details class="faq__item"><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`)
      .join('');
  }

  return { t, brand };
}
