import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

// Applies every migrations/NNN_name.sql that has not run yet, each in its own transaction.
// To change the schema, add a new numbered file — never edit one that has shipped.
export async function migrate(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(DIR, file), 'utf8');
    await db.tx(async (q) => {
      for (const statement of splitStatements(sql)) await q.query(statement);
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`✓ migration ${file}`);
  }
}

// Migrations are plain DDL — split on semicolons at line ends, skip comments.
function splitStatements(sql) {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}
