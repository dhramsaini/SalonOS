// SalonOS — WhatsApp (Supabase Edge Function "whatsapp"), using the WhatsApp Business Cloud API (Meta).
//
// 1. Webhook (called by Meta; checked with the app secret's X-Hub-Signature-256):
//    • a registered staff number sends a PHOTO or PDF of a vendor bill → the file goes to private
//      storage (salonos-files/outlet_<id>/whatsapp/…), the "ai" function reads it (internal call, same
//      AI keys and bill fields as "+ Add Invoice"), and a draft lands in kv
//      salonos_whatsapp_inbox_outlet_<id>. Staff review it in SalonOS → Vendors → 📥 WhatsApp bills,
//      which opens the normal invoice form pre-filled. Nothing becomes an invoice without a person.
//    • "today" / "sales" / "aaj" → today's sales, expenses and staff present for the sender's outlet.
//    • anything else → a short help reply. Unregistered numbers get "not registered".
// 2. App actions (POST JSON {action, ...} with the user's login):
//    status | save {token?, appSecret?, phoneNumberId, templates?} | remove | test {to}   (Super Admin, aal2)
//    notify_salary {outletId, month, items:[{empId, amount}]}  (edit access to that outlet's Salary Working)
//
// Credentials live in public.app_secrets row "whatsapp" (value = JSON {token, appSecret}; meta =
// {phoneNumberId, verifyToken, displayPhone, tokenHint, templates}), service role only — entered from
// Master Settings → WhatsApp, never returned to a browser. Registered numbers and switches are kv
// salonos_secret_whatsapp_settings {senders:[{phone, name, outletId}], billCapture, todayReplies}.
// Deploy with "Verify JWT" OFF (Meta calls the webhook without a Supabase login).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GRAPH = "https://graph.facebook.com/v23.0";
const BUCKET = "salonos-files";
const MAX_BYTES = 8 * 1024 * 1024;
const BILLS_PER_SENDER_PER_DAY = 40;
// Same list as AI_BILL_CATEGORIES in js/13-pnl.js (tests.html checks they match).
export const BILL_CATEGORIES = ["Purchase of Cosmetic", "Housekeeping", "Equipment", "Utilities", "Rent", "DG Rent", "Drycleaning Expenses",
  "Professional Fee", "Staff Room Rent", "Royalty", "Electricity Expenses", "Uniform Expenses", "Telephone & Internet Expenses",
  "Maintenance Expenses", "Marketing", "Fixed Assets", "Food & Raw Material Purchase", "Liquor Purchase", "Packaging Material",
  "Gas / LPG", "Pest Control", "Licences & Fees", "Other"];
const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
// deno-lint-ignore no-explicit-any
type Json = any;
const num = (v: unknown) => Number(v) || 0;
const pad = (n: number) => String(n).padStart(2, "0");
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// Indian numbers as WhatsApp sends them (country code, digits only): 98765 43210 → 919876543210.
export function waNumber(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d.length >= 11 && d.length <= 15 ? d : "";
}

// ── Credentials ──
type Cfg = { token: string; appSecret: string; phoneNumberId: string; verifyToken: string; displayPhone: string; templates: { salary: string; lang: string } };
async function waConfig(): Promise<Cfg | null> {
  const { data } = await admin.from("app_secrets").select("value,meta").eq("name", "whatsapp").maybeSingle();
  let v: Json = {};
  try { v = JSON.parse(data?.value ?? "{}"); } catch { /* not JSON */ }
  const m = data?.meta ?? {};
  const token = v.token || Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneNumberId = m.phoneNumberId || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId, appSecret: v.appSecret || Deno.env.get("WHATSAPP_APP_SECRET") || "", verifyToken: m.verifyToken || "",
    displayPhone: m.displayPhone || "", templates: { salary: m.templates?.salary || "salonos_salary_paid", lang: m.templates?.lang || "en" } };
}

async function graph(cfg: Cfg, path: string, body?: unknown) {
  const r = await fetch(GRAPH + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + cfg.token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000),
  });
  const text = await r.text();
  let data: Json = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) throw new HttpError(r.status === 401 || r.status === 403 ? 400 : 502, "WhatsApp: " + String(data?.error?.message ?? text).slice(0, 300));
  return data;
}
const sendText = (cfg: Cfg, to: string, text: string) =>
  graph(cfg, `/${cfg.phoneNumberId}/messages`, { messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } }).catch(() => null);

