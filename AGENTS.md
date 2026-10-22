# Notes for AI coding agents

PINEPOP is a one-page Georgian shop (pineapple + Kool-Aid powder, sold by the jar) with a
procedural Three.js scene, an order API on Express + SQLite and an admin panel.
The owner speaks Georgian; all visible text on the site and in the admin is Georgian.

## Run and check

```bash
npm install
npm run dev        # Express + Vite middleware on PORT (default 3000), hot reload for src/
npm run build      # must pass before any commit
```

- Server code (`server/`) is not hot-reloaded — restart `npm run dev` after editing it.
- The storefront needs the server running: it loads everything from `GET /api/site`.
- Check changes in a browser, desktop and phone width (375 px). The 3D jar, the process
  section and the checkout drawer are the parts most likely to break.
- Admin is at `/admin`; the first login comes from `ADMIN_USER` / `ADMIN_PASSWORD` in `.env`.

## Rules of this codebase

- **Plain JavaScript (ES modules), no TypeScript, no framework.** Match the surrounding style:
  small modules, short comments that explain why, Georgian strings inline.
- **Nothing the owner might change is hardcoded.** Brand name, jar size, shelf life, delivery
  cities / fee / time and contacts are settings (`server/settings.js` → `src/content.js`).
  Flavours, prices, stock and colours are rows in `products`. New owner-facing values go into
  the settings schema, not into `index.html`.
- **Money is integer tetri** in the database (`2000` = 20 ₾). Prices and the delivery fee are
  read from the database when an order is placed — never trust amounts from the browser.
- **Schema changes** go in `server/db.js`: new tables in `SCHEMA` (`CREATE TABLE IF NOT
  EXISTS`), new columns in `migrate()` so existing database files keep working.
- **Admin routes** must use `requireAdmin` (session cookie checked on the server).
  Validate input on the server and escape anything rendered from the database.
- **3D**: the jar pose per section comes from `data-pose` / `data-pose-m` attributes in
  `index.html`; the process animation is a pure function of scroll progress in
  `src/scroll.js` → `processState()`. Keep it that way so scrolling back replays exactly.
- Never commit `.env` or `data/*.db*`.

## Where things are

See the "Project structure" section of `README.md`. The roadmap is `PLAN.md` (Georgian);
tick items there when a stage is done.
