import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { HttpError, cleanText, rateLimiter } from './http.js';
import { audit } from './audit.js';

// Staff sign in with a username and password (scrypt-hashed). The session is a random
// token in an HttpOnly cookie; only its SHA-256 is stored, so a leaked database
// cannot be replayed as a login. Every route checks the role on the server.

const COOKIE = 'pp_admin';
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD = 10;

export const ROLES = {
  admin: 'ადმინი — ყველაფერი',
  manager: 'მენეჯერი — შეკვეთები, მარაგი, შეფასებები',
  viewer: 'მნახველი — მხოლოდ ნახვა',
};

// What each role may change. Everyone signed in may *see* the dashboard pages,
// except the ones listed for admins only.
const CAN = {
  'orders:write': ['admin', 'manager'],
  'customers:write': ['admin', 'manager'],
  'products:write': ['admin', 'manager'],
  'reviews:write': ['admin', 'manager'],
  'coupons:write': ['admin'],
  'content:write': ['admin'],
  'settings:write': ['admin'],
  staff: ['admin'],
  audit: ['admin'],
  database: ['admin'],
};
export const permissionsOf = (role) => Object.keys(CAN).filter((p) => CAN[p].includes(role));

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// A readable strong password: 4 groups of 4 from an alphabet without look-alikes.
export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return chars.match(/.{4}/g).join('-');
}

export function checkUsername(value) {
  const username = cleanText(value, 40);
  if (!/^[\w.@-]{3,40}$/.test(username)) throw new HttpError(400, 'ლოგინი: 3–40 ლათინური ასო, ციფრი ან . _ - @');
  return username;
}

export function checkPassword(value) {
  const password = String(value || '');
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `პაროლი მინიმუმ ${MIN_PASSWORD} სიმბოლო`);
  return password;
}

function readCookie(req, name) {
  for (const part of (req.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function authRoutes(app, db) {
  const loginLimit = rateLimiter(10, 15 * 60 * 1000);

  async function currentStaff(req) {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    return db.one(
      `SELECT s.token_hash, st.id, st.username, st.name, st.role FROM sessions s
       JOIN staff st ON st.id = s.staff_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND st.active`,
      [sha256(token)]
    );
  }

  // auth()            → any signed-in staff member
  // auth('staff')     → only roles allowed that permission
  const auth =
    (permission) =>
    async (req, _res, next) => {
      const staff = await currentStaff(req);
      if (!staff) throw new HttpError(401, 'საჭიროა შესვლა');
      if (permission && !CAN[permission]?.includes(staff.role)) {
        throw new HttpError(403, 'ამ მოქმედების უფლება არ გაქვს');
      }
      req.staff = staff;
      next();
    };

  app.post('/api/admin/login', async (req, res) => {
    // limited per address and per account: one stops spraying many logins, the other grinding one
    const account = `u:${String(req.body?.username || '').toLowerCase()}`;
    if (!loginLimit(`ip:${req.ip}`) || !loginLimit(account)) throw new HttpError(429, 'ძალიან ბევრი მცდელობა. სცადე 15 წუთში.');
    const username = cleanText(req.body?.username, 40);
    const staff = await db.one('SELECT * FROM staff WHERE username = $1', [username]);
    if (!staff || !staff.active || !verifyPassword(String(req.body?.password || ''), staff.password_hash)) {
      throw new HttpError(401, 'არასწორი ლოგინი ან პაროლი');
    }
    await db.query('DELETE FROM sessions WHERE expires_at <= now()');
    const token = randomBytes(32).toString('base64url');
    await db.query(
      `INSERT INTO sessions (token_hash, staff_id, expires_at, user_agent) VALUES ($1, $2, now() + interval '14 days', $3)`,
      [sha256(token), staff.id, String(req.get('user-agent') || '').slice(0, 200)]
    );
    await db.query('UPDATE staff SET last_login_at = now() WHERE id = $1', [staff.id]);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_MS, path: '/' });
    await audit(db, { username: staff.username }, { action: 'login', entity: 'staff', entityId: staff.id, label: staff.username });
    res.json({ username: staff.username });
  });

  app.post('/api/admin/logout', async (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/admin/me', auth(), async (req, res) => {
    const me = await db.one('SELECT id, username, name, role, password_changed_at FROM staff WHERE id = $1', [req.staff.id]);
    res.json({ ...me, permissions: permissionsOf(me.role) });
  });

  // Your own account: login, display name, password. Always needs the current password.
  app.put('/api/admin/account', auth(), async (req, res) => {
    const me = await db.one('SELECT * FROM staff WHERE id = $1', [req.staff.id]);
    if (!verifyPassword(String(req.body?.currentPassword || ''), me.password_hash)) {
      throw new HttpError(400, 'მიმდინარე პაროლი არასწორია');
    }
    const username = checkUsername(req.body?.username);
    const name = cleanText(req.body?.name, 60);
    if (await db.one('SELECT 1 FROM staff WHERE username = $1 AND id <> $2', [username, me.id])) {
      throw new HttpError(409, 'ეს ლოგინი დაკავებულია');
    }
    const newPassword = req.body?.newPassword ? checkPassword(req.body.newPassword) : null;
    await db.query(
      `UPDATE staff SET username = $1, name = $2, password_hash = $3,
              password_changed_at = CASE WHEN $4 THEN now() ELSE password_changed_at END
       WHERE id = $5`,
      [username, name, newPassword ? hashPassword(newPassword) : me.password_hash, !!newPassword, me.id]
    );
    // a new password signs out every other device
    if (newPassword) await db.query('DELETE FROM sessions WHERE staff_id = $1 AND token_hash <> $2', [me.id, req.staff.token_hash]);
    await audit(db, req.staff, {
      action: 'update',
      entity: 'account',
      entityId: me.id,
      label: username,
      changes: {
        ...(username !== me.username && { username: { from: me.username, to: username } }),
        ...(name !== me.name && { name: { from: me.name, to: name } }),
        ...(newPassword && { password: { from: '•••', to: 'შეიცვალა' } }),
      },
    });
    res.json({ username });
  });

  return auth;
}
