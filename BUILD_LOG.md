# Build Log — Timesheet Automation Portal

**Date:** 2026-10-20
**Status:** Complete and verified
**Target deployment:** Railway.app

---

## Verification

| Check | Result |
|---|---|
| Backend E2E tests (`npm test`) | **32 passed, 0 failed** |
| Frontend production build | **Succeeds** |
| Ran locally end-to-end | **Yes** — API on :5001, UI on :3000, logged in, data loaded |
| Login → dashboard → timesheets → reports | Verified in browser with real data |
| Upload + scan via HTTP API | Verified: 3/3 rows from a mixed-format CSV |
| OCR parser — free-form text | Verified: 2/2 rows from labelled blocks |
| OCR parser — pipe table | Verified: 2/2 rows |
| Manager approval via API | Verified: status, comment, approver_id all written |

Tests run on PGlite (real Postgres compiled to WASM) in a throwaway directory,
exercising the production SQL with no mocking.

---

## Bugs found and fixed during testing

1. **Any update to a row with start/end times returned 400.**
   Postgres returns `TIME` columns as `HH:MM:SS`, but validation only accepted `HH:MM`.
   When the PUT handler merged existing values back for re-validation, every approval
   and edit on a timed entry failed. Fixed by accepting optional seconds in
   `middleware/validation.js`.

2. **Approvals were silently not auditable** — a consequence of (1); the audit-log
   insert never ran because the update aborted first. Resolved by the same fix.

3. **Dashboard query used `TO_CHAR`,** a Postgres-specific formatter that made the
   endpoint untestable and the response locale-fixed. Moved date formatting to the
   frontend chart axis.

4. **`server.js` bound to port 5000 on `require`,** so importing the app for tests
   crashed with `EADDRINUSE`. Now guarded with `require.main === module`.

5. **Parallel agent output overwrote working config** with a broken Vite proxy
   (`rewrite` stripped `/api`, which the backend requires) and a `railway.json`
   pointing at a non-existent Dockerfile and health endpoints. Both reverted and
   re-verified.

6. **Charts rendered empty on a backgrounded tab.** Recharts' entry animation runs on
   `requestAnimationFrame`, which browsers throttle to zero when `document.hidden` is
   true — the `<g>` groups mounted with no `<path>` inside. Confirmed by measuring 0
   rAF ticks in 500 ms. Fixed with `isAnimationActive={false}` on every `Bar`/`Pie`;
   a reporting dashboard should paint its data immediately anyway.

7. **Local run needed a database that wasn't installable here** (no Homebrew, Docker,
   or Postgres on the machine). `db.js` now falls back to PGlite when no
   `DATABASE_URL`/`DB_HOST` is configured, and throws if that happens under
   `NODE_ENV=production`. This also let the test suite drop `pg-mem` and its
   schema-stripping workarounds.

---

## What was built

### Backend — Node.js / Express / PostgreSQL

| File | Purpose |
|---|---|
| `server.js` | App wiring, helmet, CORS, rate limits, SPA fallback, graceful shutdown |
| `db.js` | Postgres (`pg`) when configured, PGlite fallback for local dev — one interface |
| `routes/auth.js` | Login, token validation, password change |
| `routes/timesheets.js` | CRUD, transactional bulk import, upload + scan |
| `routes/reports.js` | Dashboard stats, summary matrix, timeline, CSV export |
| `routes/users.js` | Admin user management with last-admin guard |
| `services/ocr.service.js` | Excel / CSV / PDF / image → structured rows + confidence |
| `middleware/auth.js` | JWT issue and verify, role guards |
| `middleware/validation.js` | Timesheet and login rules, shared by single + bulk paths |
| `database/schema.sql` | 4 tables, CHECK constraints, 7 indexes, dedupe unique index |
| `scripts/init-db.js` | Idempotent schema apply + demo seed |
| `tests/e2e.test.js` | 32 API tests |

### Frontend — React 18 / Vite / Tailwind

| File | Purpose |
|---|---|
| `pages/Login.jsx` | Auth with inline validation and demo credential hints |
| `pages/Dashboard.jsx` | 4 stat cards, 14-day bar chart, category pie, recent entries |
| `pages/TimesheetForm.jsx` | Manual entry **and** upload/scan modes in one page |
| `pages/MyTimesheets.jsx` | Search, filter, sort, inline edit, CSV export, totals row |
| `pages/Reports.jsx` | Date-range reports, two charts, matrix table, day-wise log |
| `pages/Approvals.jsx` | Manager queue — approve/reject with mandatory reject reason |
| `pages/AdminPanel.jsx` | User CRUD, role changes, activate/deactivate |
| `components/OCRReviewTable.jsx` | Editable scan results; red = missing, amber = low confidence |
| `components/FileUploadZone.jsx` | Drag-drop with type/size validation and progress |
| `components/Logo.jsx` | EB monogram — real PNG with inline-SVG fallback |
| `api/client.js` | Axios instance, token injection, 401 auto-logout |

### Theme

Sampled from bharatenterprises.tech: near-black `#0A0A0A` surfaces, brand gold
`#F2B733` for primary actions / active nav / table headers, mint teal `#4FE3C1` for
data values and charts, Poppins throughout. Gold carries interaction, teal carries
data — so a number never looks like a button.

---

## Design decisions

**Scanning never writes directly.** `POST /upload` parses and returns rows; the user
reviews them in an editable table and submits separately. A bad scan cannot corrupt data.

**Per-field confidence, not a single score.** The parser marks each field individually —
a row read cleanly from Excel scores 0.95, an inferred category scores 0.4. The UI
highlights anything below 0.6 so weak reads get human attention instead of silent acceptance.

**Spreadsheets bypass OCR entirely.** `.xlsx`/`.csv` are read cell-by-cell with
auto-detected headers, so the most common upload format is exact rather than guessed.

**Scanned PDFs are rejected explicitly.** Rasterizing PDF pages for OCR needs a native
dependency that complicates Railway deploys. Rather than returning zero rows and looking
broken, the API returns a clear message telling the user to upload a photo or Excel file.

**Bulk import is atomic.** 50 scanned rows either all land or none do — no partial imports
to reconcile by hand.

**Authorization is server-enforced, not UI-enforced.** Hiding a button is not security;
every scoping rule is in the route handler and covered by a test.

---

**PGlite is for local dev only.** It is single-connection and file-backed; `db.js`
serialises queries through a promise chain to keep transactions intact. Production
uses real Postgres and the server refuses to boot without `DATABASE_URL`.

---

## Known limitations

- Scanned (image-only) PDFs are not OCR'd — see above.
- OCR accuracy on photos depends on image quality; weak fields are flagged, not guessed.
- Uploaded files are stored on local disk. On Railway this is ephemeral — move to S3 or
  Railway volumes if the original documents must be retained.
- `frontend/public/logo.png` is absent, so the SVG fallback renders. Drop the real brand
  PNG there for a pixel-exact mark.
- No email notifications yet.

---

## Next steps

1. Drop the real `logo.png` into `frontend/public/`.
2. Deploy to Railway (see `DEPLOYMENT.md`) — add the Postgres plugin for `DATABASE_URL`.
3. Point the Hostinger subdomain at the Railway domain via CNAME.
4. Change all demo passwords; set a real `JWT_SECRET`.
5. Add real employees through the Admin Panel.
6. Optional: S3 for upload retention, email notifications on approval.
