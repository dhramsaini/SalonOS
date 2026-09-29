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
- Public sign-up is OFF in Supabase Auth; min password length 8. Users are created via the `create-user` edge function (admin API). Permanent delete: `admin_delete_user(uuid)`. A Super Admin sets a new password for another (non-Super-Admin) user via edge function `set-user-password` (source in `supabase/functions/`, Verify JWT ON; checks Super Admin + aal2 itself) — User Management → Edit → New Password (👁 to show while typing). Existing passwords can never be viewed (hashed).
- Salon Manager / ASM get only the Summary Approval screen for Salary / Incentive Working unless given "Edit" on that sheet for the outlet (`summaryApprovalOnly` in js/02-shared.js) — then the real sheet plus a Summary Approval tab.
- Users today: Payal Roy (Salon Manager, outlets 5 & 6 View and Edit), Amit Verma (Reviewer — since step8 no outlets until given some), the two Super Admins.
- Since v2026.09.29.7: everyone except Super Admin (Reviewer included) sees only outlets given in User Management (`userCanSeeOutlet` in js/02-shared.js, same rule as the database); a signed-in user's rights are re-read every 30 s / on focus, so changes apply without logging out.
- Outlets: **5 = Mysha Ventures LLP**, **6 = Rudraaksh Wellness Private Limited**.

