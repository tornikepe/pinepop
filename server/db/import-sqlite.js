import { DatabaseSync } from 'node:sqlite';

// One-time move from the first version's SQLite file (data/pinepop.db) into Postgres.
// Keeps ids, prices, stock, orders, settings and the admin login (its password hash
// is already scrypt, the same format). The SQLite file itself is left untouched.
export async function importSqlite(db, file) {
  const old = new DatabaseSync(file, { readOnly: true });
  const all = (sql) => old.prepare(sql).all();
  const has = (table) => !!old.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  const utc = (s) => (s ? `${String(s).replace(' ', 'T')}Z` : null); // SQLite datetime('now') is UTC without a zone

  await db.tx(async (q) => {
    for (const p of all('SELECT * FROM products')) {
      await q.query(
        `INSERT INTO products (id, slug, flavor, description, color, price, stock, active, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [p.id, p.slug, p.flavor, p.description, p.color, p.price_tetri, p.stock, !!p.active, p.sort]
      );
      await q.query(
        `INSERT INTO stock_movements (product_id, delta, balance, reason, note, actor)
         VALUES ($1, $2, $2, 'import', 'გადმოტანილია ძველი ბაზიდან', 'system')`,
        [p.id, p.stock]
      );
    }

    // settings: delivery moves from three settings to a delivery zone per city
    const settings = Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, JSON.parse(r.value)]));
    for (const key of ['brandBold', 'brandItalic', 'jarSizeMl', 'shelfLifeDays', 'phone', 'facebook', 'tiktok', 'instagram']) {
      if (key in settings) await q.query('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, JSON.stringify(settings[key])]);
    }
    const cities = settings.deliveryCities?.length ? settings.deliveryCities : ['თბილისი'];
    const fee = Math.round((settings.deliveryFee || 0) * 100);
    const zoneIds = {};
    for (const [i, city] of cities.entries()) {
      const zone = await q.one('INSERT INTO delivery_zones (name, fee, eta, sort) VALUES ($1, $2, $3, $4) RETURNING id', [
        city,
        fee,
        settings.deliveryTime || 'იმავე დღეს',
        i + 1,
      ]);
      zoneIds[city] = zone.id;
    }

    const orders = all('SELECT * FROM orders ORDER BY id');
    const items = has('order_items')
      ? all('SELECT oi.*, p.flavor, p.color FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id')
      : [];
    const customers = new Map();
    for (const o of orders) {
      const c = customers.get(o.phone) || { name: o.customer_name, first: o.created_at, last: o.created_at };
      c.name = o.customer_name;
      c.last = o.created_at;
      customers.set(o.phone, c);
    }
    const customerIds = {};
    for (const [phone, c] of customers) {
      const row = await q.one(
        'INSERT INTO customers (phone, name, created_at, last_order_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [phone, c.name, utc(c.first), utc(c.last)]
      );
      customerIds[phone] = row.id;
    }

    for (const o of orders) {
      const shipping = o.delivery_tetri || 0;
      await q.query(
        `INSERT INTO orders (id, code, customer_id, customer_name, phone, city, address, note, zone_id,
                             subtotal, shipping, total, status, created_at, updated_at, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15)`,
        [
          o.id,
          o.code,
          customerIds[o.phone],
          o.customer_name,
          o.phone,
          o.city,
          o.address,
          o.note || '',
          zoneIds[o.city] ?? null,
          o.total_tetri - shipping,
          shipping,
          o.total_tetri,
          o.status,
          utc(o.created_at),
          o.status === 'delivered' ? utc(o.created_at) : null,
        ]
      );
      await q.query(`INSERT INTO order_events (order_id, status, actor, created_at) VALUES ($1, 'new', 'customer', $2)`, [
        o.id,
        utc(o.created_at),
      ]);
      if (o.status !== 'new') {
        await q.query(
          `INSERT INTO order_events (order_id, status, note, actor, created_at) VALUES ($1, $2, 'გადმოტანილია ძველი ბაზიდან', 'system', $3)`,
          [o.id, o.status, utc(o.created_at)]
        );
      }
    }
    for (const it of items) {
      await q.query(
        `INSERT INTO order_items (order_id, product_id, flavor, color, qty, unit_price) VALUES ($1, $2, $3, $4, $5, $6)`,
        [it.order_id, it.product_id, it.flavor || '—', it.color || '#ffd23f', it.qty, it.unit_price_tetri]
      );
    }

    if (has('admins')) {
      for (const a of all('SELECT * FROM admins')) {
        await q.query(
          `INSERT INTO staff (username, name, role, password_hash, created_at) VALUES ($1, 'მფლობელი', 'admin', $2, $3)`,
          [a.username, a.password_hash, utc(a.created_at)]
        );
      }
    }

    // explicit ids were inserted, so move the sequences past them
    for (const table of ['products', 'orders']) {
      await q.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT max(id) FROM ${table}), 1))`);
    }
  });
  old.close();
}