// ── kv helpers (same conditional-update pattern as the automation function) ──
async function kvGet(key: string) {
  const { data } = await admin.from("kv_store").select("value").eq("key", key).maybeSingle();
  try { return data?.value ? JSON.parse(data.value) : null; } catch { return null; }
}
async function kvAppend(key: string, item: Json, keep = 300): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: row } = await admin.from("kv_store").select("value,updated_at").eq("key", key).maybeSingle();
    let list: Json[] = [];
    try { list = row?.value ? JSON.parse(row.value) : []; } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    if (list.some((x) => x && x.id === item.id)) return false; // Meta re-sent the same message
    const next = JSON.stringify([...list, item].slice(-keep));
    const now = new Date().toISOString();
    const res = row
      ? await admin.from("kv_store").update({ value: next, updated_at: now }).eq("key", key).eq("updated_at", row.updated_at).select("key")
      : await admin.from("kv_store").insert({ key, value: next, updated_at: now }).select("key");
    if (!res.error && res.data?.length) return true;
  }
  throw new Error("Could not save to " + key);
}

// ── Webhook signature (HMAC-SHA256 of the raw body with the Meta app secret) ──
export async function validSignature(appSecret: string, raw: Uint8Array, header: string | null) {
  if (!appSecret || !header || !header.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, raw))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7).toLowerCase();
  if (got.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function cronSecret() {
  const { data } = await admin.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
  return String(data?.value ?? "");
}
// The "ai" function (Verify JWT ON) accepts this service call: the anon key passes the gateway and
// x-salonos-internal = app_secrets cron_secret identifies it as SalonOS itself.
async function readBillWithAI(file: string, mediaType: string) {
  const secret = await cronSecret();
  if (!secret) return { error: "internal key missing (run supabase/step15)" };
  const r = await fetch(`${SUPABASE_URL}/functions/v1/ai`, {
    method: "POST", signal: AbortSignal.timeout(150_000),
    headers: { Authorization: "Bearer " + ANON_KEY, apikey: ANON_KEY, "x-salonos-internal": secret, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "read_bill", file, mediaType, categories: BILL_CATEGORIES }),
  });
  const data = await r.json().catch(() => ({}));
  if (data.notConfigured) return { notConfigured: true };
  if (!r.ok || data.error) return { error: String(data.error || "AI error " + r.status) };
  return { data };
}

// Today's figures for one outlet — same reading of Daily Sales & Exp. as the reports function.
export function todayText(kv: Map<string, Json>, sid: number, name: string, now: Date) {
  const iso = isoOf(now);
  const s = (kv.get(`salonos_daily_sales_collection_data_outlet_${sid}`) ?? {});
  const e = (kv.get(`salonos_daily_sales_data_outlet_${sid}`) ?? {})[iso] ?? {};
  const day = (d: string) => { const r = s[d] ?? {}; return { entered: Object.values(r).some((v) => String(v ?? "") !== ""), sales: num(r[0]) + num(r[1]) + num(r[2]) + num(r[3]) + num(r[4]) }; };
  const t = day(iso);
  let mtd = 0;
  for (let d = 1; d <= now.getUTCDate(); d++) mtd += day(`${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(d)}`).sales;
  const exp = Object.values(e).reduce((a: number, v) => a + num(v), 0);
  const emps = (kv.get(`salonos_master_employees_outlet_${sid}`) ?? []).filter((x: Json) => x && x.status === "Active");
  const att = kv.get(`salonos_attendance_outlet_${sid}`) ?? {};
  let present = 0, absent = 0, unmarked = 0;
  for (const x of emps) {
    const v = att[`${x.id}_${now.getUTCFullYear()}_${now.getUTCMonth()}`]?.days?.[now.getUTCDate() - 1];
    if (v === "present" || v === "half") present++; else if (v === "absent") absent++; else if (v !== "off" && v !== "holiday") unmarked++;
  }
  return `📊 ${name} — today\nSales: ${t.entered ? inr(t.sales) : "not entered yet"}\nExpenses: ${inr(exp)}\nThis month so far: ${inr(mtd)}\n` +
    `Staff: ${present} present, ${absent} absent${unmarked ? `, ${unmarked} not marked` : ""} (of ${emps.length})`;
}
const HELP = "SalonOS on WhatsApp:\n• Send a photo or PDF of a vendor bill — it's read automatically and waits in SalonOS → Vendors → 📥 WhatsApp bills for you to check.\n• Send \"today\" for today's sales and attendance.";

