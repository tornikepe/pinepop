import { HttpError, cleanText } from '../http.js';
import { audit, diff } from '../audit.js';
import { ROLES, checkUsername, generatePassword, hashPassword } from '../auth.js';
import { paging } from './util.js';

const staffOut = (s) => ({
  id: s.id,
  username: s.username,
  name: s.name,
  role: s.role,
  active: s.active,
  lastLoginAt: s.last_login_at,
  passwordChangedAt: s.password_changed_at,
  createdAt: s.created_at,
  sessions: s.sessions ?? 0,
});

// Tables shown on the database page and included in a backup (sessions never are).
const TABLES = [
  'products', 'stock_movements', 'orders', 'order_items', 'order_events', 'customers', 'coupons',
  'delivery_zones', 'reviews', 'faqs', 'settings', 'content', 'staff', 'audit_log', 'visits',
];

export function systemRoutes(app, db, auth) {
  // ---------- staff ----------

  app.get('/api/admin/staff', auth('staff'), async (_req, res) => {
    const rows = await db.query(
      `SELECT s.*, (SELECT count(*) FROM sessions x WHERE x.staff_id = s.id AND x.expires_at > now())::int AS sessions
       FROM staff s ORDER BY s.id`
    );
    res.json({ staff: rows.map(staffOut), roles: ROLES });
  });

  // Inviting someone mints a strong password, shows it once, and stores only its hash.
  app.post('/api/admin/staff', auth('staff'), async (req, res) => {
    const username = checkUsername(req.body?.username);
    const role = ROLES[req.body?.role] ? req.body.role : 'viewer';
    const name = cleanText(req.body?.name, 60);
    if (await db.one('SELECT 1 FROM staff WHERE username = $1', [username])) throw new HttpError(409, 'ეს ლოგინი დაკავებულია');
    const password = generatePassword();
    const row = await db.one('INSERT INTO staff (username, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING *', [
      username,
      name,
      role,
      hashPassword(password),
    ]);
    await audit(db, req.staff, { action: 'create', entity: 'staff', entityId: row.id, label: username, changes: { role: { from: null, to: role } } });
    res.status(201).json({ staff: staffOut(row), password });
  });

  async function keepOneAdmin(id, nextRole, nextActive) {
    const others = await db.one(`SELECT count(*)::int AS n FROM staff WHERE role = 'admin' AND active AND id <> $1`, [id]);
    if (others.n === 0 && (nextRole !== 'admin' || !nextActive)) throw new HttpError(400, 'მინიმუმ ერთი აქტიური ადმინი უნდა დარჩეს');
  }

  app.patch('/api/admin/staff/:id', auth('staff'), async (req, res) => {
    const id = Number(req.params.id);
    const before = await db.one('SELECT * FROM staff WHERE id = $1', [id]);
    if (!before) throw new HttpError(404, 'თანამშრომელი ვერ მოიძებნა');
    const role = ROLES[req.body?.role] ? req.body.role : before.role;
    const active = req.body?.active === undefined ? before.active : !!req.body.active;
    const name = req.body?.name === undefined ? before.name : cleanText(req.body.name, 60);
    await keepOneAdmin(id, role, active);
    const after = await db.one('UPDATE staff SET role = $1, active = $2, name = $3 WHERE id = $4 RETURNING *', [role, active, name, id]);
    // a disabled account or a lowered role takes effect now, not at the next sign-in
    if (!active || role !== before.role) await db.query('DELETE FROM sessions WHERE staff_id = $1', [id]);
    await audit(db, req.staff, { action: 'update', entity: 'staff', entityId: id, label: after.username, changes: diff(before, after, ['role', 'active', 'name']) });
    res.json(staffOut(after));
  });

  app.post('/api/admin/staff/:id/password', auth('staff'), async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.one('SELECT username FROM staff WHERE id = $1', [id]);
    if (!row) throw new HttpError(404, 'თანამშრომელი ვერ მოიძებნა');
    const password = generatePassword();
    await db.query('UPDATE staff SET password_hash = $1, password_changed_at = now() WHERE id = $2', [hashPassword(password), id]);
    // signs out every device of that account (including yours, if it is your own)
    await db.query('DELETE FROM sessions WHERE staff_id = $1 AND token_hash <> $2', [id, req.staff.token_hash]);
    await audit(db, req.staff, { action: 'password', entity: 'staff', entityId: id, label: row.username });
    res.json({ password });
  });

  app.delete('/api/admin/staff/:id', auth('staff'), async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.staff.id) throw new HttpError(400, 'საკუთარ ანგარიშს ვერ წაშლი');
    await keepOneAdmin(id, null, false);
    const row = await db.one('DELETE FROM staff WHERE id = $1 RETURNING username', [id]);
    if (!row) throw new HttpError(404, 'თანამშრომელი ვერ მოიძებნა');
    await audit(db, req.staff, { action: 'delete', entity: 'staff', entityId: id, label: row.username });
    res.json({ ok: true });
  });

  // ---------- audit ----------

  app.get('/api/admin/audit', auth('audit'), async (req, res) => {
    const { limit, offset, page } = paging(req.query, { limit: 60 });
    const params = [];
    let where = '';
    if (req.query.entity) {
      params.push(String(req.query.entity));
      where = 'WHERE entity = $1';
    }
    const [rows, count] = await Promise.all([
      db.query(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, params),
      db.one(`SELECT count(*)::int AS n FROM audit_log ${where}`, params),
    ]);
    res.json({
      entries: rows.map((r) => ({ id: r.id, actor: r.actor, action: r.action, entity: r.entity, entityId: r.entity_id, label: r.label, changes: r.changes, at: r.created_at })),
      page,
      pages: Math.max(1, Math.ceil(count.n / limit)),
    });
  });

  // ---------- database ----------

  app.get('/api/admin/database', auth('database'), async (_req, res) => {
    const counts = {};
    for (const t of TABLES) counts[t] = (await db.one(`SELECT count(*)::int AS n FROM ${t}`)).n;
    const size = await db.one('SELECT pg_size_pretty(pg_database_size(current_database())) AS size, version() AS version');
    const migrations = await db.query('SELECT name, applied_at FROM schema_migrations ORDER BY name');
    res.json({ kind: db.kind, where: db.where, size: size.size, version: size.version.split(' ').slice(0, 2).join(' '), counts, migrations });
  });

  // Full JSON copy of every table except sessions — keep it somewhere safe, it holds
  // customers' phones and addresses and the staff password hashes.
  app.get('/api/admin/database/backup', auth('database'), async (req, res) => {
    const data = {};
    for (const t of TABLES) data[t] = await db.query(`SELECT * FROM ${t} ORDER BY 1`);
    await audit(db, req.staff, { action: 'backup', entity: 'database', label: 'სარეზერვო ასლი' });
    res.set('Content-Disposition', `attachment; filename="pinepop-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ createdAt: new Date().toISOString(), tables: data });
  });
}
