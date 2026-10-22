import express from 'express';
import http from 'node:http';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openDb, transaction } from './db.js';
import { HttpError, cleanText, normalizePhone, rateLimiter } from './http.js';
import { getSettings } from './settings.js';
import { authRoutes, ensureAdmin } from './auth.js';
import { adminRoutes, toProduct } from './admin.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

const db = openDb(resolve(ROOT, process.env.DB_FILE || 'data/pinepop.db'));
ensureAdmin(db, { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD });

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

function orderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PP-';
  for (let i = 0; i < 5; i++) code += alphabet[randomInt(alphabet.length)];
  return code;
}

const orderLimit = rateLimiter(8, 10 * 60 * 1000);

// ---------- public API ----------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Everything the storefront needs in one request: texts/options + flavours on sale.
app.get('/api/site', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort, id').all();
  res.json({ settings: getSettings(db), products: rows.map(toProduct) });
});

app.post('/api/orders', (req, res) => {
  if (!orderLimit(req.ip)) throw new HttpError(429, 'ძალიან ბევრი მცდელობა. სცადე ცოტა ხანში.');

  const settings = getSettings(db);
  const cities = settings.deliveryCities;
  const body = req.body || {};
  const customer = body.customer || {};
  const name = cleanText(customer.name, 80);
  const phone = normalizePhone(customer.phone);
  const city = customer.city ?? cities[0];
  const address = cleanText(customer.address, 200);
  const note = cleanText(customer.note, 500);

  if (name.length < 2) throw new HttpError(400, 'მიუთითე სახელი');
  if (!phone) throw new HttpError(400, 'ტელეფონის ნომერი არასწორია (მაგ. 555 12 34 56)');
  if (!cities.includes(city)) throw new HttpError(400, `მიწოდება ამ ეტაპზე მხოლოდ: ${cities.join(', ')}`);
  if (address.length < 4) throw new HttpError(400, 'მიუთითე მისამართი');

  // Merge duplicate lines and drop empty ones.
  const wanted = new Map();
  for (const item of Array.isArray(body.items) ? body.items : []) {
    const id = Number(item?.productId);
    const qty = Number(item?.qty);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) continue;
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }
  if (wanted.size === 0) throw new HttpError(400, 'კალათა ცარიელია');
  for (const qty of wanted.values()) {
    if (qty > 20) throw new HttpError(400, 'ერთ შეკვეთაში მაქსიმუმ 20 ქილა ერთი გემოსი');
  }

  const result = transaction(db, () => {
    const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1');
    const lines = [];
    let itemsTotal = 0;
    for (const [id, qty] of wanted) {
      const product = getProduct.get(id);
      if (!product) throw new HttpError(400, 'პროდუქტი ვერ მოიძებნა');
      if (product.stock < qty) throw new HttpError(409, `${product.flavor} — მარაგში მხოლოდ ${product.stock} ქილაა`);
      // Prices always come from the database, never from the browser.
      lines.push({ product, qty });
      itemsTotal += product.price_tetri * qty;
    }
    const delivery = Math.round(settings.deliveryFee * 100);
    const total = itemsTotal + delivery;

    let code;
    do code = orderCode();
    while (db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code));

    const { lastInsertRowid: orderId } = db
      .prepare(
        `INSERT INTO orders (code, customer_name, phone, city, address, note, total_tetri, delivery_tetri)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(code, name, phone, city, address, note || null, total, delivery);

    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, qty, unit_price_tetri) VALUES (?, ?, ?, ?)'
    );
    const takeStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    for (const { product, qty } of lines) {
      insertItem.run(orderId, product.id, qty, product.price_tetri);
      takeStock.run(qty, product.id);
    }
    return { code, total: total / 100 };
  });

  res.status(201).json(result);
});

// ---------- admin API ----------

const requireAdmin = authRoutes(app, db);
adminRoutes(app, db, requireAdmin);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// ---------- frontend ----------

// Express treats "/admin" and "/admin/" as the same route, so only redirect the bare path.
app.get('/admin', (req, res, next) => (req.path === '/admin' ? res.redirect('/admin/') : next()));

if (isProd) {
  app.use(express.static(resolve(ROOT, 'dist'), { maxAge: '7d', index: 'index.html' }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    appType: 'mpa',
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (!(err instanceof HttpError) && status >= 500) console.error(err);
  const message = err instanceof HttpError ? err.message : status < 500 ? 'არასწორი მოთხოვნა' : 'სერვერის შეცდომა';
  res.status(status).json({ error: message });
});

server.listen(PORT, () => {
  console.log(`PINEPOP → http://localhost:${PORT}  (${isProd ? 'production' : 'dev'})`);
});