async function handleMessage(cfg: Cfg, msg: Json) {
  const from = waNumber(msg.from);
  if (!from) return;
  const settings = (await kvGet("salonos_secret_whatsapp_settings")) ?? {};
  const sender = (settings.senders ?? []).find((s: Json) => waNumber(s.phone) === from);
  if (!sender) { await sendText(cfg, from, "This number isn't registered with SalonOS. Ask your Super Admin to add it in Master Settings → WhatsApp."); return; }
  const sid = Number(sender.outletId);
  const salons = (await kvGet("salonos_salons")) ?? [];
  const outlet = salons.find((s: Json) => Number(s.id) === sid);
  if (!outlet) { await sendText(cfg, from, "Your number isn't linked to an outlet yet. Ask your Super Admin."); return; }
  const outletName = String(outlet.name || "Outlet " + sid).split("—")[0].trim();

  if (msg.type === "image" || msg.type === "document") {
    if (settings.billCapture === false) { await sendText(cfg, from, "Bill capture by WhatsApp is switched off. Please add the bill in SalonOS."); return; }
    const media = msg.image ?? msg.document ?? {};
    const mime = String(media.mime_type ?? "").split(";")[0].trim();
    if (!TYPES[mime]) { await sendText(cfg, from, "Please send the bill as a photo (JPG/PNG) or a PDF."); return; }
    const inboxKey = `salonos_whatsapp_inbox_outlet_${sid}`;
    const inbox: Json[] = (await kvGet(inboxKey)) ?? [];
    const id = "WA-" + String(msg.id);
    if (inbox.some((x) => x && x.id === id)) return; // already handled (Meta retry)
    const today = isoOf(istNow());
    if (inbox.filter((x) => x && x.from === from && String(x.receivedAt ?? "").slice(0, 10) === today).length >= BILLS_PER_SENDER_PER_DAY) {
      await sendText(cfg, from, "That's the most bills one number can send in a day. Please add the rest in SalonOS."); return;
    }
    const meta = await graph(cfg, "/" + encodeURIComponent(media.id));
    if (num(meta.file_size) > MAX_BYTES) { await sendText(cfg, from, "That file is too large (max 8 MB). Please send a smaller photo or PDF."); return; }
    const res = await fetch(meta.url, { headers: { Authorization: "Bearer " + cfg.token }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error("media download failed " + res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) { await sendText(cfg, from, "That file is too large (max 8 MB)."); return; }
    const name = (media.filename ? String(media.filename) : `bill-${today}.${TYPES[mime]}`).replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `outlet_${sid}/whatsapp/${Date.now()}-${name}`;
    const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) throw up.error;
    const ai = await readBillWithAI(b64(bytes), mime);
    const draft = {
      id, receivedAt: new Date().toISOString(), from, senderName: String(sender.name ?? ""), caption: String(media.caption ?? "").slice(0, 300),
      file: { name, dataUrl: "sbfile:" + path, type: mime, size: bytes.length },
      ai: ai.data ?? null, aiError: ai.error ?? (ai.notConfigured ? "AI isn't set up" : ""), status: "new",
    };
    await kvAppend(inboxKey, draft);
    const d = ai.data;
    await sendText(cfg, from, d
      ? `✅ Bill received for ${outletName}: ${d.supplierName || "supplier not read"}${d.invoiceNo ? " · " + d.invoiceNo : ""}${d.total ? " · " + inr(num(d.total)) : ""}.\nOpen SalonOS → Vendors → 📥 WhatsApp bills to check and add it.`
      : `✅ Bill received for ${outletName}. It couldn't be read automatically — open SalonOS → Vendors → 📥 WhatsApp bills to enter the details.`);
    return;
  }
  if (msg.type === "text") {
    const t = String(msg.text?.body ?? "").trim().toLowerCase();
    if (/^(today|sales|summary|aaj|report)\b/.test(t) && settings.todayReplies !== false) {
      const keys = [`salonos_daily_sales_collection_data_outlet_${sid}`, `salonos_daily_sales_data_outlet_${sid}`, `salonos_master_employees_outlet_${sid}`, `salonos_attendance_outlet_${sid}`];
      const { data } = await admin.from("kv_store").select("key,value").in("key", keys);
      const kv = new Map<string, Json>();
      for (const r of data ?? []) { try { kv.set(r.key, JSON.parse(r.value)); } catch { /* skip */ } }
      await sendText(cfg, from, todayText(kv, sid, outletName, istNow()));
      return;
    }
  }
  await sendText(cfg, from, HELP);
}

async function processWebhook(cfg: Cfg, body: Json) {
  for (const entry of body.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      for (const msg of ch.value?.messages ?? []) {
        try { await handleMessage(cfg, msg); }
        catch (e) {
          await admin.from("client_errors").insert({ page: "whatsapp webhook", message: "WhatsApp: " + String((e as Error)?.message ?? e).slice(0, 500) });
          const to = waNumber(msg.from);
          if (to) await sendText(cfg, to, "Sorry — something went wrong with that message. Please try again, or add it in SalonOS.");
        }
      }
    }
  }
}

