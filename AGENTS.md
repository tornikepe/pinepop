# Notes for AI coding agents

PINEPOP is a one-page Georgian shop (pineapple + Kool-Aid powder, sold by the jar) with a
procedural Three.js scene, an Express API on PostgreSQL, and a staff dashboard at `/admin`.
The owner speaks Georgian; all visible text on the site and in the dashboard is Georgian.

## Run and check

```bash
npm install
npm run dev        # Express + Vite middleware on PORT (default 3000), hot reload for src/ and admin/
npm run build      # must pass before any commit
npm run admin:reset -- <username>   # new password for a staff account (server stopped)
```

- Locally the database is **PGlite** in `data/pglite` (one process only — stop the server before
  running scripts against it). With `DATABASE_URL` set it is a real Postgres via `pg`.
- Server code (`server/`) is not hot-reloaded — restart `npm run dev` after editing it.
- The storefront loads everything from `GET /api/site`; the dashboard from `/api/admin/*`.
- Check changes in a browser at desktop and phone width (375 px): the 3D jar, the process
  section, the checkout and order-status drawers, and the dashboard tables are the parts most
  likely to break. Try the dashboard in both themes.

## Rules of this codebase

- **Plain JavaScript (ES modules), no TypeScript, no framework, no ORM.** SQL is written by hand
  with `$1` placeholders through `db.query` / `db.one` / `db.tx` (`server/db/index.js`).
- **Schema changes** are a new numbered file in `server/db/migrations/` (`002_…sql`). Never edit
  a migration that has shipped. Cast counts and sums with `::int` so both drivers return numbers.
- **Nothing the owner might change is hardcoded.** Texts go in `server/content.js` (and get a
  `data-text` attribute in `index.html`); options go in `server/settings.js`; lists (flavours,
  zones, FAQ, coupons) are tables. Secrets go in the `meta` table, never in `settings`.
- **Money is integer tetri** (`2000` = 20 ₾). The server recomputes every price, discount and
  delivery fee when an order is placed — never trust amounts from the browser. Orders are
  snapshots: copy names and prices onto them.
- **Every admin route** uses `auth()` or `auth('<permission>')` (see `CAN` in `server/auth.js`)
  and every change a staff member makes is written with `audit()` including before/after.
- Validate input on the server; escape anything rendered from the database (`esc`).
- **3D**: jar poses come from `data-pose` / `data-pose-m`; the process animation is a pure
  function of scroll progress (`processState()` in `src/scroll.js`). Keep it that way.
- **Charts** in the dashboard: one colour per chart from `--chart` (validated per theme), a
  table view, hover/focus tooltips; never a second y-axis.
- Never commit `.env`, `data/*.db*` or `data/pglite/`.

## Where things are

See "Project structure" in `README.md`. The roadmap is `PLAN.md` (Georgian); tick items there
when a stage is done.
