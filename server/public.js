import { createHash, randomInt } from 'node:crypto';
import { HttpError, cleanText, normalizePhone, rateLimiter } from './http.js';
import { getSettings } from './settings.js';
import { getContent } from './content.js';

export const STATUS_LABELS = {
  new: 'მიღებულია',
  confirmed: 'დადასტურებულია',
  delivering: 'გზაშია',
  delivered: 'მიწოდებულია',
  cancelled: 'გაუქმებულია',
};

export const publicProduct = (r) => ({
  id: r.id,
  flavor: r.flavor,
  description: r.description,
  color: r.color,
  price: r.price / 100,
  stock: r.stock,
});

const publicZone = (z) => ({ id: z.id, name: z.name, fee: z.fee / 100, freeAbove: z.free_above == null ? null : z.free_above / 100, eta: z.eta });

// percent or fixed, never more than the goods themselves
export function couponDiscount(coupon, subtotal) {
  if (!coupon) return 0;
  if (coupon.percent_off) return Math.floor((subtotal * coupon.percent_off) / 100);
  return Math.min(coupon.amount_off, subtotal);
}

// Why a coupon cannot be used right now, or null when it can.
export function couponProblem(coupon, subtotal) {
  if (!coupon || !coupon.active) return 'ასეთი პრომოკოდი არ არსებობს';
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return 'პრომოკოდს ვადა გაუვიდა';
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) return 'პრომოკოდი ამოიწურა';
  if (subtotal < coupon.min_order) return `პრომოკოდი მოქმედებს ${coupon.min_order / 100} ₾-დან`;
  return null;
}

function orderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PP-';
  for (let i = 0; i < 5; i++) code += alphabet[randomInt(alphabet.length)];
  return code;
}

