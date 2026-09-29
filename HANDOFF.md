# SalonOS — handoff notes (for the next Claude session)

Owner: Dharmender Saini (dhramsaini15@gmail.com). Live at **https://digitalca.co.in** (GitHub Pages, repo `dhramsaini/SalonOS`, branch `main`).
Start a new session by reading this file, then continue from **"What's next"** at the bottom.

## What the app is
A salon management suite (staff, attendance, salary/incentive working, daily sales & expenses, vendors, P&L, reports) for multiple outlets.
React 18 via CDN, `React.createElement` (no JSX, no build step). `index.html` holds the page shell, CSS and a few small scripts;
the app code is in **`js/01-…14-*.js`** (split by area in #4 Stage A — the same code, loaded in that order as classic scripts sharing
one global scope). A file may only use, *at load time*, things declared in the same or an earlier file (functions are only called
later, so that's rarely an issue — check it when moving code between files).
PWA: `manifest.json`, `service-worker.js` (network-first). `tests.html` = self-tests. `supabase/` = database scripts + edge function.
`tools/bump-version.ps1` = release version helper.

## How data is stored (important)
- **Supabase** project `cuvcxxjbcmctsajhctju`. All app data lives in table **`kv_store(key text pk, value text, updated_at, updated_by)`** — one row per "sheet per outlet", e.g. `salonos_master_employees_outlet_5`. Keys ending `_outlet_<id>` belong to that outlet; others are shared.
- The browser keeps a working copy in `localStorage`. **`safeLocalSet(key,value)` is the only write path**; it pushes changed values to the cloud (unchanged values are NOT pushed — screens re-save on mount, and pushing those overwrote other users' work).
- Cloud sync (search `// ── Live cloud sync`): pushes are conditional on `updated_at` and **3-way merged** (`mergeCloudValues`: id-keyed lists merge record-by-record, colliding new ids get renumbered). Other users' changes arrive via Supabase Realtime (`kv_store` is in the `supabase_realtime` publication) + a 5 s fallback poll; applied only when the screen re-mounts (`cloudApplyUpdates` + `dataVersion` bump), held back while someone is typing/has a modal open.
- Deletes are stored as `value = NULL` (no delete policy on kv_store).
- **Documents** (Aadhaar/PAN/bank proof, cash-register photos, invoice attachments) are in private Storage bucket **`salonos-files`** under `outlet_<id>/…` or `global/…`; records hold `dataUrl: "sbfile:<path>"` and are opened via short-lived signed URLs (`openStoredFile`, `resolveAttachmentDataUrl`). New attachments are uploaded when saved (`externalizeAttachments`).
- `salonos_secret_*` keys (government-portal logins, report settings/state) are **Super Admin only**.

## Security model (database-enforced)
- `public.salonos_key_access(key, want_write)` decides every kv_store/storage access: Super Admin = all; Reviewer = read all outlets, no outlet writes; Owner/Salon Owner = read-only; others per outlet from `profiles.outlet_access` (`View Only` / `View and Edit`), falling back to `profiles.outlet_ids`. Only profiles with a real SalonOS role get anything. Accounts with two-step login must be at aal2 (`salonos_mfa_ok()`).
- `profiles`: users read only their own row; only active Super Admins manage others (`is_active_super_admin()`).
- Both Super Admins (dhramsaini15@gmail.com, ca.dharmendersaini@yahoo.com) have **TOTP two-step login ON** — signing in needs the owner's authenticator code (Claude can't do it).
- Public sign-up is OFF in Supabase Auth; min password length 8. Users are created via the `create-user` edge function (admin API). Permanent delete: `admin_delete_user(uuid)`.
- Users today: Payal Roy (Salon Manager, outlets 5 & 6 View and Edit), Amit Verma (Reviewer), the two Super Admins.
- Outlets: **5 = Mysha Ventures LLP**, **6 = Rudraaksh Wellness Private Limited**.

## Other Supabase pieces
- `kv_backups` + `salonos_take_backup()` / `salonos_restore_backup(id, outlet)`; nightly cron 02:00 IST (30 days kept; manual 90; kind `archive` = permanent — #5 is the archive of an old `app_storage` table, 80 rows, also saved as a file by the owner).
- `kv_audit` + trigger `kv_store_audit` (change history, 10-min grouping) + `salonos_restore_version(id)`; purged after 90 days by cron `salonos-nightly-cleanup`.
- `client_errors` (app error log, 60 days).
- Edge function **`salonos-reports`** (source `supabase/functions/salonos-reports/index.ts`, verify-JWT OFF, own auth): nightly 22:00 IST + monthly 1st 09:00 IST via cron (`salonos-report-daily/monthly`, pg_net). Email needs owner-added secrets `RESEND_API_KEY` + `REPORT_FROM` (Resend, domain verified); WhatsApp optional (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, template `salonos_daily_summary`). **Owner chose to skip email setup for now.**
- SQL scripts that built all of this: `supabase/step0…step5*.sql` (already applied — don't re-run blindly).

## How to change and publish
1. Edit the right file in `js/` (or `index.html` for CSS/shell). Then run `powershell -File tools\bump-version.ps1 <new version>` —
   it sets `APP_VERSION` (js/01-foundation.js), `version.json` and the `?v=` on every script tag together (users get an
   "Update now" banner, and browsers never mix old and new files).
2. Test locally (serve the folder, e.g. `python -m http.server`), open `tests.html` → must say all tests passed. Check phone width (≤640px) and desktop.
3. `git commit` + `git push origin main` → GitHub Pages is live in ~40 s. (Windows: `git config core.longpaths true`, `core.autocrlf false`.)
- Database changes: Supabase dashboard → SQL Editor. Test access rules by setting `request.jwt.claims` to a user's id inside a rolled-back transaction.
- Never put secrets/keys in the app or repo; the owner adds them in Supabase → Edge Functions → Secrets.

## Done so far (Sept 2026)
Cloud sync fixes & live updates · per-outlet database access rules · documents in private storage · nightly cloud backups + restore · change history + restore previous version · two-step login · auto-logout 30 min · HTTPS enforced · per-outlet appointment book · unused-document cleanup · error log · phone layout (bottom tabs, sheet picker, card view for list tables, bottom-sheet forms) · readability · update banner · outlet setup checklist · branded payslips (Salary Working → 📄 Payslips) · outlet comparison + data-gap alerts on dashboards · automatic reports (awaiting email setup) · self-tests (23 passing) · **phone one-day form for Daily Sales & Exp.**

## What's next (agreed plan — owner approved, nothing started yet)
**#4 Split `index.html` into a proper project**:
- Stage A: ✅ DONE (29 Sep 2026) — app code moved into `js/01…14-*.js`, byte-identical to before (verified), tests pass.
- Stage B: add a build step (bundle/minify/lint) with automatic deploy (GitHub Actions — this PC has no Node).
- Stage C: per-area tests.

**#3 Proper database tables**, one module at a time after #4 Stage A: Employees → Attendance → Daily Sales & Expenses → Advances/Penalties → Vendors/Invoices → … For each: new table with per-outlet RLS; dual-write (kv + table) with a daily parity check; backup before each step; switch reads to the table only when parity holds; keep a one-line rollback switch.

Other open items: email reports setup (owner); staff should reload the app; attendance & sales for 22–28 Sep 2026 were missing at both outlets.
