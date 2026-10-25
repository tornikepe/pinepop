import { randomBytes } from 'node:crypto';
import { HttpError, cleanText } from '../http.js';
import { audit, diff } from '../audit.js';
import { gel, int, money } from './util.js';

const productOut = (r) => ({
  id: r.id,
  flavor: r.flavor,
  description: r.description,
  color: r.color,
  price: gel(r.price),
  cost: gel(r.cost),
  stock: r.stock,
  lowStock: r.low_stock,
  active: r.active,
  sort: r.sort,
  sold: r.sold ?? 0,
  revenue: gel(r.revenue ?? 0),
  profit: gel(r.profit ?? 0),
  orders: r.orders ?? 0,
});

function readProduct(body = {}) {
  const flavor = cleanText(body.flavor, 40);
  const color = String(body.color || '').toLowerCase();
  if (!flavor) throw new HttpError(400, 'გემოს სახელი ცარიელია');
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new HttpError(400, 'ფერი: მაგ. #ff2e4d');
  return {
    flavor,
    description: cleanText(body.description, 300),
    color,
    price: money(body.price, { min: 0.5, max: 1000, label: 'ფასი' }),
    cost: money(body.cost ?? 0, { min: 0, max: 1000, label: 'თვითღირებულება' }),
    low_stock: int(body.lowStock ?? 10, { min: 0, max: 100000, label: 'გაფრთხილება' }),
    sort: int(body.sort ?? 0, { min: -1000, max: 1000, label: 'რიგი' }),
    active: body.active !== false,
  };
}

const couponOut = (c) => ({
  id: c.id,
  code: c.code,
  percentOff: c.percent_off,
  amountOff: gel(c.amount_off),
  minOrder: gel(c.min_order),
  maxUses: c.max_uses,
  usedCount: c.used_count,
  expiresAt: c.expires_at,
  active: c.active,
  note: c.note,
  orders: c.orders ?? 0,
  discountGiven: gel(c.discount_given ?? 0),
});

function readCoupon(body = {}) {
  const code = cleanText(body.code, 30).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HttpError(400, 'კოდი: 3–30 ლათინური ასო ან ციფრი');
  const kind = body.kind === 'amount' ? 'amount' : 'percent';
  const percent = kind === 'percent' ? int(body.value, { min: 1, max: 100, label: 'ფასდაკლება %' }) : null;
  const amount = kind === 'amount' ? money(body.value, { min: 0.01, max: 1000, label: 'ფასდაკლება ₾' }) : null;
  const expires = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expires && Number.isNaN(expires.getTime())) throw new HttpError(400, 'ვადა: არასწორი თარიღი');
  return {
    code,
    percent_off: percent,
    amount_off: amount,
    min_order: money(body.minOrder || 0, { min: 0, max: 10000, label: 'მინიმალური შეკვეთა' }),
    max_uses: body.maxUses === '' || body.maxUses == null ? null : int(body.maxUses, { min: 1, max: 1000000, label: 'გამოყენების ლიმიტი' }),
    expires_at: expires,
    active: body.active !== false,
    note: cleanText(body.note, 200),
  };
}

