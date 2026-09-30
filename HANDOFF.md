# SalonOS — handoff notes (for the next Claude session)

Owner: Dharmender Saini. Live at **https://digitalca.co.in** (GitHub Pages, repo `dhramsaini/SalonOS`, branch `main`).
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
- Both Super Admin accounts have **TOTP two-step login ON** — signing in needs the owner's authenticator code (Claude can't do it).
- Public sign-up is OFF in Supabase Auth; min password length 8. Users are created via the `create-user` edge function (admin API). Permanent delete: `admin_delete_user(uuid)`. A Super Admin sets a new password for another (non-Super-Admin) user via edge function `set-user-password` (source in `supabase/functions/`, Verify JWT ON; checks Super Admin + aal2 itself) — User Management → Edit → New Password (👁 to show while typing). Existing passwords can never be viewed (hashed).
- Salon Manager / ASM get only the Summary Approval screen for Salary / Incentive Working unless given "Edit" on that sheet for the outlet (`summaryApprovalOnly` in js/02-shared.js) — then the real sheet plus a Summary Approval tab.
- Users today: one Salon Manager (outlets 5 & 6 View and Edit), one Reviewer (since step8 no outlets until given some), the two Super Admins. Names/emails: User Management in the app (not kept here — this repo is public).
- Since v2026.09.29.7: everyone except Super Admin (Reviewer included) sees only outlets given in User Management (`userCanSeeOutlet` in js/02-shared.js, same rule as the database); a signed-in user's rights are re-read every 30 s / on focus, so changes apply without logging out.
- Outlets in use: **5** and **6** (company names in Master Sheet).

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
2 ✅ (v2026.09.30.3) Alerts + nightly checks. supabase/step12_alerts_automation.sql: `alerts` table (unique akey; read =
  outlet access via salonos_key_access on the outlet's vendor_invoices key, outlet-less = Super Admin; writes only service role;
  people close via rpc salonos_resolve_alert, needs outlet edit), pg_cron `salonos-automation` 15:30 UTC = 21:00 IST.
  Edge function `automation` (Verify JWT OFF; body {kind:'nightly'} from cron, {kind:'run'} = signed-in Super Admin
  "Run checks now"): pure `computeAlerts(kv,settings,today)` → sales (yesterday + day before, only outlets with sales in
  last 30 days), attendance today (skips weekly off / not joined / left), vendor bills due ≤ N days or overdue (not PI),
  recurring Fixed on due day (auto=false → Mark done), Variable bill missing (same rule as variableRecurringMissingPeriod),
  month-end checklist for last month until the lock day, auto month lock (off by default) written to
  salonos_month_locks_outlet_<id> with an updated_at-conditional update. Re-runs upsert by akey; auto alerts close as
  'fixed'; ones a person marked 'done' never reopen; closed > 90 days deleted. Optional digest to the report recipients.
  Client: AlertsBell (js/14) in the topbar, hides alerts already fixed on this device (alertFixedLocally, js/02);
  AutomationSettingsCard (js/03, kv salonos_secret_automation_settings). tests.html compiles the edge function with
  TypeScript (cdnjs) and runs computeAlerts on sample data (4 tests).