// ── App callers ──
function jwtPayload(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch { return {}; }
}
async function requireSuperAdmin(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: null };
  const user = who?.user;
  if (!user) throw new HttpError(401, "Please sign in again.");
  const { data: me } = await admin.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "Super Admin" || (me.status ?? "Active") === "Inactive") throw new HttpError(403, "Only a Super Admin can manage WhatsApp.");
  const hasTotp = (user.factors ?? []).some((f: { status?: string }) => f.status === "verified");
  if (hasTotp && jwtPayload(jwt).aal !== "aal2") throw new HttpError(403, "Sign in again with your authenticator code first.");
  return user;
}
async function requireKeyAccess(req: Request, key: string) {
  const auth = req.headers.get("Authorization") ?? "";
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!who?.user) throw new HttpError(401, "Please sign in again.");
  const { data: ok, error } = await user.rpc("salonos_key_access", { k: key, want_write: true });
  if (error) throw new HttpError(500, "Could not check access: " + error.message);
  if (!ok) throw new HttpError(403, "You don't have edit access to this outlet's Salary Working.");
}
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");

async function appAction(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  if (action === "notify_salary") {
    const sid = Number(body.outletId);
    if (!sid) throw new HttpError(400, "Missing outlet.");
    await requireKeyAccess(req, `salonos_salary_working_meta_outlet_${sid}`);
    const cfg = await waConfig();
    if (!cfg) throw new HttpError(400, "WhatsApp isn't set up yet — a Super Admin can do it in Master Settings → WhatsApp.");
    const emps: Json[] = (await kvGet(`salonos_master_employees_outlet_${sid}`)) ?? [];
    const month = String(body.month ?? "").slice(0, 40);
    const results: Json[] = [];
    for (const it of (Array.isArray(body.items) ? body.items : []).slice(0, 200)) {
      const e = emps.find((x) => x && String(x.id) === String(it.empId));
      const to = waNumber(e?.mobile);
      if (!e || !to) { results.push({ empId: it.empId, ok: false, error: "no mobile number" }); continue; }
      try {
        await graph(cfg, `/${cfg.phoneNumberId}/messages`, { messaging_product: "whatsapp", to, type: "template",
          template: { name: cfg.templates.salary, language: { code: cfg.templates.lang },
            components: [{ type: "body", parameters: [{ type: "text", text: String(e.name).slice(0, 60) }, { type: "text", text: month }, { type: "text", text: inr(num(it.amount)) }] }] } });
        results.push({ empId: it.empId, ok: true });
      } catch (err) { results.push({ empId: it.empId, ok: false, error: (err as Error).message }); }
    }
    return { results, sent: results.filter((r) => r.ok).length };
  }

  const user = await requireSuperAdmin(req);
  const { data: row } = await admin.from("app_secrets").select("value,meta").eq("name", "whatsapp").maybeSingle();
  const meta = row?.meta ?? {};
  if (action === "status") {
    const cfg = await waConfig();
    return { configured: !!cfg, phoneNumberId: cfg?.phoneNumberId ?? "", displayPhone: meta.displayPhone ?? "", tokenHint: meta.tokenHint ?? "",
      appSecretSet: !!cfg?.appSecret, verifyToken: meta.verifyToken ?? "", webhookUrl: `${SUPABASE_URL}/functions/v1/whatsapp`,
      templates: { salary: cfg?.templates.salary ?? "salonos_salary_paid", lang: cfg?.templates.lang ?? "en" }, updatedBy: meta.updatedByEmail ?? "" };
  }
  if (action === "save") {
    let old: Json = {};
    try { old = JSON.parse(row?.value ?? "{}"); } catch { /* none */ }
    const token = String(body.token ?? "").trim() || old.token || "";
    const appSecret = String(body.appSecret ?? "").trim() || old.appSecret || "";
    const phoneNumberId = String(body.phoneNumberId ?? "").replace(/\D/g, "") || meta.phoneNumberId || "";
    if (!token || !phoneNumberId) throw new HttpError(400, "Paste the access token and the Phone number ID.");
    if (!/^[a-f0-9]{32}$/i.test(appSecret)) throw new HttpError(400, "The App secret is a 32-character code (Meta app → App settings → Basic).");
    const check = await graph({ token, phoneNumberId } as Cfg, `/${phoneNumberId}?fields=display_phone_number,verified_name`);
    const templates = { salary: String(body.templates?.salary ?? meta.templates?.salary ?? "salonos_salary_paid").replace(/[^a-z0-9_]/g, "") || "salonos_salary_paid",
      lang: String(body.templates?.lang ?? meta.templates?.lang ?? "en").replace(/[^A-Za-z_]/g, "") || "en" };
    const { error } = await admin.from("app_secrets").upsert({
      name: "whatsapp", value: JSON.stringify({ token, appSecret }), updated_at: new Date().toISOString(), updated_by: user.id,
      meta: { phoneNumberId, verifyToken: meta.verifyToken || randomToken(), displayPhone: check.display_phone_number ?? "",
        verifiedName: check.verified_name ?? "", tokenHint: "…" + token.slice(-4), templates, updatedByEmail: user.email ?? "" },
    });
    if (error) throw new HttpError(500, error.message);
    return { ok: true, displayPhone: check.display_phone_number ?? "", verifiedName: check.verified_name ?? "" };
  }
  if (action === "remove") {
    await admin.from("app_secrets").delete().eq("name", "whatsapp");
    return { ok: true };
  }
  if (action === "test") {
    const cfg = await waConfig();
    if (!cfg) throw new HttpError(400, "Save the WhatsApp details first.");
    const to = waNumber(body.to);
    if (!to) throw new HttpError(400, "Enter a mobile number.");
    // Meta's ready-made "hello_world" template — business-started chats must use an approved template.
    await graph(cfg, `/${cfg.phoneNumberId}/messages`, { messaging_product: "whatsapp", to, type: "template", template: { name: "hello_world", language: { code: "en_US" } } });
    return { ok: true };
  }
  throw new HttpError(400, "Unknown action.");
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Meta's one-time webhook check.
    if (req.method === "GET") {
      const u = new URL(req.url);
      const cfg = await waConfig();
      const want = cfg?.verifyToken ?? "";
      if (u.searchParams.get("hub.mode") === "subscribe" && want && u.searchParams.get("hub.verify_token") === want) {
        return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const sig = req.headers.get("x-hub-signature-256");
    if (sig) {
      const raw = new Uint8Array(await req.arrayBuffer());
      const cfg = await waConfig();
      if (!cfg || !(await validSignature(cfg.appSecret, raw, sig))) return new Response("Bad signature", { status: 401 });
      const body = JSON.parse(new TextDecoder().decode(raw));
      // Answer Meta at once (it retries slow webhooks); the bill is read in the background.
      const work = processWebhook(cfg, body);
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work); else await work;
      return new Response("ok", { status: 200 });
    }
    return json(await appAction(req));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message || "Something went wrong." }, status);
  }
});
