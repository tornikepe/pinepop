import { HttpError, cleanText, normalizePhone } from './http.js';

// Shop options edited in Admin → პარამეტრები. All of it is shown on the site,
// so nothing secret belongs here (secrets go in the `meta` table).
export const SETTINGS = {
  brandBold: { label: 'სახელი (სქელი ნაწილი)', type: 'text', max: 16, required: true, default: 'PINE' },
  brandItalic: { label: 'სახელი (დახრილი ნაწილი)', type: 'text', max: 16, default: 'POP' },
  jarSizeMl: { label: 'ქილის მოცულობა', type: 'int', min: 50, max: 5000, default: 720 },
  shelfLifeDays: { label: 'შენახვის ვადა', type: 'int', min: 1, max: 365, default: 5 },
  shopOpen: { label: 'შეკვეთების მიღება', type: 'bool', default: true },
  closedMessage: {
    label: 'შეტყობინება, როცა შეკვეთები გაჩერებულია',
    type: 'text',
    max: 200,
    default: 'ამ დღეებში შეკვეთებს არ ვიღებთ — მალე დავბრუნდებით 🍍',
  },
  minOrder: { label: 'მინიმალური შეკვეთა', type: 'money', min: 0, max: 1000, default: 0 },
  maxPerFlavor: { label: 'მაქსიმუმ ქილა ერთ გემოზე', type: 'int', min: 1, max: 100, default: 20 },
  reviewsEnabled: { label: 'შეფასებების მიღება', type: 'bool', default: true },
  phone: { label: 'ტელეფონი / WhatsApp', type: 'phone', default: '' },
  email: { label: 'ელფოსტა', type: 'email', default: '' },
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
    case 'bool':
      return raw === true || raw === 'true' || raw === 'on' || raw === 1;
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
    case 'phone': {
      if (!String(raw ?? '').trim()) return '';
      return normalizePhone(raw) || fail('ქართული მობილური, მაგ. 599 12 34 56');
    }
    case 'email': {
      const v = String(raw ?? '').trim();
      if (!v) return '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 120) fail('არასწორი მისამართი');
      return v;
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

export async function getSettings(db) {
  const out = Object.fromEntries(Object.entries(SETTINGS).map(([k, d]) => [k, d.default]));
  for (const { key, value } of await db.query('SELECT key, value FROM settings')) {
    if (key in SETTINGS) out[key] = value;
  }
  return out;
}

// Validates every known key in `input` first, then writes them all.
// Returns the keys whose value actually changed, for the audit log.
export async function saveSettings(db, input) {
  const before = await getSettings(db);
  const clean = {};
  for (const key of Object.keys(SETTINGS)) {
    if (input && key in input) clean[key] = validate(key, input[key]);
  }
  const changes = {};
  for (const [key, value] of Object.entries(clean)) {
    if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
    changes[key] = { from: before[key], to: value };
    await db.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)]
    );
  }
  return { settings: await getSettings(db), changes };
}