## Other Supabase pieces
- `kv_backups` + `salonos_take_backup()` / `salonos_restore_backup(id, outlet)`; nightly cron 02:00 IST (30 days kept; manual 90; kind `archive` = permanent — #5 is the archive of an old `app_storage` table, 80 rows, also saved as a file by the owner).
- `kv_audit` + trigger `kv_store_audit` (change history, 10-min grouping) + `salonos_restore_version(id)`; purged after 90 days by cron `salonos-nightly-cleanup`.
- `client_errors` (app error log, 60 days).
- Edge function **`salonos-reports`** (source `supabase/functions/salonos-reports/index.ts`, verify-JWT OFF, own auth): nightly 22:00 IST + monthly 1st 09:00 IST via cron (`salonos-report-daily/monthly`, pg_net). Email needs owner-added secrets `RESEND_API_KEY` + `REPORT_FROM` (Resend, domain verified); WhatsApp optional (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, template `salonos_daily_summary`). **Owner chose to skip email setup for now.**
- **`employees` table** (step6): one row per employee (`outlet_id, id, data jsonb, name, status, deleted`), filled automatically by trigger `kv_store_sync_employees` from the app's employee lists; read-only RLS by outlet access. Check it with `select * from salonos_employees_parity();` (all `mismatched` must be 0).
- **Bank fetch (Account Aggregator, any bank / any account type)**: edge function `bank-aa` (source `supabase/functions/bank-aa`, Verify JWT ON; checks salonos_key_access on the outlet's bank_statement key) + table `bank_aa_links` (step10, service-role only). Needs owner-added secrets SETU_CLIENT_ID, SETU_CLIENT_SECRET, SETU_PRODUCT_INSTANCE_ID, SETU_ENV (sandbox|production) from Setu Bridge — until then the Bank Statement tab's "Fetch statement from bank" card says "Not switched on yet". Linking = OTP approval on the AA page (no bank passwords); one approval covers 2 years back → 1 year ahead (falls back to today if Setu refuses a future end). UI: `BankFetchPanel` in js/10-collections-bank.js; import is append-only, dedupe by txnId or date+description+amounts+balance. Setu auth: sends x-client-id/secret headers AND a Bearer token from orgservice login — verify against Setu sandbox once keys exist.
- SQL scripts that built all of this: `supabase/step0…step10*.sql` (already applied — don't re-run blindly).

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

## What's next (agreed plan — owner approved)
**#4 Split `index.html` into a proper project**:
- Stage A: ✅ DONE (29 Sep 2026) — app code moved into `js/01…14-*.js`, byte-identical to before (verified), tests pass.
- Stage B: ✅ DONE — GitHub Actions "Checks" on every push: `tools/check.mjs` (syntax, load order, duplicate names, versions) + `tools/run-tests.mjs` (self-tests in headless Chrome). (This PC has no Node/Python.)
- Stage C: per-area tests.

**#3 Proper database tables** — Employees Stage 1a ✅ DONE (29 Sep 2026): `employees` table kept in sync from the app by a database trigger; parity at creation: outlet 5 = 11/11, outlet 6 = 1/1, 0 mismatched. Stage 1b ✅ DONE (v2026.09.29.6): step7 adds `pos` + `raw`; the app rebuilds each outlet's employee list from the table on every load (`sheetsFromTables` in js/01-foundation.js) and compares it byte-for-byte with the kv copy — on a difference it uses the kv copy and logs to App errors. Saves still go to kv_store (trigger copies them in the same transaction). Rollback: `EMPLOYEES_FROM_TABLE=false`. Possible later step: save per record straight into the table (needs server-side handling of two people adding an employee with the same new id). **Attendance ✅ DONE (v2026.09.29.7, step9)**: `attendance` table, one row per employee-month (`rec_key` like E001_2026_7, `emp_id, year, month 1-12, days in data, present, off_days`), same trigger + load check; rollback `ATTENDANCE_FROM_TABLE=false`. Then, one module at a time: Daily Sales & Expenses → Advances/Penalties → Vendors/Invoices → … For each: new table with per-outlet RLS; dual-write (kv + table) with a daily parity check; backup before each step; switch reads to the table only when parity holds; keep a one-line rollback switch.

Other open items: email reports setup (owner); staff should reload the app; attendance & sales for 22–28 Sep 2026 were missing at both outlets.

## Incident 29 Sep 2026 (evening): "Signed in, but no profile is set up"
Password step succeeded (sessions created) but the profile request went out without the new login, for every account in the
owner's browser. Profiles/policies were fine. Likely cause: supabase-js ≥2.107 "lockless" session handling + several SalonOS
tabs sharing one saved login, where one tab's sign-out erases it for all tabs — and v2026.09.29.7's access check signed users out
whenever it couldn't read the profile. Prevention (v.11–.13): the access check never signs out unless status is Inactive; every
sign-out is scope 'local' (never logs other devices out); login retries the profile with the fresh token and hands the session
back to the library (setSession); failures are logged to client_errors ("Login: …", with a note if another SalonOS tab is
open); supabase-js pinned to 2.117.2 (change only with a login/2-step/live-sync test); the page and version.json bypass the
HTTP cache so fixes arrive immediately.
**Root cause found (v.14):** the login was shared by every tab/window through localStorage. A tab still holding an old, revoked
login failed to refresh it, removed the shared session and broadcast SIGNED_OUT (channel = storage key), wiping new logins made in
other tabs (reproduced with mocks: shared key → ANON, per-tab key → USER). Fix: `getSupabaseClient` stores the Supabase session in
sessionStorage under a per-tab key (`salonos_auth_key`), matching SalonOS's existing per-tab login. Everyone signs in once after
this update. Login failures still log to App errors ("Login: …").

## Bank statements (v2026.09.29.15) — owner chose "download from the bank's website", no gateway
- Bank Statement tab → "Get statement from your bank's website": saved accounts per outlet (kv `salonos_bank_accounts_outlet_<id>`:
  bank, account type, login type, last 4, optional exact login URL — any bank, custom URL for unlisted ones), period (quick picks or
  From/To), "Open bank website" → the user logs in ON THE BANK'S SITE and downloads → the connected Downloads folder (Chrome/Edge,
  File System Access) is polled every 3 s for 20 min for any .xlsx/.xls/.csv/.pdf saved after the click → `loadWorkbook(file,
  {from,to,append:true})` keeps only that period, skips duplicates, auto-classifies.
- PDF statements: `pdfStatementToRows` (pdf.js 3.11.174 from cdnjs) — text layout → rows; columns from the header line (right
  edge for amounts, left edge for Chq/Ref), running balance settles debit/credit, wrapped narration joined, password-protected PDFs
  prompt for the password (never stored). Scanned-image PDFs are not supported (no OCR).
- BANK_LOGIN_URLS (v.18): login pages taken from each bank's own website and checked to open: HDFC NetBanking, ICICI retail + CIBNext, Axis omni (Personal) / straight2axis (Corporate) / smedigital (Business), SBI onlinesbi + corp.sbi, Kotak knb2, BoB bobibanking + feba, IndusInd indusnet, IDFC my.idfcfirst. PNB, Canara, Union, Yes etc. still open the home page. Each saved account shows "→ opens <host>". (Earlier:
  ICICI Personal, Axis Corporate, SBI (all three); others open the bank's official home page.
- The Account Aggregator (Setu) card + `bank-aa` edge function + `bank_aa_links` table remain but the card is not rendered.
- Self-tests: 27 (incl. 2 PDF-statement tests using jsPDF).

## Vendor invoices & Tally connector (v2026.09.29.19)
- Outlet settings (Master Sheet → Vendor Invoices): `piAsExpense` — PI is an expense in its own month; the FIRST actual invoice
  with `linkedPI` (vendorId|PI no.) adds only actual − PI in its month (`vendorInvoiceExpenseEntries` in js/12-front-desk.js,
  used by vendorInvoiceCategorySumFor/BreakupFor → P&L). Payables/GST/Tally still exclude PIs. `attachmentRequired` — Vendor Sheet
  and Daily Sales invoice forms refuse to save without an attachment. `outletSettings(id)` (js/02-shared.js) reads current SALONS.
- Invoice forms: Doc Nature, Invoice/Voucher No., Invoice Date compulsory; Vendor Sheet form has "+ Add New Vendor" (name, GST,
  mobile, terms; category from the invoice) — creates the vendor on save (reuses a same-name vendor).
- Tally connector: `tally-connector/SalonOS-Tally-Connector.ps1` + `.bat` (PowerShell HttpListener on http://localhost:9123,
  forwards Tally XML envelopes to -TallyHost:-TallyPort, default 127.0.0.1:9000; CORS + Private-Network headers only for
  digitalca.co.in / localhost:8765; optional -Token). App side in js/02-shared.js (tallyConnectorCall/tallySend/withTallyCompany/
  parseTallyImportResult, ledger cache `salonos_tally_ledgers_outlet_<id>`, per-browser cfg `sos_tally_connector`) and the Tally
  Export tab (status, company picker, fetch ledgers with parents, "missing in Tally" + create, auto-create on open, pushes with
  Tally's real CREATED/ALTERED/ERRORS). Tested against a fake Tally (scratchpad fake-tally.ps1).

## Recurring expenses, Tally walkthrough, AI key (v2026.09.30.1)
- Recurring Expenses table: TDS Payable and Payable to Payee (Invoice Value − TDS) columns (+ report/export).
- Variable recurring bills (`amountType:'Variable'`, `billFor:'previous'|'current'`), logic in js/04-outlet-staff.js
  (`variableRecurringBills/MonthAmt/SumFor/MissingPeriod`): each actual bill (payee's vendor invoice, "➕ Enter bill" sets
  recurringId + periodFrom/periodTo YYYY-MM) is spread evenly over the months it covers; uncovered months in the item's window use
  the average monthly cost of the last 3 bills (item amount ÷ N before any bill). operatingExpensesFor/annexure add it and pass
  the used bill ids (plus the item's old REC- invoice) to vendorInvoiceCategorySumFor(…, excludeIds) so nothing counts twice.
  Variable items get no standing REC- invoice. Row shows Last bill / "⚠ <period> bill not entered".
- Reusable walkthrough player `GuideModal` (js/10-collections-bank.js) — BankGuideModal and TallyGuideModal (7 scenes: what it
  is, Tally F1 connectivity setup, download, local, server -TallyHost, cloud, daily use) — EN/HI captions + speechSynthesis.
- AI Assistant (Master Settings): edge function `ai-settings` (Verify JWT ON; Super Admin + aal2; actions status/save/test/remove;
  Anthropic TS SDK, default model claude-opus-5-5, test call uses effort low + server-side refusal fallback "default") and
  table `app_secrets` (step11, service role only). The key is never returned to browsers — only keyHint (last 4) and model.
  No AI features use it yet; add a `complete`-style action to ai-settings (or a new function) when one is built.

## Automation roadmap (owner said "do all", 30 Sep 2026) — phases
1 ✅ (v2026.09.30.2) AI bill reading: edge function `ai` (action read_bill; any active SalonOS user; uses app_secrets key/model;
  structured output json_schema; effort low + refusal fallback "default") + `aiReadBill` (js/13-pnl.js) tried first in
  InvoiceIntake (Vendor Sheet "+ Add Invoice"), falls back to the in-browser reader. Also fixed: intake now passes taxable value,
  freight and the real attachment file into the invoice form (before: taxable only in the description, attachment = file name).
2 Next: alerts table + in-app Alerts centre (bell) + Automation settings page; server cron (pg_cron → edge function
  `automation`) for daily data check 21:00 IST, due-date reminders, recurring-bill reminders, month-end checklist, auto month
  lock. Email/WhatsApp delivery only once the owner adds Resend / WhatsApp keys.
3 Auto-match bank payments on import, recurring (Fixed) invoice auto-create on bill day, salary bank bulk file (needs bank
  format), evening Tally sync (connector is local → run from the app when open).
4 AI bank-row tagging, monthly P&L explanation, anomaly alerts, "Ask SalonOS".
5 Approval rules, temporary-user expiry, weekly backup file, login watch.
