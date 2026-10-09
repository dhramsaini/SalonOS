// SalonOS — automatic owner reports (Supabase Edge Function "salonos-reports").
//
// • Nightly (22:00 IST) : today's sales / expenses / attendance per outlet + month-to-date sales.
// • Weekly (Monday, 09:00 IST): last week per outlet vs the week before, attendance, bills due this week.
// • Monthly (1st, 09:00 IST): last month's sales and expenses per outlet.
// Delivered by email (Resend) and/or WhatsApp (Meta Cloud API) to the recipients a Super Admin
// sets in SalonOS → Master Settings → Automatic reports (stored in kv_store as
// salonos_secret_report_settings, readable only by Super Admins).
//
// Email and WhatsApp details are normally saved from Master Settings → Email / WhatsApp (app_secrets rows
// "email" and "whatsapp", service role only). Edge Function secrets, if set, take precedence:
//   RESEND_API_KEY            email sending key from resend.com
//   REPORT_FROM               e.g. "SalonOS Reports <reports@digitalca.co.in>" (a domain verified in Resend)
//   WHATSAPP_TOKEN            (optional) Meta WhatsApp Cloud API permanent token
//   WHATSAPP_PHONE_NUMBER_ID  (optional) the sending number's ID in Meta
//   WHATSAPP_TEMPLATE         (optional) approved template name, default "salonos_daily_summary"
//   WHATSAPP_TEMPLATE_LANG    (optional) template language code, default "en"
//
// Who can trigger it: the scheduled job (no login — it proves itself with the x-salonos-cron header,
// a random value kept in app_secrets 'cron_secret', step15; it can only send the one scheduled
// report per day/month to the configured recipients, never data back to the caller), or a signed-in
// active Super Admin (at aal2 if two-step login is on) via "Send test report now". Any other call is
// refused — otherwise anyone could send today's report early, and the real 22:00 one would be skipped.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const pad = (n: number) => String(n).padStart(2, "0");
const num = (v: unknown) => Number(v) || 0;
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
// "IST date" helpers: shift the clock by +5:30 and read the UTC fields.
const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type KV = Map<string, any>;
async function loadKv(): Promise<KV> {
  // In pages: the API returns at most 1000 rows per request.
  const data: { key: string; value: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await admin.from("kv_store").select("key,value").not("value", "is", null).order("key").range(from, from + 999);
    if (error) throw error;
    data.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }
  const m: KV = new Map();
  for (const r of data) { try { m.set(r.key, JSON.parse(r.value)); } catch { /* not JSON */ } }
  return m;
}