3 ✅ (v2026.09.30.4)
  a) Bank auto-link on every import (file, PDF, watcher, AA): BankStatement `autoLinkAll({onlyIds})` via autoMatchPendingRef
     effect after setRows. Vendor = existing exact-amount rule (autoLinkVendorPayments, now reusable/quiet). Salary =
     global `autoSettleSalaryRows` (js/10): exactly one active employee named (full name, ≥4 chars) or account no. (≥6
     digits) in the narration AND amount = outstanding Salary / Incentive / both for exactly one of txn month, −1, −2
     (unlocked) → settleEmployeePayFor + linkedEmployeePay {auto:true}; 🔗 Unlink reverses. Button renamed "Auto-Link Payments".
  b) Outlet switch `autoRecurringInvoices` (Master Sheet → outlet → Vendor Invoices). `autoCreateRecurringInvoices` (js/04):
     Active + Fixed + MONTHLY only (non-monthly would double count vs the monthly accrual: vendorWinsOverRecurring puts the
     whole bill in one month); this + last month; skips a month with ANY non-PI invoice from that vendor; id = invoiceNo =
     REC-<item>-<YYYY-MM> (deterministic → concurrent creation merges by id); category = recurringVendorCategoryFor(type)
     (NOT the vendor's cat — must land on the right P&L line); taxable with increments, GST scaled, TDS auto payment.
     Run from App (after hydrate, hourly) for outlets the user can edit 'vendors' (userCanEditSheet, js/02).
     Known limit (pre-existing): vendorWinsOverRecurring replaces the WHOLE recurring accrual of a type with that month's
     invoices, so a non-monthly item of the same type as an auto-invoiced monthly one loses its accrual in those months.
     Server `automation`: the fixed "recurring" alert is skipped when REC-<id>-<month> exists (its due alert covers it).
  c) Bank Payment → Bank "Custom layout": BankLayoutEditor (columns/order/headers, separator, N/R/I, csv/txt), kv
     salonos_bank_payment_layout_outlet_<id>; bank choice remembered (salonos_bank_payment_bank_outlet_<id>).
  d) Evening Tally sync: per computer (localStorage sos_tally_connector.autoSync {outletId:{company,from}}, syncTime,
     lastSync). App effect every 5 min after syncTime, once/day/outlet; `runTallyAutoSync` (js/02): only vouchers dated ≥ from,
     not yet sent (kv salonos_tally_pushed_outlet_<id> {inv|bank: id→{at,sig}}); creates missing ledgers; one voucher per
     request; rejects retried next run; edited-after-send items listed, never re-sent. UI: TallyAutoSyncCard (js/09).
  Tests: 40 (recurring invoices 4, salary auto-match 2, Tally sync 3 with a stubbed tallySend).
4 ✅ (v2026.09.30.5) Edge function `ai` gains tag_bank / explain_pnl / ask (shared callClaude: json_schema output,
  effort low|medium, refusal fallback). Client `aiCall(action,payload)` (js/13). Bank Statement "🤖 AI: tag untagged rows"
  (only rows without Nature; high/medium confidence applied, row.aiTagged → 🤖 mark; then autoLinkAll on them).
  P&L tab: AiExplainPnlCard (pnlLinesForAi = plBuild this vs last month). Topbar "💬 Ask" (AskSalonOS, js/14) sends
  askContextFor(user,outlet) (js/13) — a text summary built ONLY from sheets userCanViewSheet allows (tested).
  Anomaly alerts are rules in the `automation` function (no key needed): sales day < 50% of the median of the same
  weekday over 4 weeks; day's expenses > 3× 30-day average and > ₹5,000; duplicate vendor bill (same vendor + same
  invoice no., or same amount within 3 days, last 60 days). Setting anomalyChecks.
5 ✅ (v2026.09.30.5) supabase/step13_access_security.sql:
  • profiles.access_until + salonos_expire_users() (pg_cron 18:35 UTC = 00:05 IST → Inactive + Super Admin alert);
    User Management "Access until" (not for Super Admin); accessEnded() checked at login and in the 30-s access refresh.
  • Login events: this project's auth.audit_log_entries is EMPTY (Supabase keeps auth logs outside the DB), so
    step14_login_events.sql adds public.login_events + rpc salonos_record_login(ua) called after every successful
    sign-in (finishCloudLogin; user = auth.uid(), IP from request.headers x-forwarded-for).
    salonos_login_events(since) (service role only) reads login_events ∪ audit log → loginWatchAlerts (new /16 network
    vs previous 60 days; sign-ins 00:00–06:00 IST), Super Admin-only alerts. Setting loginWatch.
  • Weekly backup file: Cloud Backups "⬇ Download latest as file" / per-row "⬇ File" (downloadCloudBackupFile, records
    salonos_secret_backup_downloaded) and "⬆ Upload backup file" → salonos_import_backup (kind 'uploaded', restorable).
    `automation` raises backup:<Monday> until downloaded this week (bell has a Download button). Setting backupReminder.
  • Approval rule: outlet invoiceApprovalLimit (+ invoiceApprovalFrom, set when first entered). invoiceNeedsApproval
    (js/02; identical copy exported by the automation function, tested for parity). Blocked while pending: Vendor Sheet
    savePay + Pay buttons ("Needs approval" + Super Admin "Approve"), bank auto-link + manual link, Bank Payment vendor
    file, Daily Sales cash auto-payment. Changing an approved bill's amount drops the approval. Alert kind 'approval'.
  Tests: 47.

**Local testing note:** opening index.html on the local preview (localhost:8765) registers the service worker, which then answers every request (even tests.html?x=) with the cached app page. After checking the app locally, unregister it (navigator.serviceWorker.getRegistrations → unregister, clear caches) before running tests.html.

