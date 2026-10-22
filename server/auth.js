import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { HttpError, cleanText, rateLimiter } from './http.js';

// Admin login: username + password (scrypt-hashed in the database),
// then an HttpOnly session cookie. Only a hash of the cookie is stored.

const COOKIE = 'pp_admin';
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

function readCookie(req, name) {
  for (const part of (req.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// First start: create the owner account from ADMIN_USER / ADMIN_PASSWORD in .env.
// After that the login is changed from the admin panel and .env is no longer used for it.
export function ensureAdmin(db, { username, password }) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM admins').get();
  if (n > 0) return;
  if (!password || password.length < MIN_PASSWORD) {
    console.warn(`⚠ ადმინი ჯერ არ არსებობს: .env-ში ჩაწერე ADMIN_USER და ADMIN_PASSWORD (მინ. ${MIN_PASSWORD} სიმბოლო) და გადატვირთე სერვერი.`);
    return;
  }
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username || 'admin', hashPassword(password));
  console.log(`✓ შეიქმნა ადმინი „${username || 'admin'}“`);
}

export function authRoutes(app, db) {
  const loginLimit = rateLimiter(10, 15 * 60 * 1000);

  function currentSession(req) {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    return db
      .prepare(
        `SELECT s.token_hash, a.id, a.username FROM sessions s
         JOIN admins a ON a.id = s.admin_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(sha256(token), Date.now());
  }

  function requireAdmin(req, _res, next) {
    const session = currentSession(req);
    if (!session) throw new HttpError(401, 'საჭიროა შესვლა');
    req.admin = session;
    next();
  }

  app.post('/api/admin/login', (req, res) => {
    if (!loginLimit(req.ip)) throw new HttpError(429, 'ძალიან ბევრი მცდელობა. სცადე 15 წუთში.');
    const username = cleanText(req.body?.username, 40);
    const password = String(req.body?.password || '');
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      throw new HttpError(401, 'არასწორი ლოგინი ან პაროლი');
    }
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)').run(
      sha256(token),
      admin.id,
      Date.now() + SESSION_MS
    );
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_MS, path: '/' });
    res.json({ username: admin.username });
  });

  app.post('/api/admin/logout', (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ username: req.admin.username }));

  // Change login and/or password. Always needs the current password.
  app.put('/api/admin/account', requireAdmin, (req, res) => {
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!verifyPassword(String(req.body?.currentPassword || ''), admin.password_hash)) {
      throw new HttpError(400, 'მიმდინარე პაროლი არასწორია');
    }
    const username = cleanText(req.body?.username, 40);
    if (!/^[\w.@-]{3,40}$/.test(username)) throw new HttpError(400, 'ლოგინი: 3–40 ლათინური ასო, ციფრი ან . _ - @');
    const taken = db.prepare('SELECT 1 FROM admins WHERE username = ? AND id != ?').get(username, admin.id);
    if (taken) throw new HttpError(409, 'ეს ლოგინი დაკავებულია');

    const newPassword = String(req.body?.newPassword || '');
    if (newPassword && newPassword.length < MIN_PASSWORD) {
      throw new HttpError(400, `ახალი პაროლი მინიმუმ ${MIN_PASSWORD} სიმბოლო`);
    }
    db.prepare('UPDATE admins SET username = ?, password_hash = ? WHERE id = ?').run(
      username,
      newPassword ? hashPassword(newPassword) : admin.password_hash,
      admin.id
    );
    // A new password signs out every other device.
    if (newPassword) {
      db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').run(admin.id, req.admin.token_hash);
    }
    res.json({ username });
  });

  return requireAdmin;
}
