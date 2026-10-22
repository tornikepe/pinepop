import { HttpError, cleanText, normalizePhone } from './http.js';

// Everything the owner can change from the admin panel's "პარამეტრები" tab.
// All of it is public (it is shown on the site), so no secrets belong here.
export const SETTINGS = {
  brandBold: { label: 'სახელი (სქელი ნაწილი)', type: 'text', max: 16, required: true, default: 'PINE' },
  brandItalic: { label: 'სახელი (დახრილი ნაწილი)', type: 'text', max: 16, default: 'POP' },
  jarSizeMl: { label: 'ქილის მოცულობა', type: 'int', min: 50, max: 5000, default: 720 },
  shelfLifeDays: { label: 'შენახვის ვადა', type: 'int', min: 1, max: 365, default: 5 },
  deliveryCities: { label: 'მიწოდების ქალაქები', type: 'list', maxItems: 15, default: ['თბილისი'] },
  deliveryFee: { label: 'მიწოდების ფასი', type: 'money', min: 0, max: 200, default: 0 },
  deliveryTime: { label: 'მიწოდების დრო', type: 'text', max: 40, required: true, default: 'იმავე დღეს' },
  phone: { label: 'ტელეფონი / WhatsApp', type: 'phone', default: '' },
  facebook: { label: 'Facebook', type: 'url', default: '' },
  tiktok: { label: 'TikTok', type: 'url', default: '' },
  instagram: { label: 'Instagram', type: 'url', default: '' },
};

function validate(key, raw) {
  const def = SETTINGS[key];
  const fail = (msg) => {
    throw new HttpError(400, `${def.label}: ${msg}`);
  };

  switch (def.type) {
    case 'text': {
      const v = cleanText(raw, def.max);
      if (def.required && !v) fail('ცარიელი არ უნდა იყოს');
      return v;
    }
    case 'int': {
      const v = Number(raw);
      if (!Number.isInteger(v) || v < def.min || v > def.max) fail(`მთელი რიცხვი ${def.min}–${def.max}`);
      return v;
    }
    case 'money': {
      const v = Math.round(Number(raw) * 100) / 100;
      if (!Number.isFinite(v) || v < def.min || v > def.max) fail(`${def.min}–${def.max} ₾`);
      return v;
    }
    case 'list': {
      const items = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
        .map((s) => cleanText(String(s), 40))
        .filter(Boolean);
      const unique = [...new Set(items)];
      if (!unique.length) fail('მინიმუმ ერთი');
      if (unique.length > def.maxItems) fail(`მაქსიმუმ ${def.maxItems}`);
      return unique;
    }
    case 'phone': {
      if (!String(raw ?? '').trim()) return '';
      return normalizePhone(raw) || fail('ქართული მობილური, მაგ. 599 12 34 56');
    }
    case 'url': {
      let v = String(raw ?? '').trim();
      if (!v) return '';
      if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
      let url;
      try {
        url = new URL(v);
      } catch {
        fail('არასწორი ბმული');
      }
      if (!['http:', 'https:'].includes(url.protocol) || v.length > 200) fail('არასწორი ბმული');
      return url.href;
    }
  }
}

export function getSettings(db) {
  const out = Object.fromEntries(Object.entries(SETTINGS).map(([k, d]) => [k, d.default]));
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
    if (key in SETTINGS) out[key] = JSON.parse(value);
  }
  return out;
}

// Validates every known key in `input` first, then writes them all at once.
export function saveSettings(db, input) {
  const clean = {};
  for (const key of Object.keys(SETTINGS)) {
    if (input && key in input) clean[key] = validate(key, input[key]);
  }
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(clean)) upsert.run(key, JSON.stringify(value));
  return getSettings(db);
}