**AI providers (v2026.09.30.7)** — Master Settings → AI Assistant now takes keys for Claude (Anthropic), ChatGPT (OpenAI),
Gemini (Google AI Studio) and Grok (xAI). app_secrets rows anthropic_api_key / openai_api_key / gemini_api_key / xai_api_key
(meta.model, keyHint) + "ai_settings" (meta {primary, fallback}). `ai-settings` actions: status, save {provider,key,model},
test {provider}, remove {provider}, prefs {primary,fallback} (no provider = anthropic, for old app versions). `ai`:
aiConfig() → ordered list (primary first; others if fallback), callAI(cfgs, parts, schema) tries each:
Claude = SDK + output_config json_schema; OpenAI = Responses API (text.format json_schema strict, input_file/input_image data
URLs); Gemini = v1beta generateContent (x-goog-api-key header, inline_data, responseSchema converted by geminiSchema: upper-case
types, no additionalProperties, enums containing "" moved to the description); Grok = api.x.ai chat/completions
(response_format json_schema strict, image_url data URL; JPG/PNG only, no PDF → "unsupported" → next provider, or 415 →
{notConfigured} so the app reads the bill in the browser). Auth/credit/busy/404/5xx/refusal → next provider; cut-off → stop.
Suggested models (typed names also allowed): gpt-6-astra / gpt-6.1-sol / gpt-6-luna, gemini-3.8-flash / gemini-3.1-pro-preview,
grok-4.7 — from each provider's docs on 30 Sep 2026; untested against the real services (no keys here).
Also: Collection Reco's "AI reconciliation" called api.anthropic.com from the browser (never worked on the live site); it is
now an exact calculation in the browser (same table).

**Local testing (any computer):** `tools/serve-local.ps1` (read-only static server, localhost:8765, refuses paths outside
the repo) — also the `salonos-local` preview in `.claude/launch.json`. Then open /tests.html (53 tests on 30 Sep 2026).

**Security review fixes (v2026.09.30.9)** — supabase/step15_cron_secret_ai_limit.sql (run BEFORE deploying the functions):
- `automation` and `salonos-reports` (Verify JWT OFF) used to accept any caller for scheduled runs. Now a scheduled run needs
  header `x-salonos-cron` = app_secrets `cron_secret` (random, made by step15; the three pg_cron jobs are re-created to send
  it). Manual runs / test reports need an active Super Admin at aal2 (when two-step login is on). No secret row → refused.
- `ai`: caller must be at aal2 if two-step login is on; 50 AI requests per person per IST day (AI_DAILY_LIMIT; Super Admins
  unlimited), counted in `ai_usage` via rpc `salonos_ai_bump` (service role only). Over the limit → 429, except read_bill,
  which returns {notConfigured} so the bill is read in the browser instead.
- Login screen: "Exit" (backup download before sign-in) is hidden in cloud mode — it could hand the browser's cached data to
  anyone at a shared computer's login screen. Login card keeps a 16 px margin on phones (it touched the screen edges).
- Personal details (emails, staff names, company names) removed from this file; the repo is public. Git history still has them.
- step15 re-creates only the cron jobs that exist; the report jobs (step4) aren't scheduled on the live project yet — when email
  reports are set up, run step4 and then step15 again.

## Improvement roadmap (owner said "implement all", 30 Sep 2026) — phases
Owner's answers: no POS (bills are manual → SalonOS's own Billing/Client CRM screens become the source), will set up a
WhatsApp Business API number (build now, switches on when Meta keys are added), will set up email (Resend) with guidance.
1 ✅ (v2026.09.30.10) **Owner insights** — `js/13a-insights.js` (loaded before js/14), sidebar 💡 Owner Insights (every role,
  outlets from userCanSeeOutlet, each card only for outlets whose source sheet userCanViewSheet allows):
  Today per outlet (Daily Sales rows 0–4, expenses, attendance marks, MTD vs target / vs same days last month) ·
  Forecast `insForecastMonth` (entered days + same-weekday average of the last 8 weeks, ≥2 entries, else 28-day average;
  past gaps counted 0 and reported) and `insNextMonthEstimate` (last 3 full months ≥15 days entered × last year's seasonal
  factor 0.5–2 when available) · last month's P&L costs vs expected close · monthly sales target kv
  `salonos_sales_target_outlet_<id>` {"YYYY-MM":amt} (edit = userCanEditSheet daily-sales) · bills due ≤7 days / overdue
  `insVendorDues` · staff scorecard `insStaffScores` (incWorkingsFor sales/targets; current month targets & pay pro-rated;
  attendance = worked ÷ present+half+absent; score 50% achievement cap 120%, 30% attendance, 20% sales÷pay cap 4×) ·
  month-end pack PDF `insMonthPackRows` → exportReportPdfBlob. Server: automation `errorWatchAlerts` (kind 'errors',
  Super Admin, client_errors last 24 h, setting errorWatch). Tests: 62.