// Daily Sales & Collection rows 0–4: Cash, Card, UPI, Luzo, Outstanding sale. Expenses live in the
// separate daily_sales_data record (one value per expense row).
function dayFigures(kv: KV, sid: number, iso: string) {
  const s = (kv.get(`salonos_daily_sales_collection_data_outlet_${sid}`) ?? {})[iso] ?? {};
  const cash = num(s[0]), card = num(s[1]), upi = num(s[2]), luzo = num(s[3]), osale = num(s[4]);
  const e = (kv.get(`salonos_daily_sales_data_outlet_${sid}`) ?? {})[iso] ?? {};
  const exp = Object.values(e).reduce((t: number, v) => t + num(v), 0);
  return { cash, card, upi, luzo, osale, sales: cash + card + upi + luzo + osale, exp, entered: Object.keys(s).length > 0 };
}
function rangeFigures(kv: KV, sid: number, y: number, m: number, lastDay: number) {
  let sales = 0, exp = 0, days = 0;
  for (let d = 1; d <= lastDay; d++) {
    const f = dayFigures(kv, sid, `${y}-${pad(m + 1)}-${pad(d)}`);
    sales += f.sales; exp += f.exp; if (f.entered) days++;
  }
  return { sales, exp, days };
}
function attendanceOn(kv: KV, sid: number, d: Date) {
  const emps = (kv.get(`salonos_master_employees_outlet_${sid}`) ?? []).filter((e: any) => e.status === "Active");
  const att = kv.get(`salonos_attendance_outlet_${sid}`) ?? {};
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  // Same rule as the nightly check: only staff employed that day count, and an unmarked weekly off is an off day.
  const dayIso = (s: unknown) => { const t = String(s ?? "").trim(); let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
  const employed = emps.filter((e: any) => { const j = dayIso(e.doj), l = dayIso(e.dol); return !(j && j > iso) && !(l && l < iso); });
  const c = { staff: employed.length, present: 0, absent: 0, half: 0, off: 0, unmarked: 0 };
  const dow = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
  for (const e of employed) {
    const rec = att[`${e.id}_${d.getUTCFullYear()}_${d.getUTCMonth()}`];
    const v = rec?.days?.[d.getUTCDate() - 1];
    if (v === "present") c.present++; else if (v === "absent") c.absent++; else if (v === "half") c.half++;
    else if (v === "off" || v === "holiday" || (!v && e.weeklyOff && e.weeklyOff === dow)) c.off++; else c.unmarked++;
  }
  return c;
}

function buildDaily(kv: KV) {
  const now = istNow();
  const iso = isoOf(now);
  const outlets = (kv.get("salonos_salons") ?? []).filter((s: any) => s.status === "Active");
  const title = `Daily summary — ${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const rows = outlets.map((o: any) => {
    const sid = Number(o.id);
    const f = dayFigures(kv, sid, iso);
    const mtd = rangeFigures(kv, sid, now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const a = attendanceOn(kv, sid, now);
    return { name: String(o.name), f, mtd, a };
  });
  const html = `<h2 style="margin:0 0 4px;color:#14335e">${escapeHtml(title)}</h2>
<p style="margin:0 0 16px;color:#5e6a82">Automatic report from SalonOS</p>
${rows.map((r: any) => `<table cellpadding="6" style="border-collapse:collapse;width:100%;max-width:560px;margin-bottom:16px;font:14px Arial,sans-serif;border:1px solid #d9e1f0">
<tr><th colspan="2" style="background:#14335e;color:#fff;text-align:left">${escapeHtml(r.name)}</th></tr>
<tr><td>Sales today</td><td align="right"><b>${r.f.entered ? inr(r.f.sales) : "Not entered yet"}</b></td></tr>
${r.f.entered ? `<tr><td style="color:#5e6a82">Cash / Card / UPI / Luzo</td><td align="right" style="color:#5e6a82">${inr(r.f.cash)} / ${inr(r.f.card)} / ${inr(r.f.upi)} / ${inr(r.f.luzo)}</td></tr>` : ""}
<tr><td>Expenses today</td><td align="right">${inr(r.f.exp)}</td></tr>
<tr><td>Sales this month so far</td><td align="right">${inr(r.mtd.sales)} <span style="color:#5e6a82">(${r.mtd.days} day${r.mtd.days === 1 ? "" : "s"} entered)</span></td></tr>
<tr><td>Attendance today</td><td align="right">${r.a.present} present · ${r.a.absent} absent${r.a.half ? ` · ${r.a.half} half day` : ""}${r.a.unmarked ? ` · <span style="color:#c06a12">${r.a.unmarked} not marked</span>` : ""} (of ${r.a.staff})</td></tr>
</table>`).join("")}`;
  const line = rows.map((r: any) => `${r.name}: ${r.f.entered ? inr(r.f.sales) + " sales" : "sales not entered"}, ${inr(r.f.exp)} exp, ${r.a.present}/${r.a.staff} present, MTD ${inr(r.mtd.sales)}`).join(" | ");
  return { key: `daily:${iso}`, title, html, line };
}

// 9 AM owner brief: yesterday's figures per outlet, days still missing this month, cash differences
// over the outlet's limit, and approvals waiting (Master Settings → Controls → Approvals).
export function buildMorning(kv: KV) {
  const now = istNow();
  const y = new Date(now.getTime() - 864e5);
  const yIso = isoOf(y);
  const outlets = (kv.get("salonos_salons") ?? []).filter((s: any) => s.status === "Active");
  const pending = (kv.get("salonos_approvals") ?? []).filter((a: any) => a && a.status === "pending").length;
  const title = `Good morning — ${y.getUTCDate()} ${MONTHS[y.getUTCMonth()]} at a glance`;
  const rows = outlets.map((o: any) => {
    const sid = Number(o.id);
    const f = dayFigures(kv, sid, yIso);
    const mtd = rangeFigures(kv, sid, y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate());
    let missing = 0;
    for (let d = 1; d <= y.getUTCDate(); d++) if (!dayFigures(kv, sid, `${y.getUTCFullYear()}-${pad(y.getUTCMonth() + 1)}-${pad(d)}`).entered) missing++;
    const cc = (kv.get(`salonos_cash_counts_outlet_${sid}`) ?? {})[yIso];
    const lim = o.cashDiffLimit !== "" && o.cashDiffLimit != null && Number(o.cashDiffLimit) >= 0 ? Number(o.cashDiffLimit) : 100;
    const cashDiff = cc && cc.count != null && cc.closing != null ? num(cc.count) - num(cc.closing) : null;
    return { name: String(o.name).split("—")[0].trim(), f, mtd, missing, cashDiff: cashDiff != null && Math.abs(cashDiff) > lim ? cashDiff : null };
  });
  const tot = rows.reduce((s: number, r: any) => s + r.f.sales, 0);
  const html = `<h2 style="margin:0 0 4px;color:#14335e">${escapeHtml(title)}</h2>
<p style="margin:0 0 12px;color:#5e6a82">All outlets yesterday: <b>${inr(tot)}</b> sales${pending ? ` · <b style="color:#c06a12">${pending} approval${pending === 1 ? "" : "s"} waiting</b>` : ""}</p>
<table cellpadding="6" style="border-collapse:collapse;width:100%;max-width:600px;font:14px Arial,sans-serif;border:1px solid #d9e1f0">
<tr style="background:#14335e;color:#fff"><th align="left">Outlet</th><th align="right">Sales</th><th align="right">Expenses</th><th align="right">Month so far</th><th align="left">Needs attention</th></tr>
${rows.map((r: any) => `<tr><td>${escapeHtml(r.name)}</td><td align="right">${r.f.entered ? inr(r.f.sales) : "—"}</td><td align="right">${inr(r.f.exp)}</td><td align="right">${inr(r.mtd.sales)}</td><td style="color:#c06a12">${[!r.f.entered ? "sales not entered" : "", r.missing ? `${r.missing} day${r.missing === 1 ? "" : "s"} missing` : "", r.cashDiff != null ? `cash difference ${inr(r.cashDiff)}` : ""].filter(Boolean).join(" · ")}</td></tr>`).join("")}
</table>`;
  const line = `Yesterday ${inr(tot)}` + (pending ? `, ${pending} approval(s) waiting` : "") + " | " + rows.map((r: any) => `${r.name}: ${r.f.entered ? inr(r.f.sales) : "not entered"}${r.missing ? `, ${r.missing}d missing` : ""}${r.cashDiff != null ? `, cash diff ${inr(r.cashDiff)}` : ""}`).join(" | ");
  return { key: `morning:${yIso}`, title, html, line };
}

function buildMonthly(kv: KV) {
  const now = istNow();
  const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const m = (now.getUTCMonth() + 11) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const outlets = (kv.get("salonos_salons") ?? []).filter((s: any) => s.status === "Active");
  const title = `Monthly summary — ${MONTHS[m]} ${y}`;
  const rows = outlets.map((o: any) => ({ name: String(o.name), t: rangeFigures(kv, Number(o.id), y, m, lastDay) }));
  const tot = rows.reduce((s: any, r: any) => ({ sales: s.sales + r.t.sales, exp: s.exp + r.t.exp }), { sales: 0, exp: 0 });
  const html = `<h2 style="margin:0 0 4px;color:#14335e">${escapeHtml(title)}</h2>
<p style="margin:0 0 16px;color:#5e6a82">Automatic report from SalonOS — daily sales and expense entries for the month. Open SalonOS for the full P&amp;L.</p>
<table cellpadding="6" style="border-collapse:collapse;width:100%;max-width:560px;font:14px Arial,sans-serif;border:1px solid #d9e1f0">
<tr style="background:#14335e;color:#fff"><th align="left">Outlet</th><th align="right">Sales</th><th align="right">Expenses</th><th align="right">Days entered</th></tr>
${rows.map((r: any) => `<tr><td>${escapeHtml(r.name)}</td><td align="right">${inr(r.t.sales)}</td><td align="right">${inr(r.t.exp)}</td><td align="right">${r.t.days}/${lastDay}</td></tr>`).join("")}
<tr style="font-weight:bold;border-top:2px solid #14335e"><td>Total</td><td align="right">${inr(tot.sales)}</td><td align="right">${inr(tot.exp)}</td><td></td></tr>
</table>`;
  const line = rows.map((r: any) => `${r.name}: ${inr(r.t.sales)} sales, ${inr(r.t.exp)} exp`).join(" | ") + ` | Total ${inr(tot.sales)} sales`;
  return { key: `monthly:${y}-${pad(m + 1)}`, title, html, line };
}

// Weekly (Monday 09:00 IST): last Monday–Sunday per outlet against the week before, attendance for
// the week (worked ÷ working days marked), and vendor bills due in the coming 7 days.
export function buildWeekly(kv: KV, now: Date) {
  const dn = Math.floor(now.getTime() / 864e5); // IST day number (now is already shifted to IST)
  const monday = dn - ((new Date(dn * 864e5).getUTCDay() + 6) % 7); // this week's Monday
  const dOf = (n: number) => new Date(n * 864e5);
  const lab = (n: number) => `${dOf(n).getUTCDate()} ${MONTHS[dOf(n).getUTCMonth()].slice(0, 3)}`;
  const outlets = (kv.get("salonos_salons") ?? []).filter((s: any) => s.status === "Active");
  const week = (sid: number, start: number) => {
    let sales = 0, exp = 0, days = 0;
    for (let i = 0; i < 7; i++) { const f = dayFigures(kv, sid, isoOf(dOf(start + i))); sales += f.sales; exp += f.exp; if (f.entered) days++; }
    return { sales, exp, days };
  };
  const rows = outlets.map((o: any) => {
    const sid = Number(o.id);
    const cur = week(sid, monday - 7), prev = week(sid, monday - 14);
    const emps = (kv.get(`salonos_master_employees_outlet_${sid}`) ?? []).filter((e: any) => e.status === "Active");
    const att = kv.get(`salonos_attendance_outlet_${sid}`) ?? {};
    let worked = 0, working = 0;
    for (const e of emps) for (let i = 0; i < 7; i++) {
      const d = dOf(monday - 7 + i);
      const v = att[`${e.id}_${d.getUTCFullYear()}_${d.getUTCMonth()}`]?.days?.[d.getUTCDate() - 1];
      if (v === "present") { worked++; working++; } else if (v === "half") { worked += 0.5; working++; } else if (v === "absent") working++;
    }
    let due = 0, overdue = 0;
    for (const inv of kv.get(`salonos_vendor_invoices_outlet_${sid}`) ?? []) {
      if (!inv || inv.docNature === "Performa Invoice") continue;
      const bal = num(inv.amount) - (inv.payments ?? []).reduce((t: number, p: any) => t + num(p.paidAmount), 0);
      const m = String(inv.dueDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})|^(\d{2})\/(\d{2})\/(\d{4})/);
      if (bal <= 0.5 || !m) continue;
      const dd = m[1] ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : Date.UTC(+m[6], +m[5] - 1, +m[4]);
      const n = Math.floor(dd / 864e5);
      if (n < dn) overdue += bal; else if (n <= dn + 7) due += bal;
    }
    const chg = prev.sales ? Math.round((cur.sales - prev.sales) / prev.sales * 100) : null;
    return { name: String(o.name).split("—")[0].trim(), cur, prev, chg, attPct: working ? Math.round(worked / working * 100) : null, due, overdue };
  });
  const title = `Weekly summary — ${lab(monday - 7)} to ${lab(monday - 1)}`;
  const html = `<h2 style="margin:0 0 4px;color:#14335e">${escapeHtml(title)}</h2>
<p style="margin:0 0 16px;color:#5e6a82">Automatic report from SalonOS — last week against the week before.</p>
${rows.map((r: any) => `<table cellpadding="6" style="border-collapse:collapse;width:100%;max-width:560px;margin-bottom:16px;font:14px Arial,sans-serif;border:1px solid #d9e1f0">
<tr><th colspan="2" style="background:#14335e;color:#fff;text-align:left">${escapeHtml(r.name)}</th></tr>
<tr><td>Sales</td><td align="right"><b>${inr(r.cur.sales)}</b>${r.chg == null ? "" : ` <span style="color:${r.chg >= 0 ? "#12805c" : "#cf3d3d"}">(${r.chg >= 0 ? "+" : ""}${r.chg}%)</span>`}</td></tr>
<tr><td>Expenses</td><td align="right">${inr(r.cur.exp)}</td></tr>
<tr><td>Days with sales entered</td><td align="right">${r.cur.days} of 7</td></tr>
<tr><td>Attendance</td><td align="right">${r.attPct == null ? "not marked" : r.attPct + "%"}</td></tr>
<tr><td>Vendor bills due this week</td><td align="right">${inr(r.due)}${r.overdue > 0.5 ? ` <span style="color:#cf3d3d">+ ${inr(r.overdue)} overdue</span>` : ""}</td></tr>
</table>`).join("")}`;
  const line = rows.map((r: any) => `${r.name}: ${inr(r.cur.sales)} sales${r.chg == null ? "" : ` (${r.chg >= 0 ? "+" : ""}${r.chg}% vs week before)`}, attendance ${r.attPct == null ? "not marked" : r.attPct + "%"}, bills due ${inr(r.due)}${r.overdue > 0.5 ? `, overdue ${inr(r.overdue)}` : ""}`).join(" | ");
  return { key: `weekly:${isoOf(dOf(monday))}`, title, html, line };
}

// Email details: Edge Function secrets if set, else the ones saved in Master Settings → Email
// (app_secrets row "email", written by the email function).
async function emailCreds() {
  if (RESEND_API_KEY) return { key: RESEND_API_KEY, from: REPORT_FROM };
  const { data } = await admin.from("app_secrets").select("value,meta").eq("name", "email").maybeSingle();
  return data?.value ? { key: String(data.value), from: String(data.meta?.from || "SalonOS Reports <onboarding@resend.dev>") } : null;
}
async function sendEmail(to: string[], subject: string, html: string) {
  const em = await emailCreds();
  if (!em) return { ok: false, error: "Email is not set up yet — connect it in Master Settings → Email." };
  if (!to.length) return { ok: false, error: "No email recipients set." };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${em.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: em.from, to, subject: `SalonOS · ${subject}`, html: `<div style="font-family:Arial,sans-serif">${html}</div>` }),
  });
  return r.ok ? { ok: true } : { ok: false, error: `Email failed (${r.status}): ${(await r.text()).slice(0, 300)}` };
}
// WhatsApp details: Edge Function secrets if set, else the ones saved in Master Settings → WhatsApp
// (app_secrets row "whatsapp", written by the whatsapp function).
async function waCreds() {
  if (WA_TOKEN && WA_PHONE_ID) return { token: WA_TOKEN, phoneId: WA_PHONE_ID };
  const { data } = await admin.from("app_secrets").select("value,meta").eq("name", "whatsapp").maybeSingle();
  let v: { token?: string } = {};
  try { v = JSON.parse(data?.value ?? "{}"); } catch { /* none */ }
  return v.token && data?.meta?.phoneNumberId ? { token: v.token, phoneId: String(data.meta.phoneNumberId) } : null;
}
async function sendWhatsApp(to: string[], title: string, line: string) {
  const wa = await waCreds();
  if (!wa) return { ok: false, error: "WhatsApp is not set up yet — connect it in Master Settings → WhatsApp." };
  if (!to.length) return { ok: false, error: "No WhatsApp numbers set." };
  const errors: string[] = [];
  for (const num of to) {
    // Business-initiated WhatsApp messages must use a Meta-approved template; ours has two text
    // parameters: {{1}} the report title and {{2}} the one-line summary (no line breaks allowed).
    const r = await fetch(`https://graph.facebook.com/v23.0/${wa.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${wa.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: num.replace(/[^\d]/g, ""), type: "template",
        template: { name: WA_TEMPLATE, language: { code: WA_LANG },
          components: [{ type: "body", parameters: [{ type: "text", text: title }, { type: "text", text: line.slice(0, 1000) }] }] },
      }),
    });
    if (!r.ok) errors.push(`${num}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  return errors.length ? { ok: false, error: "WhatsApp failed for " + errors.join("; ") } : { ok: true };
}

function jwtPayload(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch { return {}; }
}
async function isActiveSuperAdmin(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data } = await admin.auth.getUser(jwt);
  if (!data?.user) return false;
  const hasTotp = (data.user.factors ?? []).some((f: { status?: string }) => f.status === "verified");
  if (hasTotp && jwtPayload(jwt).aal !== "aal2") return false;
  const { data: p } = await admin.from("profiles").select("role,status").eq("id", data.user.id).maybeSingle();
  return !!p && p.role === "Super Admin" && (p.status ?? "Active") !== "Inactive";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body.kind === "monthly" ? "monthly" : body.kind === "weekly" ? "weekly" : body.kind === "morning" ? "morning" : "daily";
    const test = !!body.test;
    if (test && !(await isActiveSuperAdmin(req))) return json({ error: "Only a signed-in Super Admin can send a test report." }, 403);
    if (!test && !(await isCronCall(req))) return json({ error: "Not allowed." }, 403);

    const kv = await loadKv();
    const settings = kv.get("salonos_secret_report_settings") ?? {};
    if (!test && (settings[kind] === false || (kind === "morning" && settings.morning !== true))) return json({ skipped: `${kind} reports are turned off` });
    const report = kind === "monthly" ? buildMonthly(kv) : kind === "weekly" ? buildWeekly(kv, istNow()) : kind === "morning" ? buildMorning(kv) : buildDaily(kv);

    // Scheduled runs send each report once only, however often the job is triggered.
    const state = kv.get("salonos_secret_report_state") ?? {};
    if (!test && state[report.key]) return json({ skipped: "already sent", report: report.key });

    const emails: string[] = (settings.emails ?? []).filter((e: string) => /@/.test(e));
    const phones: string[] = (settings.whatsapp ?? []).filter((p: string) => /\d{8,}/.test(p.replace(/[^\d]/g, "")));
    if (!test && !emails.length && !phones.length) return json({ skipped: "no recipients set", report: report.key });
    const results: Record<string, unknown> = {};
    if (emails.length || test) results.email = await sendEmail(emails, (test ? "[Test] " : "") + report.title, report.html);
    if (phones.length) results.whatsapp = await sendWhatsApp(phones, (test ? "[Test] " : "") + report.title, report.line);

    if (!test) {
      const next = { ...state, [report.key]: new Date().toISOString() };
      await admin.from("kv_store").upsert({ key: "salonos_secret_report_state", value: JSON.stringify(next), updated_at: new Date().toISOString() });
    }
    return json({ report: report.key, results });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
