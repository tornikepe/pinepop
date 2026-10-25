import { mkdirSync } from 'node:fs';

// One small interface over two Postgres drivers:
//   - DATABASE_URL set → a real PostgreSQL server (Supabase, Neon, your own) through `pg`
//   - otherwise         → PGlite, a full Postgres compiled to WebAssembly that keeps its files
//                         in data/pglite. Nothing to install for local development.
// Both speak the same SQL, so the rest of the server never knows which one it got.
//
//   db.query(sql, params)  → rows
//   db.one(sql, params)    → first row or undefined
//   db.tx(async (q) => …)  → runs in a transaction; q has the same query/one

function wrap(runner) {
  const query = async (sql, params = []) => (await runner.query(sql, params)).rows;
  return { query, one: async (sql, params) => (await query(sql, params))[0] };
}

export async function connect({ url, dir }) {
  if (url) {
    const { default: pg } = await import('pg');
    // counts and sums come back as numbers, dates as plain YYYY-MM-DD strings
    pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
    pg.types.setTypeParser(1082, (v) => v);
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
    const db = wrap(pool);
    db.kind = 'postgres';
    db.where = new URL(url).hostname;
    db.exec = (sql) => pool.query(sql);
    db.tx = async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    };
    db.close = () => pool.end();
    return db;
  }

  const { PGlite } = await import('@electric-sql/pglite');
  mkdirSync(dir, { recursive: true });
  const lite = await PGlite.create(dir);
  const db = wrap(lite);
  db.kind = 'pglite';
  db.where = dir;
  db.exec = (sql) => lite.exec(sql);
  db.tx = (fn) => lite.transaction((t) => fn(wrap(t)));
  db.close = () => lite.close();
  return db;
}