2 ✅ (v2026.09.30.11) **WhatsApp** — edge function `whatsapp` (Verify JWT OFF; webhook checked with X-Hub-Signature-256 =
  HMAC of the app secret; GET = Meta verify-token check). Credentials: app_secrets row `whatsapp` (value {token, appSecret},
  meta {phoneNumberId, verifyToken, displayPhone, tokenHint, templates{salary,lang}}), saved from Master Settings → 💬 WhatsApp
  (`WhatsAppSettingsCard`, js/13b-whatsapp.js; actions status/save/remove/test, Super Admin + aal2). Allowed senders + switches:
  kv `salonos_secret_whatsapp_settings` {senders:[{phone (91…), name, outletId}], billCapture, todayReplies}.
  Bill photo/PDF from a registered number → storage `outlet_<id>/whatsapp/…` → `ai` read_bill via internal call (anon key +
  header x-salonos-internal = cron_secret; no user limit) → draft in kv `salonos_whatsapp_inbox_outlet_<id>` (id WA-<msg id>,
  status new/used/discarded; max 40 per sender per day; Meta retries deduped) → reply to sender. Vendors → 📥 WhatsApp bills
  (`WhatsAppInbox`) → InvoiceIntake `initial` {ai, attachment} (review step, stored file attached without re-upload;
  `aiBillToIntake` split out of aiReadBill). "today" → today's sales/expenses/attendance reply. Salary Working → 📲 Notify on
  WhatsApp (`notify_salary`, needs write on salonos_salary_working_meta_outlet_<id>; template salonos_salary_paid {{1}} name
  {{2}} month {{3}} net). Reports/automation digest use the saved WhatsApp details when env secrets are absent (Graph v23.0).
  Weekly summary: salonos-reports kind 'weekly' (`buildWeekly`: last Mon–Sun vs week before, attendance, bills due/overdue),
  cron `salonos-report-weekly` Mon 03:30 UTC (step16), setting `weekly` in Automatic reports.
  Owner still has to: create the Meta app + number, paste token/phone ID/app secret, set the webhook, get the two templates
  approved, and list the sender numbers.
  **AI: several keys per provider** (up to 5): rows `<provider>_api_key` (key 1) and `<provider>_api_key_<n>`; `ai` tries every key
  of the primary provider, then others if fallback; a key/credit/network failure stamps meta.failedAt/lastError and that key
  goes last for 30 min (`orderKeys`); success clears it (lastOkAt). ai-settings save/test/remove take `slot`. UI: per-key rows
  with status in `AiProviderRow` / `AiKeyEditor` (js/03). Also: Salary Working year list now runs to next year. Tests: 70.
3 ✅ (v2026.09.30.13) **Email** — edge function `email` (Verify JWT ON): status/save {apiKey, from}/remove/test {to} (Super Admin +
  aal2; save checks the key with GET /domains, "restricted_api_key" = a valid sending-only key) and send_pack {outletId, month,
  fileName, pdf base64, toSelf} (read access to the outlet's daily sales key; recipients = report settings emails + optionally
  the sender — never a typed address). Resend key in app_secrets row `email` (value key; meta {from, keyHint, domains}); env
  RESEND_API_KEY/REPORT_FROM still win if set. salonos-reports `emailCreds()` and automation digest use it. UI: Master Settings →
  📧 Email (`EmailSettingsCard`, js/13c-email.js) and Owner Insights → Month-end pack → 📧 per outlet (`EmailPackButton`).
  step17 schedules the nightly + monthly report jobs (with the cron key). Until digitalca.co.in is verified in Resend, mail only
  reaches the Resend account's own address, from onboarding@resend.dev. Tests: 71.
