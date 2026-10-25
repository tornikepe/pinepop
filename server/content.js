import { HttpError } from './http.js';

// Every text on the storefront, edited in Admin → ტექსტები. The page carries the same
// defaults in its HTML; a saved value replaces them. `{brand}` is replaced with the shop name.
// `lines: true` fields are textareas; `max` is a hard limit enforced on save.
export const CONTENT = [
  // ---- hero
  { key: 'hero.eyebrow', group: 'მთავარი ეკრანი', label: 'პატარა წარწერა', default: 'ანანასი × Kool-Aid', max: 60 },
  {
    key: 'hero.lead',
    group: 'მთავარი ეკრანი',
    label: 'მთავარი ტექსტი',
    lines: true,
    max: 260,
    default: 'ახლად დაჭრილი ანანასი, Kool-Aid-ის ფხვნილში ამოვლებული. ტკბილი, მჟავე და სრულიად ახალი გემო — ერთ ქილაში.',
  },
  { key: 'hero.cta', group: 'მთავარი ეკრანი', label: 'მთავარი ღილაკი', default: 'შეუკვეთე ახლავე', max: 40 },
  { key: 'hero.cta2', group: 'მთავარი ეკრანი', label: 'მეორე ღილაკი', default: 'როგორ მზადდება', max: 40 },
  { key: 'hero.scroll', group: 'მთავარი ეკრანი', label: '„გადაახვიე“ მინიშნება', default: 'გადაახვიე', max: 30 },

  // ---- statement
  { key: 'intro.eyebrow', group: 'განცხადება', label: 'პატარა წარწერა', default: 'რა არის {brand}', max: 60 },
  {
    key: 'intro.statement',
    group: 'განცხადება',
    label: 'დიდი წინადადება',
    lines: true,
    max: 220,
    default: 'ავიღეთ ჩვეულებრივი ანანასი და ვაქციეთ ისეთ რამედ, რაც ჯერ არასდროს გაგისინჯავს.',
  },
  { key: 'intro.stat1', group: 'განცხადება', label: 'ციფრი 1 — წარწერა (გემოების რაოდენობა)', default: 'გემო', max: 60 },
  { key: 'intro.stat2', group: 'განცხადება', label: 'ციფრი 2 — წარწერა (ქილის მოცულობა)', default: 'მლ — ერთი ქილა', max: 60 },
  { key: 'intro.stat3', group: 'განცხადება', label: 'ციფრი 3 — წარწერა (შენახვის დღეები)', default: 'დღე — ინახება მაცივარში', max: 60 },

  // ---- process
  { key: 'process.eyebrow', group: 'პროცესი', label: 'პატარა წარწერა', default: 'პროცესი', max: 40 },
  { key: 'process.s1.title', group: 'პროცესი', label: 'ნაბიჯი 1 — სათაური', default: 'ვჭრით', max: 20 },
  {
    key: 'process.s1.text',
    group: 'პროცესი',
    label: 'ნაბიჯი 1 — ტექსტი',
    lines: true,
    max: 220,
    default: 'ვარჩევთ მწიფე ანანასს და ვჭრით პატარა ნაჭრებად — ყოველ დილით, ახლად.',
  },
  { key: 'process.s2.title', group: 'პროცესი', label: 'ნაბიჯი 2 — სათაური', default: 'ვაყრით', max: 20 },
  {
    key: 'process.s2.text',
    group: 'პროცესი',
    label: 'ნაბიჯი 2 — ტექსტი',
    lines: true,
    max: 220,
    default: 'ნაჭრებს ვაყრით Kool-Aid-ის ფხვნილს. ფხვნილი ანანასის წვენს ერევა და ფერსაც და გემოსაც ცვლის.',
  },
  { key: 'process.s3.title', group: 'პროცესი', label: 'ნაბიჯი 3 — სათაური', default: 'ვხურავთ', max: 20 },
  {
    key: 'process.s3.text',
    group: 'პროცესი',
    label: 'ნაბიჯი 3 — ტექსტი',
    lines: true,
    max: 220,
    default: 'ვავსებთ ქილას, ვხურავთ და ვაცივებთ. მზადაა — პირდაპირ შენთან.',
  },

  // ---- marquee
  { key: 'marquee.row1', group: 'მოძრავი ზოლი', label: 'პირველი რიგი (მძიმით გამოყავი)', default: 'ტკბილი, მჟავე, ცივი, ტროპიკული', max: 160 },
  { key: 'marquee.row2', group: 'მოძრავი ზოლი', label: 'მეორე რიგი (მძიმით გამოყავი)', default: 'sweet, sour, tropical, {brand}', max: 160 },

  // ---- flavours
  { key: 'flavors.eyebrow', group: 'გემოები', label: 'პატარა წარწერა', default: 'გემოები', max: 40 },
  { key: 'flavors.title', group: 'გემოები', label: 'სათაური', default: 'აირჩიე', max: 30 },
  { key: 'flavors.titleAccent', group: 'გემოები', label: 'სათაური (დახრილი ნაწილი)', default: 'შენი ფერი', max: 30 },

  // ---- shop
  { key: 'shop.eyebrow', group: 'შეკვეთა', label: 'პატარა წარწერა', default: 'შეკვეთა', max: 40 },
  { key: 'shop.title', group: 'შეკვეთა', label: 'სათაური', default: 'აიღე', max: 30 },
  { key: 'shop.titleAccent', group: 'შეკვეთა', label: 'სათაური (დახრილი ნაწილი)', default: 'ქილა', max: 30 },
  { key: 'shop.fresh', group: 'შეკვეთა', label: 'იარლიყი „ახლად დამზადებული“', default: 'ახლად დამზადებული', max: 40 },
  { key: 'shop.payment', group: 'შეკვეთა', label: 'გადახდის შესახებ', default: 'გადახდა — მიტანისას (ნაღდი ან ბარათი).', max: 140 },
  { key: 'shop.buy', group: 'შეკვეთა', label: 'ყიდვის ღილაკი', default: 'ყიდვა', max: 30 },
  { key: 'shop.pick', group: 'შეკვეთა', label: 'ღილაკი, როცა კალათა ცარიელია', default: 'აირჩიე რაოდენობა', max: 40 },

  // ---- checkout
  { key: 'checkout.title', group: 'შეკვეთის ფორმა', label: 'სათაური', default: 'თითქმის', max: 30 },
  { key: 'checkout.titleAccent', group: 'შეკვეთის ფორმა', label: 'სათაური (დახრილი ნაწილი)', default: 'მზადაა', max: 30 },
  { key: 'checkout.submit', group: 'შეკვეთის ფორმა', label: 'დადასტურების ღილაკი', default: 'შეკვეთის დადასტურება', max: 40 },
  { key: 'checkout.thanks', group: 'შეკვეთის ფორმა', label: 'მადლობის სათაური', default: 'მადლობა!', max: 40 },
  {
    key: 'checkout.thanksText',
    group: 'შეკვეთის ფორმა',
    label: 'მადლობის ტექსტი',
    lines: true,
    max: 200,
    default: 'მალე დაგიკავშირდებით მიწოდების დასაზუსტებლად.',
  },

  // ---- reviews
  { key: 'reviews.eyebrow', group: 'შეფასებები', label: 'პატარა წარწერა', default: 'შეფასებები', max: 40 },
  { key: 'reviews.title', group: 'შეფასებები', label: 'სათაური', default: 'რას ამბობენ', max: 30 },
  { key: 'reviews.titleAccent', group: 'შეფასებები', label: 'სათაური (დახრილი ნაწილი)', default: 'ჩვენზე', max: 30 },

  // ---- faq
  { key: 'faq.eyebrow', group: 'კითხვები', label: 'პატარა წარწერა', default: 'კითხვები', max: 40 },
  { key: 'faq.title', group: 'კითხვები', label: 'სათაური', default: 'ხშირად', max: 30 },
  { key: 'faq.titleAccent', group: 'კითხვები', label: 'სათაური (დახრილი ნაწილი)', default: 'გვეკითხებიან', max: 30 },

  // ---- footer & search engines
  {
    key: 'footer.legal',
    group: 'ფუტერი და Google',
    label: 'ქვედა იურიდიული ტექსტი',
    lines: true,
    max: 300,
    default: '© 2026 {brand}. Kool-Aid არის Kraft Heinz-ის რეგისტრირებული სავაჭრო ნიშანი; {brand} მასთან დაკავშირებული არ არის.',
  },
  { key: 'seo.title', group: 'ფუტერი და Google', label: 'ბრაუზერის ჩანართის სათაური', default: '{brand} — ანანასი Kool-Aid-ის ფხვნილით', max: 80 },
  {
    key: 'seo.description',
    group: 'ფუტერი და Google',
    label: 'აღწერა Google-ისთვის',
    lines: true,
    max: 200,
    default: 'ახლად დაჭრილი ანანასი Kool-Aid-ის ფხვნილში — ალუბალი, ლურჯი ჟოლო, ყურძენი, ტროპიკული პუნში. შეუკვეთე ქილა მიწოდებით.',
  },
];

