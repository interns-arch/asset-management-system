# Build progress

Tracks the build milestones so work can resume after any interruption.

- [x] 1. Project setup: npm workspaces, embedded PostgreSQL, NestJS API, auth + sessions, roles & permissions, append-only history
- [x] 2. Companies, departments, locations, vendors, employees
- [x] 3. Categories, asset types, custom fields + pre-loaded catalog (9 categories, 55 types)
- [x] 4. Assets: CRUD, lifecycle, assign/transfer/return, history, filters, search, bulk, QR labels and scanning
- [x] 5. Exit workflow: checklist, notifications, scan-to-return, blocking, override
- [x] 6. Requests, tickets, maintenance, dashboard, global search
- [x] 7. Web app (React): shell, pages, forms, keyboard shortcuts, responsive + dark mode
- [x] 8. Automated tests (22 passing), end-to-end browser check of the exit flow, production build, README

## Possible next steps
- AI assistant on top of the permission-checked API (the design already allows it)
- Email notifications (SMTP) in addition to in-app notifications
- Warranty / licence / insurance expiry reminders as scheduled jobs
- CSV import and export of assets
- Single sign-on (Microsoft Entra ID / Google)
