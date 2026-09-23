# Asset Portal — Enterprise Asset Management

Track everything the company owns, leases, stores, assigns or uses — laptops, SIM cards, scooties,
helmets, keys, forklifts, software licences, buildings — in one system. Admins define new
categories, asset types and custom fields from the UI; no code changes are needed.

## Quick start

Requirements: **Node.js 22+** (nothing else — PostgreSQL is bundled and runs from npm).

```bash
npm install
npm run dev
```

Open **http://localhost:5173** and sign in. The first run creates a local database in `.data/`
and loads demo data.

| Demo account        | Role                | Password    |
| ------------------- | ------------------- | ----------- |
| admin@acme.test     | Admin               | `Demo@1234` |
| it@acme.test        | IT / Asset Manager  | `Demo@1234` |
| hr@acme.test        | HR                  | `Demo@1234` |
| manager@acme.test   | Manager             | `Demo@1234` |
| rahul@acme.test     | Employee            | `Demo@1234` |

Try the exit flow: sign in as **HR**, open *Employees → Rahul Sharma → Change status → Notice
period*. His 7 assets (laptop, charger, SIM, access card, scooty, helmet, keys) land on a recovery
checklist and IT is notified. Sign in as **IT** to scan them back; the exit stays blocked until
every item is cleared or HR records an override with a reason.

## Scripts

| Command            | What it does                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| `npm run dev`      | Database + API (auto-restart) + web app (hot reload)                    |
| `npm test`         | Unit tests + API integration tests on a throwaway database             |
| `npm run build`    | Production build of the API and web app                                 |
| `npm start`        | Production mode on http://localhost:3000 (API serves the web app)       |
| `npm run db:reset` | Wipe the local database and reload demo data                            |

## Features

- **Universal asset system** — 9 starter categories and 55 asset types from IT to Facilities,
  all editable. Individual tracking (a laptop) or by quantity (gloves, licence seats).
  Auto asset tags (`LAP-000123`) and QR codes.
- **Dynamic types and fields** — per category (shared, e.g. Registration No. for all vehicles)
  and per type (e.g. RAM for laptops). Text, number, currency, date, yes/no, dropdown,
  multi-select, email, phone, URL; required / unique / min–max; drag to reorder; live form
  preview. Stored as JSONB, validated by the *same* rules in the browser and the API, searchable
  and filterable.
- **Custody** — assign to an employee, department, location, company, vendor or inventory;
  transfer and return with condition. Full assignment and ownership history. The database
  itself prevents double assignment.
- **Exit / notice period** — automatic recovery checklist of every held asset, IT/Admin
  notification, last working day countdown, returned / pending / damaged / missing tracking,
  scan-to-return, and completion blocked until cleared or an authorised override (with reason)
  is recorded. Completing the exit marks the employee Exited and disables their login.
- **Lifecycle** — Purchased → Received → Inventory → Available → Assigned → Transferred →
  Maintenance → Returned → Available → Retired → Disposed (plus Lost / Found). Only valid
  transitions are allowed; the UI shows only valid next actions.
- **Immutable history** — every important action is recorded (who, what, when, before/after).
  A database trigger rejects any UPDATE, DELETE or TRUNCATE of history.
- **Fast UI** — dashboard, Ctrl+K search across everything, instant filters kept in the URL,
  server-side pagination, table / card views, status badges, slide-over forms, bulk actions
  (assign, change status, move, print labels), QR / barcode labels, camera and USB-scanner
  scanning, keyboard shortcuts (`?` lists them), toasts, empty / loading / error states,
  responsive with dark mode.
- **Universal quick add** — `+ Add` (or `N`) for Employee, Asset, Asset type, Category,
  Department, Location, Vendor, Request, Ticket, Maintenance.
- **Requests, tickets, maintenance** — request → approve → fulfil (assigns the asset);
  tickets against assets; maintenance moves an asset into and back out of service.
- **Roles & permissions** — Admin, IT / Asset Manager, HR, Manager, Employee (self-service),
  all editable. Employees only see the assets they hold.

## Architecture

```
apps/api          NestJS + Drizzle ORM + PostgreSQL
  src/db          schema, migrations (drizzle/), seed
  src/modules     auth, org, employees, catalog, assets, exit, service, insights, admin
apps/web          React 19 + Vite + Tailwind CSS + Radix (shadcn-style) + TanStack Query
packages/shared   zod schemas, lifecycle rules, permissions, custom-field validation
scripts/          one-command dev / test / start / reset (bundled PostgreSQL)
```

Key design points:

- **Custom fields**: definitions live in `field_definitions`; values in `assets.attributes`
  (JSONB, GIN-indexed, part of the full-text search vector). `packages/shared/src/fields.ts`
  builds the validator from definitions — used by forms and by every API write.
- **Custody** is recorded in `allocations` (one row per assignment). A partial unique index
  allows only one active allocation per individually-tracked asset; every change locks the
  asset row (`SELECT … FOR UPDATE`) inside one transaction.
- **Lifecycle** is one table in `packages/shared/src/lifecycle.ts`, enforced by the API and
  used by the UI to show allowed actions.
- **Security**: httpOnly session cookies (hashed in the DB), argon2id passwords, login lockout,
  CSRF header check, helmet + CSP, permission guard on every route, row scoping in services.
- **AI-ready**: all reads and writes go through permission-checked services behind a REST API
  (`/api/...`), so an AI assistant can be added later that acts as the signed-in user and can
  never bypass security.

## Production

```bash
npm run build
DATABASE_URL=postgres://user:pass@host:5432/eam SEED_DEMO=false \
  ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a-strong-password' npm start
```

| Variable        | Default                                   | Notes                                   |
| --------------- | ----------------------------------------- | --------------------------------------- |
| `DATABASE_URL`  | bundled local PostgreSQL                  | Any PostgreSQL 16+                      |
| `PORT`          | `3000`                                    | API + web app port                      |
| `SEED_DEMO`     | `true`                                    | `false`: no demo data; creates roles + the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `COOKIE_SECURE` | `true` in production                      | Set `false` only when not behind HTTPS  |
| `DB_POOL_SIZE`  | `20`                                      | Connections per API instance            |

Seeding only runs on an empty database, so restarts never touch existing data.
