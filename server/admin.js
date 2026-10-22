import { randomBytes } from 'node:crypto';
import { HttpError, cleanText } from './http.js';
import { getSettings, saveSettings } from './settings.js';

const STATUSES = ['new', 'confirmed', 'delivered', 'cancelled'];

export const toProduct = (row) => ({
  id: row.id,
  flavor: row.flavor,
  description: row.description,
  color: row.color,
  price: row.price_tetri / 100,
  stock: row.stock,
  active: !!row.active,
  sort: row.sort,
});

function readProduct(body = {}) {
  const flavor = cleanText(body.flavor, 40);
  const description = cleanText(body.description, 300);
  const color = String(body.color || '').toLowerCase();
  const price = Math.round(Number(body.price) * 100);
  const stock = Number(body.stock);
  const sort = Number(body.sort ?? 0);

  if (!flavor) throw new HttpError(400, 'გემოს სახელი ცარიელია');
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new HttpError(400, 'ფერი: მაგ. #ff2e4d');
  if (!Number.isFinite(price) || price < 50 || price > 100000) throw new HttpError(400, 'ფასი: 0.50–1000 ₾');
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new HttpError(400, 'მარაგი: 0 ან მეტი მთელი რიცხვი');
  if (!Number.isInteger(sort) || Math.abs(sort) > 1000) throw new HttpError(400, 'რიგი: მთელი რიცხვი');
  return { flavor, description, color, price, stock, sort, active: body.active === false ? 0 : 1 };
}

export function adminRoutes(app, db, requireAdmin) {
  // ---------- orders ----------

  app.get('/api/admin/orders', requireAdmin, (_req, res) => {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all();
    const items = db
      .prepare(
        `SELECT oi.order_id, oi.qty, oi.unit_price_tetri, p.flavor
         FROM order_items oi JOIN products p ON p.id = oi.product_id`
      )
      .all();
    const byOrder = Map.groupBy(items, (i) => i.order_id);
    res.json(
      orders.map((o) => ({
        id: o.id,
        code: o.code,
        createdAt: o.created_at,
        name: o.customer_name,
        phone: o.phone,
        city: o.city,
        address: o.address,
        note: o.note,
        total: o.total_tetri / 100,
        delivery: o.delivery_tetri / 100,
        status: o.status,
        items: (byOrder.get(o.id) || []).map((i) => ({ flavor: i.flavor, qty: i.qty, price: i.unit_price_tetri / 100 })),
      }))
    );
  });

  app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
    const status = req.body?.status;
    if (!STATUSES.includes(status)) throw new HttpError(400, 'არასწორი სტატუსი');
    const { changes } = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, Number(req.params.id));
    if (!changes) throw new HttpError(404, 'შეკვეთა ვერ მოიძებნა');
    res.json({ ok: true });
  });

  // ---------- flavours, prices, stock ----------

  app.get('/api/admin/products', requireAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = p.id) AS orders
         FROM products p ORDER BY p.sort, p.id`
      )
      .all();
    res.json(rows.map((r) => ({ ...toProduct(r), orders: r.orders })));
  });

  app.post('/api/admin/products', requireAdmin, (req, res) => {
    const p = readProduct(req.body);
    const slug = `flavor-${randomBytes(4).toString('hex')}`;
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO products (slug, name, flavor, description, color, size_ml, price_tetri, stock, active, sort)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      )
      .run(slug, p.flavor, p.flavor, p.description, p.color, p.price, p.stock, p.active, p.sort);
    res.status(201).json(toProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(lastInsertRowid)));
  });

  app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    const p = readProduct(req.body);
    const { changes } = db
      .prepare(
        `UPDATE products SET name = ?, flavor = ?, description = ?, color = ?, price_tetri = ?, stock = ?, active = ?, sort = ?
         WHERE id = ?`
      )
      .run(p.flavor, p.flavor, p.description, p.color, p.price, p.stock, p.active, p.sort, Number(req.params.id));
    if (!changes) throw new HttpError(404, 'გემო ვერ მოიძებნა');
    res.json(toProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id))));
  });

  app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (db.prepare('SELECT 1 FROM order_items WHERE product_id = ?').get(id)) {
      throw new HttpError(409, 'ამ გემოზე უკვე არის შეკვეთები — წაშლის ნაცვლად გამორთე („საიტზე ჩანს“).');
    }
    const { changes } = db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (!changes) throw new HttpError(404, 'გემო ვერ მოიძებნა');
    res.json({ ok: true });
  });

  // ---------- site settings ----------

  app.get('/api/admin/settings', requireAdmin, (_req, res) => res.json(getSettings(db)));
  app.put('/api/admin/settings', requireAdmin, (req, res) => res.json(saveSettings(db, req.body)));
}
