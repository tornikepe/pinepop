import express from 'express';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { connect } from './db/index.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { HttpError } from './http.js';
import { authRoutes } from './auth.js';
import { publicRoutes } from './public.js';
import { orderRoutes } from './admin/orders.js';
import { catalogRoutes } from './admin/catalog.js';
import { siteRoutes } from './admin/site.js';
import { systemRoutes } from './admin/system.js';
import { statsRoutes } from './admin/stats.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

const db = await connect({ url: process.env.DATABASE_URL, dir: resolve(ROOT, process.env.PGLITE_DIR || 'data/pglite') });
await migrate(db);
await seed(db, {
  sqliteFile: resolve(ROOT, 'data/pinepop.db'),
  adminUser: process.env.ADMIN_USER,
  adminPassword: process.env.ADMIN_PASSWORD,
});

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // behind a hosting proxy: real client IPs for rate limits
app.use(express.json({ limit: '50kb' }));

app.get('/api/health', async (_req, res) => {
  const started = Date.now();
  await db.one('SELECT 1');
  res.json({ ok: true, db: db.kind, ms: Date.now() - started });
});

publicRoutes(app, db);
const auth = authRoutes(app, db);
statsRoutes(app, db, auth);
orderRoutes(app, db, auth);
catalogRoutes(app, db, auth);
siteRoutes(app, db, auth);
systemRoutes(app, db, auth);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// ---------- frontend ----------

// Express treats "/admin" and "/admin/" as the same route, so only redirect the bare path.
app.get('/admin', (req, res, next) => (req.path === '/admin' ? res.redirect('/admin/') : next()));

if (isProd) {
  app.use(express.static(resolve(ROOT, 'dist'), { maxAge: '7d', index: 'index.html' }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    appType: 'mpa',
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (!(err instanceof HttpError) && status >= 500) console.error(err);
  const message = err instanceof HttpError ? err.message : status < 500 ? 'არასწორი მოთხოვნა' : 'სერვერის შეცდომა';
  res.status(status).json({ error: message });
});

server.listen(PORT, () => {
  console.log(`PINEPOP → http://localhost:${PORT}  (${isProd ? 'production' : 'dev'}, ${db.kind})`);
});

// close the database cleanly so PGlite flushes its files
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await db.close().catch(() => {});
    process.exit(0);
  });
}