export function catalogRoutes(app, db, auth) {
  // ---------- flavours ----------

  const PRODUCT_STATS = `
    coalesce((SELECT sum(i.qty) FROM order_items i JOIN orders o ON o.id = i.order_id
              WHERE i.product_id = p.id AND o.status <> 'cancelled'), 0)::int AS sold,
    coalesce((SELECT sum(i.qty * i.unit_price) FROM order_items i JOIN orders o ON o.id = i.order_id
              WHERE i.product_id = p.id AND o.status <> 'cancelled'), 0)::int AS revenue,
    coalesce((SELECT sum(i.qty * (i.unit_price - i.unit_cost)) FROM order_items i JOIN orders o ON o.id = i.order_id
              WHERE i.product_id = p.id AND o.status <> 'cancelled'), 0)::int AS profit,
    (SELECT count(*) FROM order_items i WHERE i.product_id = p.id)::int AS orders`;

  app.get('/api/admin/products', auth(), async (_req, res) => {
    const rows = await db.query(`SELECT p.*, ${PRODUCT_STATS} FROM products p ORDER BY p.sort, p.id`);
    res.json(rows.map(productOut));
  });

  app.post('/api/admin/products', auth('products:write'), async (req, res) => {
    const p = readProduct(req.body);
    const stock = int(req.body?.stock ?? 0, { min: 0, max: 100000, label: 'მარაგი' });
    const row = await db.tx(async (q) => {
      const r = await q.one(
        `INSERT INTO products (slug, flavor, description, color, price, cost, stock, low_stock, active, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [`flavor-${randomBytes(4).toString('hex')}`, p.flavor, p.description, p.color, p.price, p.cost, stock, p.low_stock, p.active, p.sort]
      );
      if (stock) {
        await q.query(
          `INSERT INTO stock_movements (product_id, delta, balance, reason, note, actor) VALUES ($1, $2, $2, 'restock', 'საწყისი მარაგი', $3)`,
          [r.id, stock, req.staff.username]
        );
      }
      return r;
    });
    await audit(db, req.staff, { action: 'create', entity: 'product', entityId: row.id, label: row.flavor });
    res.status(201).json(productOut(row));
  });

  app.put('/api/admin/products/:id', auth('products:write'), async (req, res) => {
    const id = Number(req.params.id);
    const before = await db.one('SELECT * FROM products WHERE id = $1', [id]);
    if (!before) throw new HttpError(404, 'გემო ვერ მოიძებნა');
    const p = readProduct(req.body);
    const after = await db.one(
      `UPDATE products SET flavor = $1, description = $2, color = $3, price = $4, cost = $5, low_stock = $6,
              active = $7, sort = $8, updated_at = now()
       WHERE id = $9 RETURNING *`,
      [p.flavor, p.description, p.color, p.price, p.cost, p.low_stock, p.active, p.sort, id]
    );
    const changes = diff(before, after, ['flavor', 'description', 'color', 'price', 'cost', 'low_stock', 'active', 'sort']);
    for (const f of ['price', 'cost']) if (changes[f]) changes[f] = { from: gel(changes[f].from), to: gel(changes[f].to) };
    await audit(db, req.staff, { action: 'update', entity: 'product', entityId: id, label: after.flavor, changes });
    res.json(productOut(after));
  });

  app.delete('/api/admin/products/:id', auth('products:write'), async (req, res) => {
    const id = Number(req.params.id);
    if (await db.one('SELECT 1 FROM order_items WHERE product_id = $1', [id])) {
      throw new HttpError(409, 'ამ გემოზე უკვე არის შეკვეთები — წაშლის ნაცვლად გამორთე („საიტზე ჩანს“).');
    }
    const row = await db.one('DELETE FROM products WHERE id = $1 RETURNING flavor', [id]);
    if (!row) throw new HttpError(404, 'გემო ვერ მოიძებნა');
    await audit(db, req.staff, { action: 'delete', entity: 'product', entityId: id, label: row.flavor });
    res.json({ ok: true });
  });

  // Restock or correct the count; every change is a movement with the balance after it.
  app.post('/api/admin/products/:id/stock', auth('products:write'), async (req, res) => {
    const id = Number(req.params.id);
    const delta = int(req.body?.delta, { min: -100000, max: 100000, label: 'რაოდენობა' });
    if (delta === 0) throw new HttpError(400, 'რაოდენობა 0 ვერ იქნება');
    const reason = req.body?.reason === 'adjust' ? 'adjust' : 'restock';
    const note = cleanText(req.body?.note, 200);
    const result = await db.tx(async (q) => {
      const p = await q.one('SELECT * FROM products WHERE id = $1 FOR UPDATE', [id]);
      if (!p) throw new HttpError(404, 'გემო ვერ მოიძებნა');
      if (p.stock + delta < 0) throw new HttpError(400, `მარაგი ვერ ჩავა ნულს ქვემოთ (ახლა ${p.stock})`);
      const { stock } = await q.one('UPDATE products SET stock = stock + $1, updated_at = now() WHERE id = $2 RETURNING stock', [delta, id]);
      await q.query(
        'INSERT INTO stock_movements (product_id, delta, balance, reason, note, actor) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, delta, stock, reason, note, req.staff.username]
      );
      return { flavor: p.flavor, from: p.stock, to: stock };
    });
    await audit(db, req.staff, {
      action: reason,
      entity: 'stock',
      entityId: id,
      label: result.flavor,
      changes: { stock: { from: result.from, to: result.to }, ...(note && { note: { from: null, to: note } }) },
    });
    res.json({ stock: result.to });
  });

  app.get('/api/admin/products/:id/movements', auth(), async (req, res) => {
    const rows = await db.query(
      `SELECT m.*, o.code FROM stock_movements m LEFT JOIN orders o ON o.id = m.order_id
       WHERE m.product_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT 200`,
      [Number(req.params.id)]
    );
    res.json(rows.map((m) => ({ delta: m.delta, balance: m.balance, reason: m.reason, note: m.note, orderCode: m.code, orderId: m.order_id, actor: m.actor, at: m.created_at })));
  });

  // ---------- coupons ----------

  app.get('/api/admin/coupons', auth(), async (_req, res) => {
    const rows = await db.query(
      `SELECT c.*, count(o.id)::int AS orders, coalesce(sum(o.discount), 0)::int AS discount_given
       FROM coupons c LEFT JOIN orders o ON o.coupon_id = c.id AND o.status <> 'cancelled'
       GROUP BY c.id ORDER BY c.active DESC, c.created_at DESC`
    );
    res.json(rows.map(couponOut));
  });

  async function saveCoupon(req, id) {
    const c = readCoupon(req.body);
    const clash = await db.one('SELECT 1 FROM coupons WHERE code = $1 AND id <> $2', [c.code, id ?? 0]);
    if (clash) throw new HttpError(409, 'ასეთი კოდი უკვე არსებობს');
    const values = [c.code, c.percent_off, c.amount_off, c.min_order, c.max_uses, c.expires_at, c.active, c.note];
    if (!id) {
      return db.one(
        `INSERT INTO coupons (code, percent_off, amount_off, min_order, max_uses, expires_at, active, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        values
      );
    }
    return db.one(
      `UPDATE coupons SET code = $1, percent_off = $2, amount_off = $3, min_order = $4, max_uses = $5,
              expires_at = $6, active = $7, note = $8 WHERE id = $9 RETURNING *`,
      [...values, id]
    );
  }

  app.post('/api/admin/coupons', auth('coupons:write'), async (req, res) => {
    const row = await saveCoupon(req);
    await audit(db, req.staff, { action: 'create', entity: 'coupon', entityId: row.id, label: row.code });
    res.status(201).json(couponOut(row));
  });

  app.put('/api/admin/coupons/:id', auth('coupons:write'), async (req, res) => {
    const id = Number(req.params.id);
    const before = await db.one('SELECT * FROM coupons WHERE id = $1', [id]);
    if (!before) throw new HttpError(404, 'პრომოკოდი ვერ მოიძებნა');
    const after = await saveCoupon(req, id);
    await audit(db, req.staff, {
      action: 'update',
      entity: 'coupon',
      entityId: id,
      label: after.code,
      changes: diff(before, after, ['code', 'percent_off', 'amount_off', 'min_order', 'max_uses', 'expires_at', 'active', 'note']),
    });
    res.json(couponOut(after));
  });

  app.delete('/api/admin/coupons/:id', auth('coupons:write'), async (req, res) => {
    const row = await db.one('DELETE FROM coupons WHERE id = $1 RETURNING code', [Number(req.params.id)]);
    if (!row) throw new HttpError(404, 'პრომოკოდი ვერ მოიძებნა');
    await audit(db, req.staff, { action: 'delete', entity: 'coupon', entityId: req.params.id, label: row.code });
    res.json({ ok: true });
  });

  // ---------- reviews ----------

  app.get('/api/admin/reviews', auth(), async (req, res) => {
    const status = ['pending', 'published', 'hidden'].includes(req.query.status) ? req.query.status : null;
    const rows = await db.query(
      `SELECT r.*, o.code, o.id AS order_id FROM reviews r JOIN orders o ON o.id = r.order_id
       ${status ? 'WHERE r.status = $1' : ''} ORDER BY r.created_at DESC LIMIT 300`,
      status ? [status] : []
    );
    const counts = await db.query('SELECT status, count(*)::int AS n FROM reviews GROUP BY status');
    res.json({
      reviews: rows.map((r) => ({ id: r.id, name: r.name, rating: r.rating, body: r.body, flavors: r.flavors, status: r.status, reply: r.reply, orderCode: r.code, orderId: r.order_id, at: r.created_at })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    });
  });

  app.patch('/api/admin/reviews/:id', auth('reviews:write'), async (req, res) => {
    const id = Number(req.params.id);
    const before = await db.one('SELECT * FROM reviews WHERE id = $1', [id]);
    if (!before) throw new HttpError(404, 'შეფასება ვერ მოიძებნა');
    const status = ['pending', 'published', 'hidden'].includes(req.body?.status) ? req.body.status : before.status;
    const reply = req.body?.reply === undefined ? before.reply : cleanText(req.body.reply, 600);
    const after = await db.one('UPDATE reviews SET status = $1, reply = $2 WHERE id = $3 RETURNING *', [status, reply, id]);
    await audit(db, req.staff, { action: 'update', entity: 'review', entityId: id, label: `${before.name} ★${before.rating}`, changes: diff(before, after, ['status', 'reply']) });
    res.json({ ok: true });
  });

  app.delete('/api/admin/reviews/:id', auth('reviews:write'), async (req, res) => {
    const row = await db.one('DELETE FROM reviews WHERE id = $1 RETURNING name, rating', [Number(req.params.id)]);
    if (!row) throw new HttpError(404, 'შეფასება ვერ მოიძებნა');
    await audit(db, req.staff, { action: 'delete', entity: 'review', entityId: req.params.id, label: `${row.name} ★${row.rating}` });
    res.json({ ok: true });
  });
}
