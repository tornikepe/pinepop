import { HttpError, cleanText } from '../http.js';
import { audit, diff } from '../audit.js';
import { CONTENT, getContent, saveContent } from '../content.js';
import { SETTINGS, getSettings, saveSettings } from '../settings.js';
import { gel, int, money } from './util.js';

const zoneOut = (z) => ({ id: z.id, name: z.name, fee: gel(z.fee), freeAbove: gel(z.free_above), eta: z.eta, sort: z.sort, active: z.active, orders: z.orders ?? 0 });

function readZone(body = {}) {
  const name = cleanText(body.name, 60);
  if (!name) throw new HttpError(400, 'ზონის სახელი ცარიელია');
  return {
    name,
    fee: money(body.fee ?? 0, { min: 0, max: 500, label: 'მიწოდების ფასი' }),
    free_above: body.freeAbove === '' || body.freeAbove == null ? null : money(body.freeAbove, { min: 0, max: 10000, label: 'უფასოა თანხიდან' }),
    eta: cleanText(body.eta, 40),
    sort: int(body.sort ?? 0, { min: -1000, max: 1000, label: 'რიგი' }),
    active: body.active !== false,
  };
}

function readFaq(body = {}) {
  const question = cleanText(body.question, 200);
  const answer = String(body.answer ?? '').replace(/\r\n/g, '\n').trim().slice(0, 1200);
  if (!question || !answer) throw new HttpError(400, 'კითხვა და პასუხი ორივე საჭიროა');
  return { question, answer, sort: int(body.sort ?? 0, { min: -1000, max: 1000, label: 'რიგი' }), active: body.active !== false };
}

export function siteRoutes(app, db, auth) {
  // ---------- texts ----------

  app.get('/api/admin/content', auth(), async (_req, res) => {
    res.json({ fields: CONTENT, values: await getContent(db) });
  });

  app.put('/api/admin/content', auth('content:write'), async (req, res) => {
    const { content, changes } = await saveContent(db, req.body);
    await audit(db, req.staff, { action: 'update', entity: 'content', label: 'საიტის ტექსტები', changes });
    res.json(content);
  });

  // ---------- settings ----------

  app.get('/api/admin/settings', auth(), async (_req, res) => {
    res.json({ fields: SETTINGS, values: await getSettings(db) });
  });

  app.put('/api/admin/settings', auth('settings:write'), async (req, res) => {
    const { settings, changes } = await saveSettings(db, req.body);
    await audit(db, req.staff, { action: 'update', entity: 'settings', label: 'პარამეტრები', changes });
    res.json(settings);
  });

  // ---------- delivery zones ----------

  app.get('/api/admin/zones', auth(), async (_req, res) => {
    const rows = await db.query(
      `SELECT z.*, (SELECT count(*) FROM orders o WHERE o.zone_id = z.id)::int AS orders
       FROM delivery_zones z ORDER BY z.sort, z.id`
    );
    res.json(rows.map(zoneOut));
  });

  app.post('/api/admin/zones', auth('settings:write'), async (req, res) => {
    const z = readZone(req.body);
    const row = await db.one(
      'INSERT INTO delivery_zones (name, fee, free_above, eta, sort, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [z.name, z.fee, z.free_above, z.eta, z.sort, z.active]
    );
    await audit(db, req.staff, { action: 'create', entity: 'zone', entityId: row.id, label: row.name });
    res.status(201).json(zoneOut(row));
  });

  app.put('/api/admin/zones/:id', auth('settings:write'), async (req, res) => {
    const id = Number(req.params.id);
    const before = await db.one('SELECT * FROM delivery_zones WHERE id = $1', [id]);
    if (!before) throw new HttpError(404, 'ზონა ვერ მოიძებნა');
    const z = readZone(req.body);
    if (!z.active) {
      const others = await db.one('SELECT count(*)::int AS n FROM delivery_zones WHERE active AND id <> $1', [id]);
      if (others.n === 0) throw new HttpError(400, 'მინიმუმ ერთი ზონა ჩართული უნდა იყოს');
    }
    const after = await db.one(
      'UPDATE delivery_zones SET name = $1, fee = $2, free_above = $3, eta = $4, sort = $5, active = $6 WHERE id = $7 RETURNING *',
      [z.name, z.fee, z.free_above, z.eta, z.sort, z.active, id]
    );
    await audit(db, req.staff, { action: 'update', entity: 'zone', entityId: id, label: after.name, changes: diff(before, after, ['name', 'fee', 'free_above', 'eta', 'sort', 'active']) });
    res.json(zoneOut(after));
  });

  app.delete('/api/admin/zones/:id', auth('settings:write'), async (req, res) => {
    const id = Number(req.params.id);
    const others = await db.one('SELECT count(*)::int AS n FROM delivery_zones WHERE active AND id <> $1', [id]);
    if (others.n === 0) throw new HttpError(400, 'ბოლო ჩართულ ზონას ვერ წაშლი');
    // orders keep their own copy of the city, so deleting a zone loses nothing
    const row = await db.one('DELETE FROM delivery_zones WHERE id = $1 RETURNING name', [id]);
    if (!row) throw new HttpError(404, 'ზონა ვერ მოიძებნა');
    await audit(db, req.staff, { action: 'delete', entity: 'zone', entityId: id, label: row.name });
    res.json({ ok: true });
  });

  // ---------- FAQ ----------

  app.get('/api/admin/faqs', auth(), async (_req, res) => {
    res.json(await db.query('SELECT * FROM faqs ORDER BY sort, id'));
  });

  app.post('/api/admin/faqs', auth('content:write'), async (req, res) => {
    const f = readFaq(req.body);
    const row = await db.one('INSERT INTO faqs (question, answer, sort, active) VALUES ($1, $2, $3, $4) RETURNING *', [f.question, f.answer, f.sort, f.active]);
    await audit(db, req.staff, { action: 'create', entity: 'faq', entityId: row.id, label: row.question });
    res.status(201).json(row);
  });

  app.put('/api/admin/faqs/:id', auth('content:write'), async (req, res) => {
    const id = Number(req.params.id);
    const before = await db.one('SELECT * FROM faqs WHERE id = $1', [id]);
    if (!before) throw new HttpError(404, 'კითხვა ვერ მოიძებნა');
    const f = readFaq(req.body);
    const after = await db.one('UPDATE faqs SET question = $1, answer = $2, sort = $3, active = $4 WHERE id = $5 RETURNING *', [f.question, f.answer, f.sort, f.active, id]);
    await audit(db, req.staff, { action: 'update', entity: 'faq', entityId: id, label: after.question, changes: diff(before, after, ['question', 'answer', 'sort', 'active']) });
    res.json(after);
  });

  app.delete('/api/admin/faqs/:id', auth('content:write'), async (req, res) => {
    const row = await db.one('DELETE FROM faqs WHERE id = $1 RETURNING question', [Number(req.params.id)]);
    if (!row) throw new HttpError(404, 'კითხვა ვერ მოიძებნა');
    await audit(db, req.staff, { action: 'delete', entity: 'faq', entityId: req.params.id, label: row.question });
    res.json({ ok: true });
  });
}
