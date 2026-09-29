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
//
// Settings: Master Settings → Automation (kv salonos_secret_automation_settings, Super Admin only).
// Optional digest of new alerts by email / WhatsApp to the "Automatic reports" recipients, using the
// same secrets as salonos-reports (RESEND_API_KEY, REPORT_FROM, WHATSAPP_*).
//
// Who can trigger it: the scheduled job (no login; it only rewrites alerts and returns counts), or a
// signed-in active Super Admin ("Run checks now"), who also gets the list back.
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
  recurringReminders: true, monthEndChecklist: true, autoLock: false, autoLockDay: 10, digest: false,
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
          const due = dayOf(Y, M, dueDay);
          if (due - today > settings.dueDaysAhead) continue;
          const amt = it.gstApplicable ? num(it.amount) + num(it.gstAmount) : num(it.amount);
          out.push({ akey: `recurring:${sid}:${it.id}:${mCode(thisMonth)}`, outlet_id: sid, kind: "recurring", severity: due < today ? "urgent" : "warn",
            title: `${name}: ${label} ${due < today ? "was due" : due === today ? "is due today" : "is due"} on ${nice(due)}`,
            body: `${it.payee || ""} · about ${inr(amt)} (${it.paymentMode || "payment"}). Mark done once paid.`, tab: "recurring-expenses", due_date: isoOfDay(due), auto: false });
        }
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
  }
  return { alerts: out, locks };
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
  if (phones.length && WA_TOKEN && WA_PHONE_ID) {
    const line = fresh.map((a) => a.title).join(" | ").slice(0, 1000);
    let ok = 0;
    for (const p of phones) {
      const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: p.replace(/[^\d]/g, ""), type: "template",
          template: { name: WA_TEMPLATE, language: { code: WA_LANG }, components: [{ type: "body", parameters: [{ type: "text", text: "SalonOS · " + title }, { type: "text", text: line }] }] } }),
      });
      if (r.ok) ok++;
    }
    res.whatsapp = `${ok}/${phones.length} sent`;
  }
  return res;
}

async function superAdminFrom(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return null;
  const { data } = await admin.auth.getUser(jwt);
  if (!data?.user) return null;
  const { data: p } = await admin.from("profiles").select("role,status").eq("id", data.user.id).maybeSingle();
  return p && p.role === "Super Admin" && (p.status ?? "Active") !== "Inactive" ? data.user : null;
}

async function run(manual: boolean) {
  const kv = await loadKv();
  const settings = { ...DEFAULTS, ...(kv.get("salonos_secret_automation_settings") ?? {}) };
  if (!settings.enabled && !manual) return { skipped: "automation is turned off" };
  const today = Math.floor((Date.now() + 5.5 * 3600e3) / 864e5); // IST calendar day
  const { alerts, locks } = computeAlerts(kv, settings, today);

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
    return json(await run(manual));
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
