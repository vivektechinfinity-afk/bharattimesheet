# Timesheet Automation Portal

Hourly timesheet tracking for teams — manual entry **plus** document scanning that reads uploaded
timesheets (Excel, CSV, PDF, photos) and turns them into reviewable rows before anything is saved.

Dark UI in the bharatenterprises palette (teal `#00D4D4` / gold `#D4AF37` on `#0A0E27`).

---

## What it does

| Area | Details |
|---|---|
| **Manual entry** | Date, start/end time (hours auto-calculated), task, category, description |
| **Document scan** | Upload `.xlsx .xls .csv .pdf .png .jpg` → parsed into an editable table |
| **Nothing silent** | Every low-confidence or missing field is highlighted before you can submit |
| **Roles** | Employee (own rows) · Manager (approve, see all) · Admin (+ user management) |
| **Reports** | Day-wise log, employee × category matrix, charts, CSV export |
| **Audit** | Every approval/edit/delete recorded in `audit_logs` |

### How the scanning works

| Input | Method | Accuracy |
|---|---|---|
| Excel / CSV | Reads actual cells, auto-detects header row | Exact — no guessing |
| Text PDF | Extracts embedded text, then table/label parsing | High |
| Photo / scan | Tesseract OCR → table/label parsing | Good; weak fields get flagged |
| Scanned PDF | **Rejected with a clear message** — upload a photo or Excel instead | — |

The parser handles `20/10/2026`, `19-10-2026`, `2026-10-18`, `15 Oct 2026`, Excel serial dates,
`9:30 am`, `6:00 pm`, `0900`, `9.30`; derives missing hours from start/end times; and infers
category from the task text. Anything inferred rather than read is marked for review.

---

## Quick start

**Only Node.js 18+ is required.** With no `DATABASE_URL` set the app runs on
[PGlite](https://pglite.dev) — real Postgres compiled to WASM, stored in
`backend/.pgdata`. No database to install.

```bash
# 1. Install
npm run install:all

# 2. Configure
cp backend/.env.example backend/.env

# 3. Create tables + demo data
npm run init-db

# 4. Run (two terminals)
npm run dev:api      # http://localhost:5001
npm run dev:web      # http://localhost:3000
```

Open <http://localhost:3000>.

**Demo logins** (password `password123`):

| Role | Email |
|---|---|
| Admin | `admin@example.com` |
| Manager | `manager@example.com` |
| Employee | `emp1@example.com` |

> Change these before production. `SEED_PASSWORD` in `.env` controls the seeded password.

### Using real PostgreSQL instead

Set `DATABASE_URL` in `backend/.env` and the app switches to the `pg` driver
automatically. Production **requires** it — the server refuses to start with
`NODE_ENV=production` and no `DATABASE_URL`.

```
DATABASE_URL=postgresql://user:pass@localhost:5432/timesheet_db
```

---

## Project layout

```
backend/
  server.js              Express app, security middleware, SPA fallback
  db.js                  Postgres (pg) or PGlite fallback — same interface
  routes/
    auth.js              login, token validation, password change
    timesheets.js        CRUD, bulk import, file upload + scan
    reports.js           dashboard, summary, timeline, CSV export
    users.js             admin user management
  services/ocr.service.js  Excel/CSV/PDF/image → structured rows
  middleware/
    auth.js              JWT issue + verify, role guards
    validation.js        timesheet + login rules
  database/schema.sql    tables, indexes, constraints
  scripts/init-db.js     schema + demo seed
  tests/e2e.test.js      32 API tests (in-memory Postgres)

frontend/src/
  pages/                 Login, Dashboard, TimesheetForm, MyTimesheets,
                         Reports, Approvals, AdminPanel
  components/            Layout, Navbar, Sidebar, StatsCard, StatusBadge,
                         FileUploadZone, OCRReviewTable
  api/client.js          axios instance + typed endpoint map
  context/AuthContext.jsx
```

---

## API

All routes except `/api/health` and `/api/auth/login` require `Authorization: Bearer <token>`.

### Auth
```
POST   /api/auth/login             { email, password } → { token, user }
GET    /api/auth/validate          → current user
POST   /api/auth/change-password   { currentPassword, newPassword }
```

### Timesheets
```
GET    /api/timesheets             ?employeeId&status&category&startDate&endDate&limit
GET    /api/timesheets/:id
POST   /api/timesheets/create      single entry
POST   /api/timesheets/bulk        { rows: [...] }  — all-or-nothing
POST   /api/timesheets/upload      multipart file → parsed rows (saves nothing)
PUT    /api/timesheets/:id         edit / approve / reject
DELETE /api/timesheets/:id
```

### Reports
```
GET    /api/reports/dashboard      stat cards + 14-day chart + category split
GET    /api/reports/summary        ?startDate&endDate&status&employeeId
GET    /api/reports/timeline       day-by-day work log
GET    /api/reports/export         CSV download
```

### Users (admin)
```
GET    /api/users                  admin + manager
POST   /api/users                  admin only
PUT    /api/users/:id              admin only
DELETE /api/users/:id              soft delete (keeps timesheet history)
```

---

## Security

Enforced server-side and covered by tests:

- Employees can only read, edit, and delete **their own** rows — passing another `employeeId`
  in the query or body is ignored, not honoured.
- Employees cannot approve anything, and cannot edit a row once it is `Approved`.
- Login returns the same 401 for unknown email and wrong password (no user enumeration).
- Bulk import is a single transaction — one bad row rejects the whole batch.
- Passwords hashed with bcrypt; JWT expiry configurable.
- Rate limits: 20 login attempts / 15 min, 300 API calls / min.
- `helmet` headers, CORS allowlist via `CORS_ORIGIN`.
- The last active admin cannot demote or deactivate themselves.

---

## Testing

```bash
npm test
```

Runs 32 end-to-end tests against the real route handlers on a throwaway PGlite database —
no install, no query mocking, and the same SQL that runs in production. Covers auth,
validation, role scoping, bulk import atomicity, the approval workflow, reports, and
user management.

## Theme

Palette and type sampled from bharatenterprises.tech:

| Token | Value | Use |
|---|---|---|
| `dark-900` | `#0A0A0A` | page background |
| `dark-800` | `#121212` | cards, panels |
| `accent-gold` | `#F2B733` | primary actions, active nav, table headers |
| `accent-teal` | `#4FE3C1` | data values, charts, approved state |
| font | Poppins | headings and body |

The "EB" monogram lives in `src/components/Logo.jsx`. It renders
`frontend/public/logo.png` (also used as the favicon) and falls back to an inline SVG
recreation if that file is missing, so the app never shows a broken image.

> The current `logo.png` is 68×68, which upscales on retina displays. Replace it with a
> 256×256 transparent PNG for a crisp mark — no code change needed.
> See [frontend/public/README.md](frontend/public/README.md).

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Railway and VPS instructions.

Short version for Railway:
1. Push to GitHub, create a Railway project from the repo.
2. Add the **PostgreSQL** plugin — `DATABASE_URL` is injected automatically.
3. Set `JWT_SECRET` (`openssl rand -base64 48`) and `NODE_ENV=production`.
4. Deploy. The backend serves the built frontend, so one service runs both.
5. Run `npm run init-db` once from the Railway shell to create tables.

---

## License

MIT
