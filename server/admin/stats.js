import { gel, dayRange } from './util.js';

// Georgia is UTC+4 all year (no daylight saving), so a "day" is a Tbilisi day.
const localDay = (col) => `((${col} AT TIME ZONE 'UTC') + interval '4 hours')::date`;
const LOCAL_DAY = localDay('created_at');
export const tbilisiToday = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);

export function statsRoutes(app, db, auth) {
  // Home: the numbers for the chosen period, against the period before it.
  app.get('/api/admin/dashboard', auth(), async (req, res) => {
    const days = dayRange(req.query.days);
    const today = tbilisiToday();
    const params = [today, days];
    const OD = localDay('o.created_at');
    const PERIOD = `${OD} > $1::date - $2::int AND ${OD} <= $1::date`;
    const PREV = `${OD} > $1::date - 2 * $2::int AND ${OD} <= $1::date - $2::int`;
    // profit = what the goods sold for after discount, minus what they cost to make (delivery is pass-through)
    const totals = (where) => `
      SELECT count(*)::int AS orders, coalesce(sum(o.total), 0)::int AS revenue,
             coalesce(sum(o.subtotal - o.discount - coalesce(i.cost, 0)), 0)::int AS profit,
             coalesce(sum(i.jars), 0)::int AS jars
      FROM orders o
      LEFT JOIN (SELECT order_id, sum(qty) AS jars, sum(qty * unit_cost) AS cost FROM order_items GROUP BY order_id) i
             ON i.order_id = o.id
      WHERE o.status <> 'cancelled' AND ${where}`;

    const [now, prev, todayRow, visitors, visitorsPrev, series, flavors, lowStock, recent, open, pendingReviews] = await Promise.all([
      db.one(totals(PERIOD), params),
      db.one(totals(PREV), params),
      db.one(totals(`${OD} = $1::date`), [today]),
      db.one(`SELECT count(*)::int AS n FROM visits WHERE day > $1::date - $2::int AND day <= $1::date`, params),
      db.one(`SELECT count(*)::int AS n FROM visits WHERE day > $1::date - 2 * $2::int AND day <= $1::date - $2::int`, params),
      db.query(
        `SELECT d::date::text AS day,
                coalesce(o.revenue, 0)::int AS revenue, coalesce(o.orders, 0)::int AS orders, coalesce(v.visitors, 0)::int AS visitors
         FROM generate_series($1::date - ($2::int - 1), $1::date, interval '1 day') d
         LEFT JOIN (SELECT ${LOCAL_DAY} AS day, sum(total) AS revenue, count(*) AS orders
                    FROM orders WHERE status <> 'cancelled' GROUP BY 1) o ON o.day = d::date
         LEFT JOIN (SELECT day, count(*) AS visitors FROM visits GROUP BY day) v ON v.day = d::date
         ORDER BY d`,
        params
      ),
      db.query(
        `SELECT i.flavor, max(i.color) AS color, sum(i.qty)::int AS qty, sum(i.qty * i.unit_price)::int AS revenue,
                sum(i.qty * (i.unit_price - i.unit_cost))::int AS profit
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.status <> 'cancelled' AND ${PERIOD}
         GROUP BY i.flavor ORDER BY qty DESC`,
        params
      ),
      db.query('SELECT id, flavor, color, stock, low_stock FROM products WHERE active AND stock <= low_stock ORDER BY stock'),
      db.query(
        `SELECT o.id, o.code, o.customer_name, o.total, o.status, o.created_at,
                (SELECT coalesce(sum(qty), 0)::int FROM order_items WHERE order_id = o.id) AS jars
         FROM orders o ORDER BY o.id DESC LIMIT 6`
      ),
      db.query(`SELECT status, count(*)::int AS n FROM orders WHERE status IN ('new', 'confirmed', 'delivering') GROUP BY status`),
      db.one(`SELECT count(*)::int AS n FROM reviews WHERE status = 'pending'`),
    ]);

    const kpi = (cur, before) => ({ value: cur, prev: before });
    res.json({
      days,
      today: { orders: todayRow.orders, revenue: gel(todayRow.revenue) },
      revenue: kpi(gel(now.revenue), gel(prev.revenue)),
      orders: kpi(now.orders, prev.orders),
      profit: kpi(gel(now.profit), gel(prev.profit)),
      jars: kpi(now.jars, prev.jars),
      aov: kpi(now.orders ? gel(Math.round(now.revenue / now.orders)) : 0, prev.orders ? gel(Math.round(prev.revenue / prev.orders)) : 0),
      visitors: kpi(visitors.n, visitorsPrev.n),
      conversion: kpi(visitors.n ? now.orders / visitors.n : null, visitorsPrev.n ? prev.orders / visitorsPrev.n : null),
      series: series.map((s) => ({ day: s.day, revenue: gel(s.revenue), orders: s.orders, visitors: s.visitors })),
      flavors: flavors.map((f) => ({ ...f, revenue: gel(f.revenue), profit: gel(f.profit) })),
      lowStock: lowStock.map((p) => ({ id: p.id, flavor: p.flavor, color: p.color, stock: p.stock, lowStock: p.low_stock })),
      recent: recent.map((o) => ({ id: o.id, code: o.code, name: o.customer_name, total: gel(o.total), status: o.status, at: o.created_at, jars: o.jars })),
      open: Object.fromEntries(open.map((o) => [o.status, o.n])),
      pendingReviews: pendingReviews.n,
    });
  });
}
