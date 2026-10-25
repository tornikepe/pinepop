import { HttpError, cleanText } from '../http.js';
import { audit } from '../audit.js';
import { STATUS_LABELS } from '../public.js';
import { gel, paging, sendCsv } from './util.js';

const STATUSES = Object.keys(STATUS_LABELS);

const orderRow = (o) => ({
  id: o.id,
  code: o.code,
  createdAt: o.created_at,
  name: o.customer_name,
  phone: o.phone,
  city: o.city,
  address: o.address,
  note: o.note,
  staffNote: o.staff_note,
  subtotal: gel(o.subtotal),
  shipping: gel(o.shipping),
  discount: gel(o.discount),
  total: gel(o.total),
  couponCode: o.coupon_code,
  status: o.status,
  customerId: o.customer_id,
  items: o.items,
  jars: o.jars,
});

// shared WHERE for the list and the CSV export
function filters(query) {
  const where = [];
  const params = [];
  if (STATUSES.includes(query.status)) {
    params.push(query.status);
    where.push(`o.status = $${params.length}`);
  } else if (query.status === 'open') {
    where.push(`o.status IN ('new', 'confirmed', 'delivering')`);
  }
  const q = String(query.q || '').trim();
  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`);
    where.push(`(o.code ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR o.phone ILIKE $${params.length} OR o.address ILIKE $${params.length})`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from || '')) {
    params.push(query.from);
    where.push(`o.created_at >= $${params.length}::date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to || '')) {
    params.push(query.to);
    where.push(`o.created_at < $${params.length}::date + 1`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const ITEMS_SUMMARY = `
  (SELECT string_agg(i.flavor || ' × ' || i.qty, ', ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS items,
  (SELECT coalesce(sum(i.qty), 0)::int FROM order_items i WHERE i.order_id = o.id) AS jars`;

export function orderRoutes(app, db, auth) {
  app.get('/api/admin/orders', auth(), async (req, res) => {
    const { sql, params } = filters(req.query);
    const { limit, offset, page } = paging(req.query);
    const [rows, count, counts] = await Promise.all([
      db.query(`SELECT o.*, ${ITEMS_SUMMARY} FROM orders o ${sql} ORDER BY o.id DESC LIMIT ${limit} OFFSET ${offset}`, params),
      db.one(`SELECT count(*)::int AS n FROM orders o ${sql}`, params),
      db.query('SELECT status, count(*)::int AS n FROM orders GROUP BY status'),
    ]);
    res.json({
      orders: rows.map(orderRow),
      total: count.n,
      page,
      pages: Math.max(1, Math.ceil(count.n / limit)),
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    });
  });

  app.get('/api/admin/orders.csv', auth(), async (req, res) => {
    const { sql, params } = filters(req.query);
    const rows = await db.query(`SELECT o.*, ${ITEMS_SUMMARY} FROM orders o ${sql} ORDER BY o.id DESC LIMIT 10000`, params);
    sendCsv(
      res,
      `pinepop-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      ['კოდი', 'თარიღი', 'სახელი', 'ტელეფონი', 'ქალაქი', 'მისამართი', 'შეკვეთა', 'ქილა', 'ჯამი (₾)', 'მიწოდება (₾)', 'ფასდაკლება (₾)', 'სულ (₾)', 'პრომოკოდი', 'სტატუსი'],
      rows.map((o) => [
        o.code,
        new Date(o.created_at).toISOString().replace('T', ' ').slice(0, 16),
        o.customer_name,
        o.phone,
        o.city,
        o.address,
        o.items,
        o.jars,
        gel(o.subtotal),
        gel(o.shipping),
        gel(o.discount),
        gel(o.total),
        o.coupon_code,
        STATUS_LABELS[o.status],
      ])
    );
  });

  app.get('/api/admin/orders/:id', auth(), async (req, res) => {
    const id = Number(req.params.id);
    const order = await db.one(`SELECT o.*, ${ITEMS_SUMMARY} FROM orders o WHERE o.id = $1`, [id]);
    if (!order) throw new HttpError(404, 'შეკვეთა ვერ მოიძებნა');
    const [items, events, review, customer] = await Promise.all([
      db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id]),
      db.query('SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at, id', [id]),
      db.one('SELECT id, rating, body, status FROM reviews WHERE order_id = $1', [id]),
      order.customer_id
        ? db.one(
            `SELECT c.id, c.name, c.phone, c.note, count(o.id)::int AS orders,
                    coalesce(sum(o.total) FILTER (WHERE o.status <> 'cancelled'), 0)::int AS spent
             FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
             WHERE c.id = $1 GROUP BY c.id`,
            [order.customer_id]
          )
        : null,
    ]);
    res.json({
      order: orderRow(order),
      items: items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        flavor: i.flavor,
        color: i.color,
        qty: i.qty,
        price: gel(i.unit_price),
        cost: gel(i.unit_cost),
      })),
      events: events.map((e) => ({ status: e.status, label: STATUS_LABELS[e.status], note: e.note, actor: e.actor, at: e.created_at })),
      review,
      customer: customer && { ...customer, spent: gel(customer.spent) },
    });
  });

  // Status change. Cancelling puts the jars back on the shelf (and frees the coupon use);
  // un-cancelling takes them again, if they are still there.
  app.patch('/api/admin/orders/:id/status', auth('orders:write'), async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;
    const note = cleanText(req.body?.note, 300);
    if (!STATUSES.includes(status)) throw new HttpError(400, 'არასწორი სტატუსი');

    const order = await db.tx(async (q) => {
      const o = await q.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (!o) throw new HttpError(404, 'შეკვეთა ვერ მოიძებნა');
      if (o.status === status) return o;
      const items = await q.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
      const leaving = o.status !== 'cancelled' && status === 'cancelled';
      const returning = o.status === 'cancelled' && status !== 'cancelled';
      for (const it of leaving || returning ? items : []) {
        if (!it.product_id) continue;
        const delta = leaving ? it.qty : -it.qty;
        const p = await q.one('SELECT stock, flavor FROM products WHERE id = $1 FOR UPDATE', [it.product_id]);
        if (!p) continue;
        if (p.stock + delta < 0) throw new HttpError(409, `${p.flavor} — მარაგში მხოლოდ ${p.stock} ქილაა`);
        const { stock } = await q.one('UPDATE products SET stock = stock + $1, updated_at = now() WHERE id = $2 RETURNING stock', [
          delta,
          it.product_id,
        ]);
        await q.query(
          `INSERT INTO stock_movements (product_id, delta, balance, reason, order_id, actor, note) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [it.product_id, delta, stock, leaving ? 'cancel' : 'order', id, req.staff.username, `${o.code}: ${STATUS_LABELS[o.status]} → ${STATUS_LABELS[status]}`]
        );
      }
      if (o.coupon_id && (leaving || returning)) {
        await q.query('UPDATE coupons SET used_count = greatest(0, used_count + $1) WHERE id = $2', [leaving ? -1 : 1, o.coupon_id]);
      }
      await q.query(
        `UPDATE orders SET status = $1, updated_at = now(),
                delivered_at = CASE WHEN $1 = 'delivered' THEN now() ELSE delivered_at END
         WHERE id = $2`,
        [status, id]
      );
      await q.query('INSERT INTO order_events (order_id, status, note, actor) VALUES ($1, $2, $3, $4)', [id, status, note, req.staff.username]);
      return o;
    });
    await audit(db, req.staff, {
      action: 'status',
      entity: 'order',
      entityId: id,
      label: order.code,
      changes: { status: { from: STATUS_LABELS[order.status], to: STATUS_LABELS[status] } },
    });
    res.json({ ok: true });
  });

  // A note in the order's history (staff only, never shown to the customer).
  app.post('/api/admin/orders/:id/notes', auth('orders:write'), async (req, res) => {
    const id = Number(req.params.id);
    const note = cleanText(req.body?.note, 500);
    if (!note) throw new HttpError(400, 'ჩანაწერი ცარიელია');
    const o = await db.one('SELECT status FROM orders WHERE id = $1', [id]);
    if (!o) throw new HttpError(404, 'შეკვეთა ვერ მოიძებნა');
    await db.query('INSERT INTO order_events (order_id, status, note, actor) VALUES ($1, $2, $3, $4)', [id, o.status, note, req.staff.username]);
    res.status(201).json({ ok: true });
  });

  // ---------- customers ----------

  const CUSTOMER_STATS = `
    count(o.id)::int AS orders,
    coalesce(sum(o.total) FILTER (WHERE o.status <> 'cancelled'), 0)::int AS spent,
    max(o.created_at) AS last_at`;

  app.get('/api/admin/customers', auth(), async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    const q = String(req.query.q || '').trim().replace(/[%_]/g, '');
    const sort = { spent: 'spent DESC', orders: 'orders DESC', name: 'c.name ASC' }[req.query.sort] || 'last_at DESC NULLS LAST';
    const params = q ? [`%${q}%`] : [];
    const where = q ? 'WHERE c.name ILIKE $1 OR c.phone ILIKE $1' : '';
    const [rows, count] = await Promise.all([
      db.query(
        `SELECT c.*, ${CUSTOMER_STATS} FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
         ${where} GROUP BY c.id ORDER BY ${sort} LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      db.one(`SELECT count(*)::int AS n FROM customers c ${where}`, params),
    ]);
    res.json({
      customers: rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, note: c.note, orders: c.orders, spent: gel(c.spent), lastOrderAt: c.last_at, since: c.created_at })),
      total: count.n,
      page,
      pages: Math.max(1, Math.ceil(count.n / limit)),
    });
  });

  app.get('/api/admin/customers.csv', auth(), async (_req, res) => {
    const rows = await db.query(
      `SELECT c.*, ${CUSTOMER_STATS} FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id ORDER BY spent DESC`
    );
    sendCsv(
      res,
      `pinepop-customers-${new Date().toISOString().slice(0, 10)}.csv`,
      ['სახელი', 'ტელეფონი', 'შეკვეთები', 'დახარჯა (₾)', 'ბოლო შეკვეთა', 'შენიშვნა'],
      rows.map((c) => [c.name, c.phone, c.orders, gel(c.spent), c.last_at ? new Date(c.last_at).toISOString().slice(0, 10) : '', c.note])
    );
  });

  app.get('/api/admin/customers/:id', auth(), async (req, res) => {
    const id = Number(req.params.id);
    const c = await db.one(
      `SELECT c.*, ${CUSTOMER_STATS} FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE c.id = $1 GROUP BY c.id`,
      [id]
    );
    if (!c) throw new HttpError(404, 'მომხმარებელი ვერ მოიძებნა');
    const [orders, flavors] = await Promise.all([
      db.query(`SELECT o.*, ${ITEMS_SUMMARY} FROM orders o WHERE o.customer_id = $1 ORDER BY o.id DESC`, [id]),
      db.query(
        `SELECT i.flavor, i.color, sum(i.qty)::int AS qty FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.customer_id = $1 AND o.status <> 'cancelled' GROUP BY i.flavor, i.color ORDER BY qty DESC`,
        [id]
      ),
    ]);
    res.json({
      customer: { id: c.id, name: c.name, phone: c.phone, note: c.note, orders: c.orders, spent: gel(c.spent), lastOrderAt: c.last_at, since: c.created_at },
      orders: orders.map(orderRow),
      flavors,
    });
  });

  app.patch('/api/admin/customers/:id', auth('customers:write'), async (req, res) => {
    const id = Number(req.params.id);
    const before = await db.one('SELECT * FROM customers WHERE id = $1', [id]);
    if (!before) throw new HttpError(404, 'მომხმარებელი ვერ მოიძებნა');
    const note = cleanText(req.body?.note, 1000);
    await db.query('UPDATE customers SET note = $1 WHERE id = $2', [note, id]);
    await audit(db, req.staff, {
      action: 'update',
      entity: 'customer',
      entityId: id,
      label: before.name,
      changes: before.note === note ? {} : { note: { from: before.note, to: note } },
    });
    res.json({ ok: true });
  });
}