· (v2026.09.30.14) **🎬 Video guides** — js/13d-guides.js, top of Help & Guide (`StaffGuidesList`): 8 guides (login, daily sales,
  attendance, supplier bill, WhatsApp bills, salary, alerts & Ask, Owner Insights) in EN + HI, played in the Bank/Tally
  `GuideModal` (voice via speechSynthesis); scene pictures = chip rows `mock:[[label, hot]]`. "⬇" records the guide on a 1280×720
  canvas with MediaRecorder (MP4 where supported, else WebM; captions burned in, no voice; real time). Also: every year picker
  uses `appYears()` (2023…next year; 15 lists stopped at 2026) and the FY list grows with the current FY.
  (v2026.09.30.15) Videos are published with the site: `guides/<id>_<hi|en>.mp4` (1280×720 H.264, made by `encodeGuideMp4` —
  WebCodecs VideoEncoder + mp4-muxer 5.2.2 from jsDelivr, frame by frame, exact length; the MediaRecorder path is only a fallback
  because background tabs pause canvas recording). `GuideVideoModal` plays them (EN/HI switch, ▶ animated-with-voice, ⬇ download);
  `GuideVideoButton {id}` "🎬 How-to" sits on Daily Sales, Attendance, Salary Working, Vendors, Owner Insights and the login card.
  service-worker.js never caches .mp4/.webm. To re-make videos after changing a guide: open the app locally, run
  `recordGuideVideo(STAFF_GUIDES[i], 'hi'|'en')` for each, save as guides/<id>_<lang>.mp4, and bump GUIDE_VIDEO_REV.
· (v2026.09.30.17) **Bank statement import fix** (js/10 BankStatement): `findHeaderRowIndex` scans 80 rows (HDFC .xls has
  20 lines of account details — the header is row 21, past the old 20-row limit, so the file was misread: address/footer lines
  and date-only rows were saved and later imports matched them as "duplicates"); a header wins only with short keyword cells,
  bonus when dates follow. Every import keeps only `isTxnRow` rows (date dd/mm/yyyy, year 2000–2099 — the statement-summary
  balance read as year 3597 — and money in or out) and reports how many other lines were ignored. On opening Bank Statement,
  saved rows failing `isTxnRow` are removed once with a message. Tested on three real HDFC exports (889 / 683 rows, 0 junk).
  Live outlet 5 had 128 junk + 100 date-only Sep rows; Sep transactions need re-importing once this version is open.
  **Recurring split for Fixed non-monthly items**: `isSpreadRecurring` = Variable OR frequency > Monthly. Those go through
  the bill-spread path (`variableRecurringSumFor` / `variableRecurringMonthAmt`): each payee bill (not REC-) covers its own
  periodFrom/To, else the N months ending in the bill's month (Fixed) — Variable keeps billFor; months without a bill carry
  `recurringExpenseMonthlyAmt` (amount ÷ N). `recurringExpenseMonthlySumFor` and the annexure raw total skip them, and their
  bills are in `used`, so a bill is never counted whole in one month on top of the estimate. "➕ Enter bill" and the P&L
  annexure detail cover them too. Tests: 74.
· (v2026.09.30.18) Chrome/Edge never let a site open the whole Downloads folder ("contains system files"): the folder
  auto-import (Bank Statement, Collection Reco) now asks for a folder INSIDE Downloads (Bank Statements / Cradlee Exports)
  with steps on the card; Bank Statement "📄 Choose file" uses showOpenFilePicker({startIn:'downloads'}).
· (v2026.09.30.19) 9th video guide `bank-statement` (add account → period → open bank site → download → Choose file →
  result → tags/Auto-Link → optional folder), guides/bank-statement_en|hi.mp4; "🎬 Video: import from start" button in the
  Bank Statement cards' guide buttons.
· (v2026.09.30.20) **Cradlee import like the bank's** (CollectionReco, js/10): card "Get the Collection Report from Cradlee" —
  period (quick picks / From-To), "🔗 Open Cradlee" (opens app.cradleesoft.com login, then watches the connected folder every 3 s
  for 20 min for a new .xlsx/.xls/.csv and imports it), "📄 Choose file" (showOpenFilePicker startIn downloads). loadWorkbook(file,
  {from,to,append}) keeps only that period, always appends with the existing duplicate check; heading row found by
  `findCradleeHeaderRow` (Center Name + InvoiceDate in the first 30 rows, any sheet); only dated rows (2000–2099) kept.
  Tested on two real Cradlee exports. 10th video guide `cradlee` (guides/cradlee_en|hi.mp4), button on the card.
