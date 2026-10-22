import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  flavor       TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  color        TEXT    NOT NULL,            -- hex, tints the 3D jar contents
  size_ml      INTEGER NOT NULL,            -- unused: jar size is a site setting now
  price_tetri  INTEGER NOT NULL,            -- money is stored in tetri (1 GEL = 100 tetri)
  stock        INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY,
  code            TEXT    NOT NULL UNIQUE,
  customer_name   TEXT    NOT NULL,
  phone           TEXT    NOT NULL,
  city            TEXT    NOT NULL,
  address         TEXT    NOT NULL,
  note            TEXT,
  total_tetri     INTEGER NOT NULL,            -- items + delivery
  delivery_tetri  INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'new',  -- new | confirmed | delivered | cancelled
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id                INTEGER PRIMARY KEY,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  qty               INTEGER NOT NULL,
  unit_price_tetri  INTEGER NOT NULL
);

-- Site texts and options edited from the admin panel (JSON values).
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id             INTEGER PRIMARY KEY,
  username       TEXT    NOT NULL UNIQUE,
  password_hash  TEXT    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,           -- sha256 of the cookie value
  admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL               -- unix ms
);
`;

// Starter catalogue — after the first run, edit flavours in the admin panel.
const SEED_PRODUCTS = [
  {
    slug: 'cherry',
    flavor: 'ალუბალი',
    description: 'კლასიკური წითელი. ტკბილი ალუბალი და მჟავე ანანასი — ყველაზე პოპულარული კომბინაცია.',
    color: '#ff2e4d',
  },
  {
    slug: 'blue-raspberry',
    flavor: 'ლურჯი ჟოლო',
    description: 'ელექტრო ლურჯი. ყველაზე მჟავე და ყველაზე ხალისიანი — ენაც გალურჯდება.',
    color: '#1fb3ff',
  },
  {
    slug: 'grape',
    flavor: 'ყურძენი',
    description: 'იისფერი და რბილი. ტკბილი ყურძენი ტროპიკულ ანანასთან ერთად.',
    color: '#9a5cff',
  },
  {
    slug: 'tropical-punch',
    flavor: 'ტროპიკული პუნში',
    description: 'ტროპიკული ხილის მიქსი. ცოტა მჟავე, ძალიან წვნიანი — ზაფხული ქილაში.',
    color: '#ff6a3d',
  },
];

// Columns added after the first release; older database files get them here.
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!cols.includes('delivery_tetri')) {
    db.exec('ALTER TABLE orders ADD COLUMN delivery_tetri INTEGER NOT NULL DEFAULT 0');
  }
}

export function openDb(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  if (n === 0) {
    const insert = db.prepare(
      `INSERT INTO products (slug, name, flavor, description, color, size_ml, price_tetri, stock, sort)
       VALUES (?, ?, ?, ?, ?, 720, 2000, 60, ?)`
    );
    SEED_PRODUCTS.forEach((p, i) => insert.run(p.slug, p.flavor, p.flavor, p.description, p.color, i + 1));
  }
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