export function publicRoutes(app, db) {
  const orderLimit = rateLimiter(8, 10 * 60 * 1000);
  const lookupLimit = rateLimiter(20, 15 * 60 * 1000);

  // Everything the storefront needs in one request.
  app.get('/api/site', async (_req, res) => {
    const [settings, content, products, zones, faqs, reviews, rating] = await Promise.all([
      getSettings(db),
      getContent(db),
      db.query('SELECT * FROM products WHERE active ORDER BY sort, id'),
      db.query('SELECT * FROM delivery_zones WHERE active ORDER BY sort, id'),
      db.query('SELECT question, answer FROM faqs WHERE active ORDER BY sort, id'),
      db.query(
        `SELECT name, rating, body, flavors, reply, created_at FROM reviews
         WHERE status = 'published' ORDER BY created_at DESC LIMIT 12`
      ),
      db.one(`SELECT count(*)::int AS count, round(avg(rating), 1)::float AS average FROM reviews WHERE status = 'published'`),
    ]);
    res.json({
      settings,
      content,
      products: products.map(publicProduct),
      zones: zones.map(publicZone),
      faqs,
      reviews: { items: reviews, count: rating.count, average: rating.average },
    });
  });

  // Cookieless visit counter: a daily salted hash of address + browser, not reversible.
  app.post('/api/visit', async (req, res) => {
    const ua = String(req.get('user-agent') || '');
    if (!ua || /bot|crawl|spider|preview|headless/i.test(ua)) return res.status(204).end();
    const salt = (await db.one(`SELECT value FROM meta WHERE key = 'visit_salt'`))?.value || '';
    const day = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10); // Tbilisi day (UTC+4)
    const visitor = createHash('sha256').update(`${salt}|${day}|${req.ip}|${ua}`).digest('hex').slice(0, 24);
    await db.query(
      `INSERT INTO visits (day, visitor) VALUES ($1, $2)
       ON CONFLICT (day, visitor) DO UPDATE SET views = visits.views + 1`,
      [day, visitor]
    );
    res.status(204).end();
  });

  app.post('/api/coupons/check', async (req, res) => {
    if (!lookupLimit(`c:${req.ip}`)) throw new HttpError(429, 'ძალიან ბევრი მცდელობა. სცადე ცოტა ხანში.');
    const code = cleanText(req.body?.code, 40).toUpperCase();
    const subtotal = Math.max(0, Math.round(Number(req.body?.subtotal) * 100) || 0);
    const coupon = code ? await db.one('SELECT * FROM coupons WHERE code = $1', [code]) : null;
    const problem = couponProblem(coupon, subtotal);
    if (problem) throw new HttpError(400, problem);
    res.json({
      code: coupon.code,
      discount: couponDiscount(coupon, subtotal) / 100,
      label: coupon.percent_off ? `-${coupon.percent_off}%` : `-${coupon.amount_off / 100} ₾`,
    });
  });

  app.post('/api/orders', async (req, res) => {
    if (!orderLimit(req.ip)) throw new HttpError(429, 'ძალიან ბევრი მცდელობა. სცადე ცოტა ხანში.');
    const settings = await getSettings(db);
    if (!settings.shopOpen) throw new HttpError(409, settings.closedMessage);

    const body = req.body || {};
    const customer = body.customer || {};
    const name = cleanText(customer.name, 80);
    const phone = normalizePhone(customer.phone);
    const address = cleanText(customer.address, 200);
    const note = cleanText(customer.note, 500);
    if (name.length < 2) throw new HttpError(400, 'მიუთითე სახელი');
    if (!phone) throw new HttpError(400, 'ტელეფონის ნომერი არასწორია (მაგ. 555 12 34 56)');
    if (address.length < 4) throw new HttpError(400, 'მიუთითე მისამართი');

    const zones = await db.query('SELECT * FROM delivery_zones WHERE active ORDER BY sort, id');
    const zone = zones.find((z) => z.id === Number(customer.zoneId)) || (zones.length === 1 ? zones[0] : null);
    if (!zone) throw new HttpError(400, 'აირჩიე მიწოდების ზონა');

    // merge duplicate lines and drop empty ones
    const wanted = new Map();
    for (const item of Array.isArray(body.items) ? body.items : []) {
      const id = Number(item?.productId);
      const qty = Number(item?.qty);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) continue;
      wanted.set(id, (wanted.get(id) || 0) + qty);
    }
    if (wanted.size === 0) throw new HttpError(400, 'კალათა ცარიელია');
    for (const qty of wanted.values()) {
      if (qty > settings.maxPerFlavor) throw new HttpError(400, `ერთ შეკვეთაში მაქსიმუმ ${settings.maxPerFlavor} ქილა ერთი გემოსი`);
    }
    const couponCode = cleanText(body.coupon, 40).toUpperCase();

    const result = await db.tx(async (q) => {
      const lines = [];
      let subtotal = 0;
      for (const [id, qty] of wanted) {
        // lock the row so two orders cannot both take the last jar
        const product = await q.one('SELECT * FROM products WHERE id = $1 AND active FOR UPDATE', [id]);
        if (!product) throw new HttpError(400, 'პროდუქტი ვერ მოიძებნა');
        if (product.stock < qty) throw new HttpError(409, `${product.flavor} — მარაგში მხოლოდ ${product.stock} ქილაა`);
        lines.push({ product, qty });
        subtotal += product.price * qty;
      }
      if (subtotal < settings.minOrder * 100) throw new HttpError(400, `მინიმალური შეკვეთა — ${settings.minOrder} ₾`);

      let coupon = null;
      if (couponCode) {
        coupon = await q.one('SELECT * FROM coupons WHERE code = $1 FOR UPDATE', [couponCode]);
        const problem = couponProblem(coupon, subtotal);
        if (problem) throw new HttpError(400, problem);
        await q.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
      }
      const discount = couponDiscount(coupon, subtotal);
      const shipping = zone.free_above != null && subtotal >= zone.free_above ? 0 : zone.fee;
      const total = subtotal - discount + shipping;

      const cust = await q.one(
        `INSERT INTO customers (phone, name, last_order_at) VALUES ($1, $2, now())
         ON CONFLICT (phone) DO UPDATE SET name = excluded.name, last_order_at = now()
         RETURNING id`,
        [phone, name]
      );

      let code;
      do code = orderCode();
      while (await q.one('SELECT 1 FROM orders WHERE code = $1', [code]));

      const order = await q.one(
        `INSERT INTO orders (code, customer_id, customer_name, phone, city, address, note, zone_id,
                             subtotal, shipping, discount, total, coupon_id, coupon_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [code, cust.id, name, phone, zone.name, address, note, zone.id, subtotal, shipping, discount, total, coupon?.id ?? null, coupon?.code ?? '']
      );
      await q.query(`INSERT INTO order_events (order_id, status, actor) VALUES ($1, 'new', 'customer')`, [order.id]);

      for (const { product, qty } of lines) {
        await q.query(
          `INSERT INTO order_items (order_id, product_id, flavor, color, qty, unit_price, unit_cost)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [order.id, product.id, product.flavor, product.color, qty, product.price, product.cost]
        );
        const { stock } = await q.one('UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2 RETURNING stock', [
          qty,
          product.id,
        ]);
        await q.query(
          `INSERT INTO stock_movements (product_id, delta, balance, reason, order_id, actor) VALUES ($1, $2, $3, 'order', $4, 'customer')`,
          [product.id, -qty, stock, order.id]
        );
      }
      return { code, total: total / 100 };
    });

    res.status(201).json(result);
  });

  // Order tracking for guests: the code and the phone it was placed with must both match.
  app.post('/api/track', async (req, res) => {
    if (!lookupLimit(`t:${req.ip}`)) throw new HttpError(429, 'ძალიან ბევრი მცდელობა. სცადე ცოტა ხანში.');
    const code = cleanText(req.body?.code, 20).toUpperCase();
    const phone = normalizePhone(req.body?.phone);
    const order = phone && (await db.one('SELECT * FROM orders WHERE code = $1 AND phone = $2', [code, phone]));
    // a wrong phone and a wrong code answer the same, so codes cannot be probed
    if (!order) throw new HttpError(404, 'შეკვეთა ვერ მოიძებნა — შეამოწმე ნომერი და ტელეფონი');
    const [items, events, review] = await Promise.all([
      db.query('SELECT flavor, color, qty, unit_price FROM order_items WHERE order_id = $1 ORDER BY id', [order.id]),
      db.query('SELECT status, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at, id', [order.id]),
      db.one('SELECT 1 FROM reviews WHERE order_id = $1', [order.id]),
    ]);
    const settings = await getSettings(db);
    res.json({
      code: order.code,
      status: order.status,
      statusLabel: STATUS_LABELS[order.status],
      createdAt: order.created_at,
      subtotal: order.subtotal / 100,
      discount: order.discount / 100,
      shipping: order.shipping / 100,
      total: order.total / 100,
      items: items.map((i) => ({ flavor: i.flavor, color: i.color, qty: i.qty, price: i.unit_price / 100 })),
      // only status changes are shown to the customer, never staff notes
      timeline: events.filter((e, i, all) => i === 0 || e.status !== all[i - 1].status).map((e) => ({ status: e.status, label: STATUS_LABELS[e.status], at: e.created_at })),
      canReview: settings.reviewsEnabled && order.status === 'delivered' && !review,
      name: order.customer_name,
    });
  });

  // Reviews: only for a delivered order, one per order, published after moderation.
  app.post('/api/reviews', async (req, res) => {
    if (!lookupLimit(`r:${req.ip}`)) throw new HttpError(429, 'ძალიან ბევრი მცდელობა. სცადე ცოტა ხანში.');
    const settings = await getSettings(db);
    if (!settings.reviewsEnabled) throw new HttpError(409, 'შეფასებების მიღება ახლა გამორთულია');
    const code = cleanText(req.body?.code, 20).toUpperCase();
    const phone = normalizePhone(req.body?.phone);
    const rating = Number(req.body?.rating);
    const body = cleanText(req.body?.body, 600);
    const order = phone && (await db.one('SELECT * FROM orders WHERE code = $1 AND phone = $2', [code, phone]));
    if (!order) throw new HttpError(404, 'შეკვეთა ვერ მოიძებნა');
    if (order.status !== 'delivered') throw new HttpError(409, 'შეფასება შესაძლებელია მიწოდების შემდეგ');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'აირჩიე შეფასება 1-დან 5-მდე');
    if (body.length < 3) throw new HttpError(400, 'დაწერე რამდენიმე სიტყვა');
    const flavors = (await db.query('SELECT flavor FROM order_items WHERE order_id = $1 ORDER BY id', [order.id])).map((r) => r.flavor);
    // first name only, so the shop never publishes a full name
    const name = cleanText(req.body?.name, 40) || order.customer_name.split(' ')[0];
    try {
      await db.query('INSERT INTO reviews (order_id, name, rating, body, flavors) VALUES ($1, $2, $3, $4, $5)', [
        order.id,
        name,
        rating,
        body,
        [...new Set(flavors)].join(', '),
      ]);
    } catch (err) {
      if (/unique|duplicate/i.test(err.message)) throw new HttpError(409, 'ამ შეკვეთაზე შეფასება უკვე დატოვებულია');
      throw err;
    }
    res.status(201).json({ ok: true });
  });
}