· (v2026.09.30.21) **Staff Work Report the same way** (StaffReportSheet, js/11): card "Get the Staff Work Report from Cradlee"
  — month, "🔗 Open Cradlee" (watch the connected folder 20 min), "📄 Choose file" (opens in Downloads). One report per month:
  a new export replaces that month's rows (latest wins). parseCSVText now uses parseCSVToRows (quoted commas) and finds the
  EmpId/Emp_Name heading in the first 30 rows; Total lines dropped. Folder card fixed to "a folder inside Downloads".
  Tested on two real exports (17 then 14 rows, replaced). 11th video guide `staff-report`.
· (v2026.09.30.22) **Tally Integration redesign** (TallyExportSheet, js/09): status bar (connector/company/bank ledger/last
  sync), one period bar, tabs Overview (KPI per voucher type, readiness checklist with fix buttons, one "Sync N new vouchers"
  via `tallySyncVouchers` with progress, manual-import files), Vouchers (all Purchase/Payment/Receipt/Contra with ledgers +
  New/Sent/Changed/Suspense; send selected via `only`, mark as already in Tally / not sent), Ledgers (bank ledger + one mapping
  table for suppliers, categories, bank types `map.natures`, system ledgers; In-Tally status, ✨ auto-match, create missing),
  History (kv `salonos_tally_log_outlet_<id>`, addTallyLog/loadTallyLog; evening auto-sync logs too), Settings (connector,
  company, auto-create, guides, TallyAutoSyncCard). Accounting fixes in js/02: Round Off ledger now created; bank vouchers use
  mapped supplier names; `tallyBankCounterparty` (linked bill → Nature → name match → Suspense) + TALLY_NATURE_LEDGERS
  (Cash Deposit = Contra); `tallyExtraLedgers` feeds Masters XML/sync (Round Off, bank-type ledgers, Suspense).
  Tests 80. Local visual check: local-test/tally-preview.html (sample data + pretend Tally, git-excluded).
· (v2026.09.30.23) **Tally connector installs once and starts with Windows, on any computer**: tally-connector/
  Install-SalonOS-Tally-Connector.bat (per user, no admin; asks for the Tally PC's IP or Enter = this PC; downloads the latest
  connector from digitalca.co.in — falls back to the copy beside it — into %LOCALAPPDATA%\SalonOS\TallyConnector, stops any
  running copy, adds a Startup-folder shortcut running it hidden with -Background, starts it and checks /status) and
  Uninstall-SalonOS-Tally-Connector.bat. Connector 1.1: `-Background` switch (quiet exit if the port is taken), /status
  reports `background`. Settings tab: "Install connector" primary button, installed state shown; old .bat under "Run without
  installing". Tested on this PC: install, simulated start-up via the shortcut, uninstall, reinstall. (preview: ?real=1)
· (v2026.09.30.24) **Automation / code review fixes**:
  - SECURITY: in-browser auto-backup snapshot (all data the login sees, incl. salonos_secret_*) was pushed to kv_store as a
    global key — readable by every signed-in user. DEVICE_ONLY_KEYS (js/01: salonos_autobackup_snapshot, _enabled, theme)
    are never pushed/pulled. supabase/step18_device_only_keys.sql deletes existing rows + restrictive policy (RUN IT).
  - kv_store reads capped at 1000 rows by the API: kvSelectAll (js/01) pages the initial pull, update check and
    cleanupUnusedFiles (a truncated list there would delete files still in use); automation + salonos-reports loadKv page
    too (REDEPLOY both functions).
  - automation month-end checklist read bank rows' `date` (field is transactionDate) → always said "bank statement not
    imported". Fixed + test.
  - tallySyncVouchers: records each accepted voucher immediately (a stop half-way re-sent them → duplicates in Tally); an
    empty ledger list (no company open) now stops with a clear error, so the evening sync retries instead of failing all.
  Tests 83. Scanner for undefined function calls: scratchpad undef_scan.py (no real hits).
4 ☐ Billing/CRM as the sales source (Billing → Daily Sales), memberships/packages, win-back list, online booking page.
5 ☐ Compliance: GSTR-2B reconciliation, TDS working/challan, Tally two-way check, audit-trail report.
6 ☐ Foundation: Daily Sales → proper table (dual-write + parity), staging copy, backup file to Google Drive.
