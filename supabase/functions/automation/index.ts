// SalonOS — nightly automation (Supabase Edge Function "automation"), run by pg_cron every day at
// 21:00 IST (supabase/step12_alerts_automation.sql). It looks through every active outlet's data and
// keeps public.alerts up to date — the list behind the 🔔 bell in the app:
//
//   sales           today's (or the last 3 days') sales not entered
//   attendance      today's attendance not marked for some staff
//   due             vendor bills due within N days, or overdue (closes itself once paid)
//   recurring       a fixed recurring payment (rent, maintenance, ...) falls due this month
//   recurring_bill  a variable bill (electricity, water, ...) whose period is over but no bill entered
//   month_end       last month's checklist — days without sales, unmarked attendance, salary not
//                   approved, bank statement not imported (closes itself when everything is done)
//   month_lock      last month was locked automatically (only if the Super Admin turned that on)
//   approval        vendor bills above the outlet's approval limit waiting for a Super Admin
//   backup          weekly backup file not downloaded yet this week (Super Admin)
//   login           new sign-in network, late-night sign-in (Super Admin); temporary access ended
//   anomaly         unusual activity: a sales day far below that weekday's usual, a day's expenses 3x the
//                   30-day average, a vendor bill that looks entered twice
//   errors          app errors users hit in the last 24 hours, most frequent first (Super Admin)
//
// Settings: Master Settings → Automation (kv salonos_secret_automation_settings, Super Admin only).
// Optional digest of new alerts by email / WhatsApp to the "Automatic reports" recipients, using the
// same secrets as salonos-reports (RESEND_API_KEY, REPORT_FROM, WHATSAPP_*).
//
// Who can trigger it: the scheduled job (no login — it proves itself with the x-salonos-cron header,
// a random value kept in app_secrets 'cron_secret', step15; it only rewrites alerts and returns
// counts), or a signed-in active Super Admin ("Run checks now", at aal2 if two-step login is on),
// who also gets the list back. Any other call is refused.
// Deploy with "Verify JWT" OFF (the scheduled call has no user token).
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REPORT_FROM = Deno.env.get("REPORT_FROM") ?? "SalonOS Reports <onboarding@resend.dev>";
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") ?? "salonos_daily_summary";
const WA_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export const DEFAULTS = {
  enabled: true, salesCheck: true, attendanceCheck: true, dueReminders: true, dueDaysAhead: 3,
  recurringReminders: true, monthEndChecklist: true, autoLock: false, autoLockDay: 10, digest: false, anomalyChecks: true,
  loginWatch: true, backupReminder: true, errorWatch: true,
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIOD_MONTHS: Record<string, number> = { Monthly: 1, "Bi-Monthly": 2, Quarterly: 3, "Half-Yearly": 6, Yearly: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const num = (v: unknown) => Number(v) || 0;
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
// Month index = year*12 + month(0-11); day number = days since epoch (UTC), both for IST calendar dates.
const mIdx = (y: number, m: number) => y * 12 + m;
const mLabel = (i: number) => `${MONTHS[((i % 12) + 12) % 12]} ${Math.floor(i / 12)}`;
const mCode = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
const isoOfDay = (dn: number) => { const d = new Date(dn * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const dayOf = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m, d) / 864e5);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const nice = (dn: number) => { const d = new Date(dn * 864e5); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

// Any date the app stores — "dd/mm/yyyy", "yyyy-mm-dd", "dd-mm-yyyy", "dd Mon yyyy" — to a day number.
const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function parseDay(s: unknown): number | null {
  const t = String(s ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return dayOf(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return dayOf(+m[3], +m[2] - 1, +m[1]);
  m = t.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{4})$/);
  if (m && MON[m[2].toLowerCase()] != null) return dayOf(+m[3], MON[m[2].toLowerCase()], +m[1]);
  return null;
}
const monthOfIso = (s: unknown) => { const m = /^(\d{4})-(\d{2})/.exec(String(s ?? "")); return m ? mIdx(+m[1], +m[2] - 1) : null; };

type KV = Map<string, any>;
type Alert = { akey: string; outlet_id: number | null; kind: string; severity: string; title: string; body: string; tab: string | null; due_date: string | null; auto: boolean };

// ── The checks. Pure: kv + settings + "today" in, the list of alerts that should be open out. ──
export function computeAlerts(kv: KV, settings: typeof DEFAULTS, today: number) {
  const out: Alert[] = [];
  const locks: { sid: number; month: number }[] = [];
  const t = new Date(today * 864e5), Y = t.getUTCFullYear(), M = t.getUTCMonth(), D = t.getUTCDate();
  const thisMonth = mIdx(Y, M), prevMonth = thisMonth - 1;
  const outlets = (kv.get("salonos_salons") ?? []).filter((s: any) => s && s.status === "Active");
  for (const o of outlets) {
    const sid = Number(o.id), name = String(o.name || "Outlet " + sid).split("—")[0].trim();
    const get = (base: string, dflt: any) => kv.get(`${base}_outlet_${sid}`) ?? dflt;
    const sales = get("salonos_daily_sales_collection_data", {});
    const hasSales = (dn: number) => { const r = sales[isoOfDay(dn)]; return !!r && Object.values(r).some((v) => String(v ?? "") !== ""); };
    const emps = (get("salonos_master_employees", []) as any[]).filter((e) => e && e.status === "Active");
    const att = get("salonos_attendance", {});
    // Staff who should have a mark that day: joined by then, not left, not their weekly off.
    const unmarkedOn = (dn: number) => {
      const d = new Date(dn * 864e5);
      return emps.filter((e) => {
        const doj = parseDay(e.doj), dol = parseDay(e.dol);
        if ((doj != null && doj > dn) || (dol != null && dol < dn)) return false;
        if (e.weeklyOff && DOW[d.getUTCDay()] === e.weeklyOff) return false;
        const v = att[`${e.id}_${d.getUTCFullYear()}_${d.getUTCMonth()}`]?.days?.[d.getUTCDate() - 1];
        return !v;
      });
    };
    const inUse = [...Array(30).keys()].some((i) => hasSales(today - i)); // outlet actually entering data

    // 1 · Sales not entered — yesterday and the day before (today's are usually entered at closing,
    // after this 9 PM run). Skipped for outlets not entering data at all.
    if (settings.salesCheck && inUse) {
      for (let i = 1; i <= 2; i++) {
        const dn = today - i;
        if (!hasSales(dn)) out.push({ akey: `sales:${sid}:${isoOfDay(dn)}`, outlet_id: sid, kind: "sales", severity: i > 1 ? "urgent" : "warn",
          title: `${name}: sales for ${nice(dn)} not entered`, body: "Daily Sales & Exp. has no entry for this day.", tab: "daily-sales", due_date: isoOfDay(dn), auto: true });
      }
    }
    // 2 · Attendance not marked today.
    if (settings.attendanceCheck && emps.length) {
      const miss = unmarkedOn(today);
      if (miss.length) out.push({ akey: `attendance:${sid}:${isoOfDay(today)}`, outlet_id: sid, kind: "attendance", severity: "warn",
        title: `${name}: attendance not marked for ${miss.length} staff today`,
        body: miss.slice(0, 8).map((e) => e.name).join(", ") + (miss.length > 8 ? ` and ${miss.length - 8} more` : ""), tab: "attendance", due_date: isoOfDay(today), auto: true });
    }
    // 3 · Vendor bills due soon / overdue.
    const vendors = get("salonos_vendors", []) as any[];
    const vName = (id: string) => (vendors.find((v) => v.id === id) || {}).name || id;
    const invoices = get("salonos_vendor_invoices", []) as any[];
    if (settings.dueReminders) {
      for (const inv of invoices) {
        if (!inv || inv.docNature === "Performa Invoice") continue;
        const due = parseDay(inv.dueDate);
        if (due == null) continue;
        const bal = num(inv.amount) - (inv.payments || []).reduce((s: number, p: any) => s + num(p.paidAmount), 0);
        if (bal <= 0.5 || due - today > settings.dueDaysAhead) continue;
        const late = today - due;
        out.push({ akey: `due:${sid}:${inv.id || inv.vendorId + "|" + inv.invoiceNo}`, outlet_id: sid, kind: "due", severity: late > 0 ? "urgent" : "warn",
          title: `${name}: ${vName(inv.vendorId)} bill ${inv.invoiceNo || ""} ${late > 0 ? `overdue by ${late} day${late === 1 ? "" : "s"}` : late === 0 ? "due today" : `due on ${nice(due)}`}`,
          body: `${inr(bal)} outstanding.`, tab: "vendors", due_date: isoOfDay(due), auto: true });
      }
    }
    // 4 · Recurring payments: fixed ones falling due this month, variable ones whose bill is missing.
    if (settings.recurringReminders) {
      for (const it of get("salonos_recurring_expenses", []) as any[]) {
        if (!it || it.status !== "Active") continue;
        const label = it.expenseName === "Other" && it.customName ? it.customName : it.expenseName;
        const N = PERIOD_MONTHS[it.frequency] || 1;
        const start = monthOfIso(it.startDate), end = monthOfIso(it.endDate);
        if ((start != null && thisMonth < start) || (end != null && thisMonth > end)) continue;
        if (it.amountType === "Variable") {
          const vendor = vendors.find((v) => String(v.name || "").trim().toLowerCase() === String(it.payee || "").trim().toLowerCase());
          const bills = !vendor ? [] : invoices
            .filter((inv) => inv && inv.vendorId === vendor.id && inv.docNature !== "Performa Invoice" && !String(inv.invoiceNo || "").startsWith("REC-") && (!inv.recurringId || inv.recurringId === it.id))
            .map((inv) => {
              let last = monthOfIso(inv.periodTo);
              if (last == null || monthOfIso(inv.periodFrom) == null) {
                const bd = parseDay(inv.invoiceDate); if (bd == null) return null;
                const d = new Date(bd * 864e5); const bm = mIdx(d.getUTCFullYear(), d.getUTCMonth());
                last = it.billFor === "current" ? bm : bm - 1;
              }
              return last;
            }).filter((x): x is number => x != null).sort((a, b) => a - b);
          const lastCovered = bills.length ? bills[bills.length - 1] : (start != null ? start - 1 : thisMonth - N - 1);
          const first = lastCovered + 1, last = first + N - 1;
          if (last < thisMonth) out.push({ akey: `recurring_bill:${sid}:${it.id}:${mCode(first)}`, outlet_id: sid, kind: "recurring_bill", severity: last < thisMonth - 1 ? "urgent" : "warn",
            title: `${name}: ${label} bill for ${first === last ? mLabel(first) : mLabel(first) + " – " + mLabel(last)} not entered`,
            body: `${it.payee || ""} · ${it.frequency}. Use "➕ Enter bill" in Recurring Expenses (the P&L uses an estimate until then).`, tab: "recurring-expenses", due_date: null, auto: true });
        } else {
          const dueDay = Math.min(Math.max(1, num(it.dueDay) || 1), daysIn(Y, M));
          if (start != null && ((thisMonth - start) % N + N) % N !== 0) continue; // not a due month
          // The outlet's automatic monthly invoice exists → its own "due" alert covers this payment.
          if (invoices.some((inv) => inv && inv.id === `REC-${it.id}-${mCode(thisMonth)}`)) continue;
          const due = dayOf(Y, M, dueDay);
          if (due - today > settings.dueDaysAhead) continue;
          const amt = it.gstApplicable ? num(it.amount) + num(it.gstAmount) : num(it.amount);
          out.push({ akey: `recurring:${sid}:${it.id}:${mCode(thisMonth)}`, outlet_id: sid, kind: "recurring", severity: due < today ? "urgent" : "warn",
            title: `${name}: ${label} ${due < today ? "was due" : due === today ? "is due today" : "is due"} on ${nice(due)}`,
            body: `${it.payee || ""} · about ${inr(amt)} (${it.paymentMode || "payment"}). Mark done once paid.`, tab: "recurring-expenses", due_date: isoOfDay(due), auto: false });
        }
      }
    }
    // 4b · Unusual activity (rules, no AI needed).
    if (settings.anomalyChecks && inUse) {
      const dayTotal = (dn: number) => { const r = sales[isoOfDay(dn)] || {}; return [0, 1, 2, 3, 4].reduce((t, i) => t + num(r[i]), 0); };
      const y = today - 1;
      // Sales far below the usual for that weekday (median of the same weekday over the 4 weeks before).
      if (hasSales(y)) {
        const same = [7, 14, 21, 28].map((k) => y - k).filter(hasSales).map(dayTotal).sort((a, b) => a - b);
        const med = same.length >= 3 ? same[Math.floor(same.length / 2)] : 0;
        if (med > 0 && dayTotal(y) < med * 0.5) out.push({ akey: `anomaly:${sid}:sales:${isoOfDay(y)}`, outlet_id: sid, kind: "anomaly", severity: "warn",
          title: `${name}: sales on ${nice(y)} were unusually low`, body: `${inr(dayTotal(y))} against a usual ${inr(med)} for that weekday — check the entry is complete.`, tab: "daily-sales", due_date: isoOfDay(y), auto: false });
      }
      // A day's expenses far above normal.
      const exps = get("salonos_daily_sales_data", {});
      const expOn = (dn: number) => Object.values(exps[isoOfDay(dn)] || {}).reduce((t: number, v) => t + num(v), 0);
      const past = [...Array(30).keys()].map((k) => expOn(y - 1 - k));
      const avg = past.reduce((t, v) => t + v, 0) / 30;
      if (expOn(y) > 5000 && avg > 0 && expOn(y) > avg * 3) out.push({ akey: `anomaly:${sid}:expense:${isoOfDay(y)}`, outlet_id: sid, kind: "anomaly", severity: "warn",
        title: `${name}: expenses on ${nice(y)} were unusually high`, body: `${inr(expOn(y))} against a daily average of ${inr(avg)} over the last 30 days.`, tab: "daily-sales", due_date: isoOfDay(y), auto: false });
      // A vendor bill that looks entered twice: same vendor + same invoice no., or same vendor + same amount within 3 days.
      const recentBills = invoices.filter((i) => i && i.docNature !== "Performa Invoice" && !String(i.invoiceNo || "").startsWith("REC-"))
        .map((i) => ({ i, d: parseDay(i.invoiceDate) })).filter((x) => x.d != null && today - (x.d as number) <= 60);
      const seen = new Set<string>();
      for (let a = 0; a < recentBills.length; a++) for (let b = a + 1; b < recentBills.length; b++) {
        const A = recentBills[a], B = recentBills[b];
        if (A.i.vendorId !== B.i.vendorId) continue;
        const sameNo = String(A.i.invoiceNo || "").trim() && String(A.i.invoiceNo).trim().toLowerCase() === String(B.i.invoiceNo || "").trim().toLowerCase();
        const sameAmt = num(A.i.amount) > 0 && Math.abs(num(A.i.amount) - num(B.i.amount)) < 1 && Math.abs((A.d as number) - (B.d as number)) <= 3;
        if (!sameNo && !sameAmt) continue;
        const k = [A.i.id, B.i.id].sort().join("+");
        if (seen.has(k)) continue; seen.add(k);
        out.push({ akey: `anomaly:${sid}:dup:${k}`, outlet_id: sid, kind: "anomaly", severity: "warn",
          title: `${name}: possible duplicate bill from ${vName(A.i.vendorId)}`,
          body: `${A.i.invoiceNo || "(no number)"} dated ${A.i.invoiceDate} (${inr(num(A.i.amount))}) and ${B.i.invoiceNo || "(no number)"} dated ${B.i.invoiceDate} (${inr(num(B.i.amount))}) — ${sameNo ? "same invoice number" : "same amount within 3 days"}. Mark done if both are genuine.`,
          tab: "vendors", due_date: null, auto: true });
      }
    }
    // 5 · Last month's checklist (first days of the month, until the lock day).
    const lockDay = Math.min(28, Math.max(2, num(settings.autoLockDay) || 10));
    const lockMap = get("salonos_month_locks", {});
    const prevLocked = !!lockMap[mCode(prevMonth)]?.locked;
    if (settings.monthEndChecklist && inUse && D < lockDay && !prevLocked) {
      const py = Math.floor(prevMonth / 12), pm = prevMonth % 12, pdays = daysIn(py, pm);
      const items: string[] = [];
      const noSales = [...Array(pdays).keys()].map((i) => dayOf(py, pm, i + 1)).filter((dn) => !hasSales(dn));
      if (noSales.length) items.push(`${noSales.length} day${noSales.length === 1 ? "" : "s"} without sales (${noSales.slice(0, 6).map(nice).join(", ")}${noSales.length > 6 ? ", …" : ""})`);
      const unmarkedStaff = new Set<string>();
      for (let d = 1; d <= pdays; d++) unmarkedOn(dayOf(py, pm, d)).forEach((e) => unmarkedStaff.add(e.name));
      if (unmarkedStaff.size) items.push(`attendance incomplete for ${unmarkedStaff.size} staff`);
      const sw = get("salonos_salary_working_meta", {});
      const notApproved = emps.filter((e) => (sw[`${e.id}_${py}_${pm}`] || {}).status !== "Approved");
      if (emps.length && notApproved.length) items.push(`salary not approved for ${notApproved.length} of ${emps.length} staff`);
      const bank = get("salonos_bank_statement_rows", []) as any[];
      const bankIn = bank.some((r) => { const dn = parseDay(r && r.date); return dn != null && dn >= dayOf(py, pm, 1) && dn <= dayOf(py, pm, pdays); });
      if (!bankIn) items.push("bank statement not imported");
      if (items.length) out.push({ akey: `month_end:${sid}:${mCode(prevMonth)}`, outlet_id: sid, kind: "month_end", severity: D >= lockDay - 3 ? "urgent" : "warn",
        title: `${name}: ${mLabel(prevMonth)} month-end checklist — ${items.length} pending`,
        body: items.map((s) => "• " + s).join("\n") + (settings.autoLock ? `\nThe month locks automatically on the ${lockDay}th.` : ""), tab: "outlet-dashboard", due_date: isoOfDay(dayOf(Y, M, lockDay)), auto: true });
    }
    // 6 · Auto month lock.
    if (settings.autoLock && D >= lockDay && !prevLocked && inUse) locks.push({ sid, month: prevMonth });
    // 7 · Vendor bills above the outlet's approval limit, not approved yet (same rule as
    // invoiceNeedsApproval in the app).
    const pending = invoices.filter((i) => invoiceNeedsApproval(i, o));
    if (pending.length) out.push({ akey: `approval:${sid}:${pending.map((i) => i.id).sort().join(",").slice(0, 150)}`, outlet_id: sid, kind: "approval", severity: "warn",
      title: `${name}: ${pending.length} vendor bill${pending.length === 1 ? "" : "s"} waiting for approval`,
      body: pending.slice(0, 6).map((i) => `• ${vName(i.vendorId)} ${i.invoiceNo || ""} — ${inr(num(i.amount))}`).join("\n") + (pending.length > 6 ? `\n… and ${pending.length - 6} more` : "") +
        "\nA Super Admin approves them in Vendors; they can't be paid until then.", tab: "vendors", due_date: null, auto: true });
  }
  // 8 · Weekly backup file: remind the Super Admins until this week's copy is downloaded.
  if (settings.backupReminder) {
    const dl = kv.get("salonos_secret_backup_downloaded");
    const last = dl && dl.at ? Math.floor((Date.parse(dl.at) + 5.5 * 3600e3) / 864e5) : null;
    const monday = today - (((today + 4) % 7) + 6) % 7;
    if (last == null || last < monday) out.push({ akey: `backup:${isoOfDay(monday)}`, outlet_id: null, kind: "backup", severity: last == null || today - last > 13 ? "urgent" : "info",
      title: "Weekly backup file: download this week’s copy",
      body: (last == null ? "No backup file has been downloaded yet." : `Last downloaded ${nice(last)}.`) +
        " Keep it on your computer or Google Drive — a copy outside SalonOS, in case the cloud account itself is ever lost.", tab: null, due_date: null, auto: true });
  }
  return { alerts: out, locks };
}
// A vendor bill needs approval when the outlet has an approval limit, the bill is above it, it's
// dated on/after the day the limit was set, isn't approved yet, and isn't a PI or an automatic
// recurring invoice (those were already approved as recurring expenses).
// deno-lint-ignore no-explicit-any
export function invoiceNeedsApproval(inv: any, outlet: any) {
  const lim = num(outlet && outlet.invoiceApprovalLimit);
  if (!inv || lim <= 0 || inv.docNature === "Performa Invoice" || inv.autoCreated) return false;
  if (num(inv.amount) <= lim || (inv.approval && inv.approval.status === "Approved")) return false;
  const from = parseDay(outlet.invoiceApprovalFrom), d = parseDay(inv.bookingDate || inv.invoiceDate);
  return from == null || d == null || d >= from;
}
// ── App errors in the last 24 h (public.client_errors) — one Super Admin alert per IST day, listing the
// most frequent messages, so problems are seen the same day instead of when someone opens App errors.
// Pure; rows from client_errors.
export function errorWatchAlerts(rows: { at: string; email: string | null; message: string | null }[], nowMs: number) {
  const cut = nowMs - 24 * 3600e3;
  const recent = rows.filter((r) => Date.parse(r.at) >= cut);
  if (!recent.length) return [] as Alert[];
  const byMsg = new Map<string, { n: number; people: Set<string> }>();
  for (const r of recent) {
    const m = String(r.message || "(no message)").split("\n")[0].slice(0, 120);
    const g = byMsg.get(m) ?? { n: 0, people: new Set<string>() };
    g.n++; if (r.email) g.people.add(r.email);
    byMsg.set(m, g);
  }
  const top = [...byMsg.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  const people = new Set(recent.map((r) => r.email).filter(Boolean));
  const day = Math.floor((nowMs + 5.5 * 3600e3) / 864e5);
  return [{ akey: `errors:${isoOfDay(day)}`, outlet_id: null, kind: "errors", severity: recent.length >= 10 ? "urgent" : "info",
    title: `${recent.length} app error${recent.length === 1 ? "" : "s"} in the last 24 hours`,
    body: top.map(([m, g]) => `• ${m} (${g.n}×${g.people.size ? ", " + g.people.size + " user" + (g.people.size === 1 ? "" : "s") : ""})`).join("\n") +
      `\n${people.size} user${people.size === 1 ? "" : "s"} affected. Details: Master Settings → App errors.`,
    tab: null, due_date: null, auto: false }] as Alert[];
}

// ── Login watch: sign-ins from a network (first two parts of the IP) the person hasn't used in the
// previous 60 days, and sign-ins between midnight and 6 AM IST. Pure; events from salonos_login_events.
export function loginWatchAlerts(events: { user_id: string; email: string; at: string; ip: string | null }[], nowMs: number) {
  const out: Alert[] = [];
  const net = (ip: string | null) => !ip ? "" : ip.includes(":") ? ip.split(":").slice(0, 3).join(":") : ip.split(".").slice(0, 2).join(".");
  const cut = nowMs - 25 * 3600e3;
  const users = new Map<string, { older: Set<string>; recent: typeof events }>();
  for (const e of events) {
    const u = users.get(e.user_id) ?? { older: new Set<string>(), recent: [] as typeof events };
    if (Date.parse(e.at) < cut) { if (net(e.ip)) u.older.add(net(e.ip)); } else u.recent.push(e);
    users.set(e.user_id, u);
  }
  const ist = (t: string) => new Date(Date.parse(t) + 5.5 * 3600e3);
  const when = (t: string) => { const d = ist(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  for (const [uid, u] of users) {
    const flagged = new Set<string>();
    for (const e of u.recent) {
      const n = net(e.ip);
      if (n && u.older.size && !u.older.has(n) && !flagged.has(n)) {
        flagged.add(n);
        out.push({ akey: `login:new:${uid}:${n}`, outlet_id: null, kind: "login", severity: "info", title: `New sign-in network for ${e.email || "a user"}`,
          body: `Signed in ${when(e.at)} from ${e.ip} — not used in the last 60 days. If this wasn't them, set a new password for them in User Management.`, tab: null, due_date: null, auto: false });
      }
      const h = ist(e.at).getUTCHours();
      if (h < 6) out.push({ akey: `login:night:${uid}:${isoOfDay(Math.floor(Date.parse(e.at) / 864e5 + 5.5 / 24))}`, outlet_id: null, kind: "login", severity: "info",
        title: `Late-night sign-in: ${e.email || "a user"}`, body: `Signed in ${when(e.at)} IST${e.ip ? " from " + e.ip : ""}.`, tab: null, due_date: null, auto: false });
    }
  }
  return out;
}

async function loadKv(): Promise<KV> {
  const { data, error } = await admin.from("kv_store").select("key,value").not("value", "is", null);
  if (error) throw error;
  const m: KV = new Map();
  for (const r of data ?? []) { try { m.set(r.key, JSON.parse(r.value)); } catch { /* not JSON */ } }
  return m;
}

// Lock a month the same way the app does (salonos_month_locks_outlet_<id>), without overwriting a
// change someone saves at the same moment: update only if the row hasn't changed since we read it.
async function lockMonth(sid: number, month: number) {
  const key = `salonos_month_locks_outlet_${sid}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row } = await admin.from("kv_store").select("value,updated_at").eq("key", key).maybeSingle();
    let map: Record<string, unknown> = {};
    try { map = row?.value ? JSON.parse(row.value) : {}; } catch { map = {}; }
    if ((map[mCode(month)] as any)?.locked) return false;
    map[mCode(month)] = { locked: true, source: "auto", by: "SalonOS (scheduled)", at: new Date().toISOString() };
    const now = new Date().toISOString();
    const res = row
      ? await admin.from("kv_store").update({ value: JSON.stringify(map), updated_at: now }).eq("key", key).eq("updated_at", row.updated_at).select("key")
      : await admin.from("kv_store").insert({ key, value: JSON.stringify(map), updated_at: now }).select("key");
    if (!res.error && res.data?.length) return true;
  }
  throw new Error("Could not lock " + mLabel(month) + " for outlet " + sid);
}

async function sendDigest(kv: KV, fresh: Alert[]) {
  const rs = kv.get("salonos_secret_report_settings") ?? {};
  const emails: string[] = (rs.emails ?? []).filter((e: string) => /@/.test(e));
  const phones: string[] = (rs.whatsapp ?? []).filter((p: string) => /\d{8,}/.test(String(p).replace(/[^\d]/g, "")));
  const title = `${fresh.length} new alert${fresh.length === 1 ? "" : "s"}`;
  const res: Record<string, unknown> = {};
  if (emails.length && RESEND_API_KEY) {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const html = `<div style="font-family:Arial,sans-serif"><h2 style="color:#14335e;margin:0 0 10px">${esc(title)}</h2><ul>${fresh.map((a) =>
      `<li style="margin-bottom:6px"><b>${esc(a.title)}</b><br><span style="color:#5e6a82">${esc(a.body).replace(/\n/g, "<br>")}</span></li>`).join("")}</ul>
      <p style="color:#5e6a82">Open SalonOS → 🔔 to see and close them.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REPORT_FROM, to: emails, subject: `SalonOS · ${title}`, html }),
    });
    res.email = r.ok ? "sent" : `failed (${r.status})`;
  }
  // WhatsApp details: Edge Function secrets if set, else the ones saved in Master Settings → WhatsApp.
  let wa = WA_TOKEN && WA_PHONE_ID ? { token: WA_TOKEN, phoneId: WA_PHONE_ID } : null;
  if (!wa && phones.length) {
    const { data } = await admin.from("app_secrets").select("value,meta").eq("name", "whatsapp").maybeSingle();
    let v: { token?: string } = {};
    try { v = JSON.parse(data?.value ?? "{}"); } catch { /* none */ }
    if (v.token && data?.meta?.phoneNumberId) wa = { token: v.token, phoneId: String(data.meta.phoneNumberId) };
  }
  if (phones.length && wa) {
    const line = fresh.map((a) => a.title).join(" | ").slice(0, 1000);
    let ok = 0;
    for (const p of phones) {
      const r = await fetch(`https://graph.facebook.com/v23.0/${wa.phoneId}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${wa.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: p.replace(/[^\d]/g, ""), type: "template",
          template: { name: WA_TEMPLATE, language: { code: WA_LANG }, components: [{ type: "body", parameters: [{ type: "text", text: "SalonOS · " + title }, { type: "text", text: line }] }] } }),
      });
      if (r.ok) ok++;
    }
    res.whatsapp = `${ok}/${phones.length} sent`;
  }
  return res;
}

function jwtPayload(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch { return {}; }
}
async function superAdminFrom(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return null;
  const { data } = await admin.auth.getUser(jwt);
  if (!data?.user) return null;
  const hasTotp = (data.user.factors ?? []).some((f: { status?: string }) => f.status === "verified");
  if (hasTotp && jwtPayload(jwt).aal !== "aal2") return null;
  const { data: p } = await admin.from("profiles").select("role,status").eq("id", data.user.id).maybeSingle();
  return p && p.role === "Super Admin" && (p.status ?? "Active") !== "Inactive" ? data.user : null;
}

// The scheduled job's proof: header x-salonos-cron = app_secrets 'cron_secret' (step15). No row → no
// scheduled runs accepted (fails closed).
async function isCronCall(req: Request) {
  const got = req.headers.get("x-salonos-cron") ?? "";
  if (!got) return false;
  const { data } = await admin.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
  const want = String(data?.value ?? "");
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

async function run(manual: boolean) {
  const kv = await loadKv();
  const settings = { ...DEFAULTS, ...(kv.get("salonos_secret_automation_settings") ?? {}) };
  if (!settings.enabled && !manual) return { skipped: "automation is turned off" };
  const today = Math.floor((Date.now() + 5.5 * 3600e3) / 864e5); // IST calendar day
  const { alerts, locks } = computeAlerts(kv, settings, today);
  if (settings.loginWatch) {
    const { data: ev, error: evErr } = await admin.rpc("salonos_login_events", { since: new Date(Date.now() - 61 * 864e5).toISOString() });
    if (!evErr && Array.isArray(ev)) alerts.push(...loginWatchAlerts(ev, Date.now()));
  }
  if (settings.errorWatch) {
    const { data: er, error: erErr } = await admin.from("client_errors").select("at,email,message")
      .gte("at", new Date(Date.now() - 24 * 3600e3).toISOString()).limit(500);
    if (!erErr && Array.isArray(er)) alerts.push(...errorWatchAlerts(er, Date.now()));
  }

  const lockedNow: string[] = [];
  for (const l of locks) {
    if (await lockMonth(l.sid, l.month)) {
      lockedNow.push(`${l.sid}:${mCode(l.month)}`);
      const o = (kv.get("salonos_salons") ?? []).find((s: any) => Number(s.id) === l.sid);
      alerts.push({ akey: `month_lock:${l.sid}:${mCode(l.month)}`, outlet_id: l.sid, kind: "month_lock", severity: "info",
        title: `${String(o?.name || "Outlet").split("—")[0].trim()}: ${mLabel(l.month)} locked automatically`,
        body: "Attendance, Salary and Incentive Working for that month can no longer be edited. A Super Admin can unlock it from Master Sheet → 🔒 Months.",
        tab: "master-salary", due_date: null, auto: false });
    }
  }

  // Current open alerts → update/insert what's still true, close the self-closing ones that aren't.
  const { data: existing, error } = await admin.from("alerts").select("id,akey,auto,resolved_at,resolved_how");
  if (error) throw error;
  const open = (existing ?? []).filter((r) => !r.resolved_at);
  // Someone marked it done — don't reopen it. (Ones the job closed as fixed reopen if the problem returns.)
  const doneAlready = new Set((existing ?? []).filter((r) => r.resolved_how === "done").map((r) => r.akey));
  const openKeys = new Set(open.map((r) => r.akey));
  const now = new Date().toISOString();
  const fresh = alerts.filter((a) => !openKeys.has(a.akey) && !doneAlready.has(a.akey));
  const keep = alerts.filter((a) => !doneAlready.has(a.akey)).map((a) => ({ ...a, updated_at: now, resolved_at: null, resolved_by: null, resolved_how: null }));
  for (let i = 0; i < keep.length; i += 200) {
    const { error: e } = await admin.from("alerts").upsert(keep.slice(i, i + 200), { onConflict: "akey" });
    if (e) throw e;
  }
  const want = new Set(alerts.map((a) => a.akey));
  const fixed = open.filter((r) => r.auto && !want.has(r.akey)).map((r) => r.id);
  if (fixed.length) await admin.from("alerts").update({ resolved_at: now, resolved_how: "fixed", updated_at: now }).in("id", fixed);
  await admin.from("alerts").delete().lt("resolved_at", new Date(Date.now() - 90 * 864e5).toISOString());

  const digest = settings.digest && fresh.length && !manual ? await sendDigest(kv, fresh) : null;
  return { open: keep.length, new: fresh.length, closed: fixed.length, locked: lockedNow, digest };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const hasToken = /^Bearer\s+\S+\.\S+\.\S+/i.test(req.headers.get("Authorization") ?? "");
    const user = hasToken ? await superAdminFrom(req) : null;
    const body = await req.json().catch(() => ({}));
    const manual = body.kind === "run";
    if (manual && !user) return json({ error: "Only a signed-in Super Admin can run the checks now." }, 403);
    if (!manual && !(await isCronCall(req))) return json({ error: "Not allowed." }, 403);
    return json(await run(manual));
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
