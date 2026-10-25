// Fills the page with the texts/options the owner sets in the admin panel.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const gel = (n) => `${Number.isInteger(n) ? n : n.toFixed(2)} ₾`;

// "თბილისი" → "თბილისში", "მცხეთა" → "მცხეთაში"
export const inCity = (city) => (city.endsWith('ი') ? city.slice(0, -1) : city) + 'ში';

export function deliveryText(settings) {
  const places = settings.deliveryCities.map(inCity);
  const where = places.length > 1 ? `${places.slice(0, -1).join(', ')} და ${places.at(-1)}` : places[0];
  const fee = settings.deliveryFee > 0 ? gel(settings.deliveryFee) : 'უფასოდ';
  return { where, fee, time: settings.deliveryTime, line: `${where} — ${fee}, ${settings.deliveryTime}` };
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

export function applySettings(settings, products) {
  const s = settings;
  const brand = `${s.brandBold}${s.brandItalic}`;

  document.title = `${brand} — ანანასი Kool-Aid-ის ფხვნილით`;
  document.querySelectorAll('[data-brand="split"]').forEach((el) => {
    el.innerHTML = `${esc(s.brandBold)}${s.brandItalic ? `<em>${esc(s.brandItalic)}</em>` : ''}`;
  });
  document.querySelectorAll('[data-brand="full"]').forEach((el) => (el.textContent = brand));
  document.querySelectorAll('[data-brand="lower"]').forEach((el) => (el.textContent = brand.toLowerCase()));
  // giant wordmarks shrink for longer names so they always fit the width
  document.querySelectorAll('[data-brand="giant"]').forEach((el) => {
    el.textContent = brand;
    el.style.fontSize = `min(29vw, ${(205 / Math.max(brand.length, 4)).toFixed(1)}vw)`;
  });

  const delivery = deliveryText(s);

  // stats
  const flavors = document.getElementById('statFlavors');
  flavors.dataset.count = flavors.textContent = products.length;
  const size = document.getElementById('statSize');
  size.dataset.count = size.textContent = s.jarSizeMl;
  const fee = document.getElementById('statFee');
  fee.dataset.count = fee.textContent = Math.round(s.deliveryFee);
  set('statFeeLabel', `₾ — მიწოდება ${delivery.where}`);

  // shop
  document.getElementById('shopMeta').innerHTML = [
    `${s.jarSizeMl} მლ`,
    'ახლად დამზადებული',
    `მაცივარში — ${s.shelfLifeDays} დღე`,
    s.deliveryFee > 0 ? `მიწოდება ${delivery.where} — ${delivery.fee}` : `უფასო მიწოდება ${delivery.where}`,
  ]
    .map((t) => `<li>${esc(t)}</li>`)
    .join('');
  set('shopNote', `მიწოდება ${delivery.line}. გადახდა — მიტანისას (ნაღდი ან ბარათი).`);
  set('checkoutDelivery', `🚚 მიწოდება ${delivery.line}`);
  set('menuDelivery', `მიწოდება ${delivery.line}`);

  // footer
  set('footerDelivery', `${delivery.line}. სხვა ქალაქებში ჯერ არ ვაწვდით.`);
  const contact = [];
  if (s.phone) {
    const pretty = s.phone.replace(/^\+995(\d{3})(\d{2})(\d{2})(\d{2})$/, '+995 $1 $2 $3 $4');
    contact.push([pretty, `tel:${s.phone}`], ['WhatsApp', `https://wa.me/${s.phone.replace('+', '')}`]);
  }
  links(document.getElementById('footerContactLinks'), contact);
  links(
    document.getElementById('footerSocialLinks'),
    [
      ['Facebook', s.facebook],
      ['TikTok', s.tiktok],
      ['Instagram', s.instagram],
    ].filter(([, href]) => href)
  );
}