const BY_KEY = new Map(CONTENT.map((c) => [c.key, c]));

export async function getContent(db) {
  const out = Object.fromEntries(CONTENT.map((c) => [c.key, c.default]));
  for (const { key, value } of await db.query('SELECT key, value FROM content')) {
    if (BY_KEY.has(key)) out[key] = value;
  }
  return out;
}

// Saving an empty field puts the default back, so the page can never lose a text.
export async function saveContent(db, input) {
  const before = await getContent(db);
  const changes = {};
  for (const [key, raw] of Object.entries(input || {})) {
    const def = BY_KEY.get(key);
    if (!def) continue;
    let value = String(raw ?? '').replace(/\r\n/g, '\n').trim();
    if (!def.lines) value = value.replace(/\s+/g, ' ');
    if (value.length > def.max) throw new HttpError(400, `${def.group} → ${def.label}: მაქსიმუმ ${def.max} სიმბოლო`);
    if (!value || value === def.default) {
      if (before[key] !== def.default) changes[key] = { from: before[key], to: def.default };
      await db.query('DELETE FROM content WHERE key = $1', [key]);
      continue;
    }
    if (value === before[key]) continue;
    changes[key] = { from: before[key], to: value };
    await db.query(
      `INSERT INTO content (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
      [key, value]
    );
  }
  return { content: await getContent(db), changes };
}
