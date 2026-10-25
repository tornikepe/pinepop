// Lost the admin password? Stop the server, then:
//   npm run admin:reset -- <username>
// Prints a new password once and signs that account out everywhere.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { generatePassword, hashPassword } from '../auth.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const username = process.argv[2];
const db = await connect({ url: process.env.DATABASE_URL, dir: resolve(ROOT, process.env.PGLITE_DIR || 'data/pglite') });
await migrate(db);

const staff = await db.query('SELECT id, username, role, active FROM staff ORDER BY id');
const target = staff.find((s) => s.username === username);
if (!target) {
  console.log(username ? `„${username}“ ვერ მოიძებნა.` : 'მიუთითე ლოგინი: npm run admin:reset -- <ლოგინი>');
  console.log('არსებული ანგარიშები:', staff.map((s) => `${s.username} (${s.role})`).join(', ') || '—');
  await db.close();
  process.exit(1);
}

const password = generatePassword();
await db.query('UPDATE staff SET password_hash = $1, password_changed_at = now(), active = true WHERE id = $2', [hashPassword(password), target.id]);
await db.query('DELETE FROM sessions WHERE staff_id = $1', [target.id]);
await db.query(
  `INSERT INTO audit_log (actor, action, entity, entity_id, label) VALUES ('terminal', 'password', 'staff', $1, $2)`,
  [String(target.id), target.username]
);
console.log(`\n  ${target.username} — ახალი პაროლი:  ${password}\n  შეინახე; მეორედ აღარ გამოჩნდება.\n`);
await db.close();
