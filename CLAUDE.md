# CLAUDE.md — Cartrend Asset Portal

Context for Claude Code on any machine. Read this first, then `PROGRESS.md` (what was built and
when, milestone by milestone) and `README.md` (features and scripts). `git log` has every change.

## What this is

Asset management portal for **CARTREND AUTOPARTS PVT LTD**: assets (laptops, chargers, SIMs, keys,
scooties…), assignment/return, new joiners, exits, requests, tickets, maintenance, reconciliation.
Single company and a single branch — "in store" means one default store. Company and location
fields were removed from the UI on purpose (2026-09-25/26); don't bring them back.

## Stack and layout

- npm workspaces, Node 22 (`.node-version`).
- `apps/api` — NestJS + Drizzle ORM on PostgreSQL. Migrations in `apps/api/drizzle/`
  (`npm run db:generate -- --name <snake_name>`, then keep the `NNNN_<name>.sql` naming and the tag in
  `meta/_journal.json`). Migrations run automatically on start.
- `apps/web` — React + Vite + Tailwind (shadcn-style components in `src/components/ui`).
- `packages/shared` — zod schemas, enums, permissions, lifecycle rules shared by API and web.
  Rebuild it (`npm run build -w @eam/shared`) before typechecking the API.
- Local dev uses an embedded PostgreSQL in `.data/` (port 5433), started by the scripts.

## Commands

- `npm run dev` — DB + API (port 3000) + web (http://localhost:5173). Demo logins are in README
  (`admin@cartrend.test` etc.).
- `npm run typecheck`, `npm test` (unit + API integration tests on a throwaway DB).
- `npm run build`, `npm start` (production; API serves the built web app).
- Override ports/DB with env: `API_PORT=3109`, `DATABASE_URL=postgres://postgres:postgres@localhost:5433/<db>`.

## How the user wants work done

- Build exactly what was asked — no extra infrastructure or "later" features (they rejected
  plans that added SSO, queues, email, observability). Map every item to their request.
- Pick the tech yourself; don't ask them to choose libraries.
- Commit at each milestone and add a line to `PROGRESS.md` (numbered list, with the date). Earlier
  work was lost when sessions were cut off, so checkpoint often.
- The user writes short messages, often in Indian English; confirm the intent from the code.
- No AI features inside the app unless they ask.

## Roles and flows (behaviour to preserve)

- Sidebar is per designation: IT/Admin = full operations; HR = Employees, New joiners, Exits only;
  CEO = Leadership role with a CEO-only Leadership page; Employee = view-only home with "My assets",
  requests, tickets, My QR.
- New joiner: HR submits → IT approves in Requests → New joiners → "Assign all".
- Asset codes: capitals, 3 digits, continue after the highest used (`LAP-013`, `CHG-013`).
- Assignments to a person start with `acceptance = 'PENDING'`; the person accepts from their home
  page or the asset page, and whoever assigned it is notified. Old assignments have `acceptance = null`.
- Asset photos: added on create or later via "Add photos" on the asset page (stored in Postgres, `allocation_photos`).

## Data and privacy

- Real data comes from Airtel business-portal connection exports and Salary Box HR exports (.xlsx).
- The Salary Box export contains Aadhaar / PAN / bank / address PII. It is parsed **in the browser**
  and only the needed columns reach the server. Never import, log, print or commit those fields.
- Never commit secrets (`.env`, server env files, SSH keys, passwords).

## Production (AWS EC2)

- Live at **http://52.66.83.8:4009** (since 2026-10-03). SSH as `ubuntu@52.66.83.8` with the key file
  `CT_EC2_key (1).pem`. It is NOT in the repo; ask the user where it is on this machine.
- `~/asset-portal/app` (a plain copy, **not** a git checkout) is mounted into container
  `asset-portal-app` (node:22-slim, `node scripts/start.mjs`, env from `~/asset-portal/app.env`,
  port 4009→3000). DB is container `asset-portal-db` on network `asset-portal-net`; its credentials
  are in `~/asset-portal/db.env`. `app.env` needs `PGSSLMODE=disable`.
- The server hosts many other apps whose ports move — re-check ports before changing anything.
- Deploy steps (confirm with the user first; it is their live system):
  1. Compare the md5 of each file you'll change on the server with the previous commit's version.
     If they differ, someone changed the server copy — stop and ask.
  2. Back up to `~/asset-portal/backups/`: the code being replaced plus `apps/*/dist`, and for
     schema changes a `pg_dump` (`docker exec asset-portal-db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip`).
  3. Copy the changed files over (`tar cf - <files> | ssh … 'cd ~/asset-portal/app && tar xf -'`).
  4. Build: `docker run --rm -v "$PWD":/app -w /app node:22-slim npm run build` in `~/asset-portal/app`.
  5. `docker restart asset-portal-app`; check `curl localhost:4009/api/config` and `docker logs`.

## Local quirks on the original Windows PC

- Another app (Kaampilot) may hold port 3000, so `npm run dev` thinks the portal is already running.
  Use `API_PORT=3109`.
- The local `eam` database's Drizzle migration log got entries from another app, so newer migrations
  can be skipped there. Test against a fresh scratch database
  (`DATABASE_URL=postgres://postgres:postgres@localhost:5433/<scratch>`) and drop it afterwards.
- Line endings are mixed (some files CRLF, most LF). Keep each file's existing endings when editing.
- In the Claude desktop browser pane the page is narrow; drive clicks through JavaScript, and keep
  scripts short (no long timers) when the pane is hidden.
