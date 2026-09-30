// SalonOS — email sending settings and on-demand emails (Supabase Edge Function "email"), via Resend.
//
// Actions (POST JSON {action, ...} with the user's login):
//   status | save {apiKey?, from?} | remove | test {to}         (Super Admin, aal2 when two-step login is on)
//   send_pack {outletId, month, fileName, pdf (base64), toSelf}  (anyone who can view that outlet's Daily Sales):
//     emails a month-end pack PDF built in the browser (Owner Insights) to the "Automatic reports"
//     recipients (kv salonos_secret_report_settings.emails) and, if toSelf, the sender — never to an
//     address typed in the app, so this can't be used to send mail anywhere else.
// The Resend key lives in public.app_secrets row "email" (value = key; meta = {from, keyHint, updatedByEmail}),
// service role only, never returned to a browser. salonos-reports and automation use it too.
// Deploy with "Verify JWT" ON.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const DEFAULT_FROM = "SalonOS Reports <onboarding@resend.dev>";
const MAX_PDF_B64 = 14_000_000; // ≈10 MB file

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
// deno-lint-ignore no-explicit-any
type Json = any;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// "Name <addr@domain>" or "addr@domain" → valid? (Resend's from format)
export function validFrom(s: string) {
  const m = /^\s*(?:([^<>"]{1,60})\s*<)?([^\s<>@]+@[^\s<>@]+\.[a-z]{2,})>?\s*$/i.exec(s);
  return !!m && (!!m[1] === s.includes("<"));
}

async function creds() {
  const env = Deno.env.get("RESEND_API_KEY");
  if (env) return { key: env, from: Deno.env.get("REPORT_FROM") || DEFAULT_FROM, fromEnv: true };
  const { data } = await admin.from("app_secrets").select("value,meta").eq("name", "email").maybeSingle();
  return data?.value ? { key: String(data.value), from: String(data.meta?.from || DEFAULT_FROM), fromEnv: false } : null;
}

async function resend(key: string, payload: Json) {
  let r: Response;
  try {
    r = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(60_000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch { throw new HttpError(502, "Could not reach Resend — try again in a minute."); }
  const text = await r.text();
  let data: Json = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) {
    const msg = String(data?.message ?? data?.error ?? text).slice(0, 300);
    if (r.status === 401 || r.status === 403) {
      // Unverified domain: Resend only allows sending to the account owner's own address from onboarding@resend.dev.
      if (/verify a domain|testing emails|own email/i.test(msg)) throw new HttpError(400, "Resend: until your domain is verified, it only sends to your own Resend login email. (" + msg + ")");
      throw new HttpError(400, "Resend rejected this (" + msg + ").");
    }
    if (r.status === 422) throw new HttpError(400, "Resend: " + msg);
    if (r.status === 429) throw new HttpError(429, "Resend: too many emails right now or daily limit reached (" + msg + ").");
    throw new HttpError(502, "Resend error " + r.status + ": " + msg);
  }
  return data;
}

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
  if (!me || me.role !== "Super Admin" || (me.status ?? "Active") === "Inactive") throw new HttpError(403, "Only a Super Admin can manage email.");
  const hasTotp = (user.factors ?? []).some((f: { status?: string }) => f.status === "verified");
  if (hasTotp && jwtPayload(jwt).aal !== "aal2") throw new HttpError(403, "Sign in again with your authenticator code first.");
  return user;
}

async function sendPack(req: Request, body: Json) {
  const sid = Number(body.outletId);
  if (!sid) throw new HttpError(400, "Missing outlet.");
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!who?.user) throw new HttpError(401, "Please sign in again.");
  const { data: ok, error } = await userClient.rpc("salonos_key_access", { k: `salonos_daily_sales_collection_data_outlet_${sid}`, want_write: false });
  if (error) throw new HttpError(500, "Could not check access: " + error.message);
  if (!ok) throw new HttpError(403, "You don't have access to this outlet.");
  const pdf = String(body.pdf ?? "");
  if (!pdf || pdf.length > MAX_PDF_B64 || !/^[A-Za-z0-9+/=]+$/.test(pdf.slice(0, 200))) throw new HttpError(400, "The PDF is missing or too large.");
  const em = await creds();
  if (!em) throw new HttpError(400, "Email isn't set up yet — a Super Admin can connect it in Master Settings → Email.");
  const { data: rs } = await admin.from("kv_store").select("value").eq("key", "salonos_secret_report_settings").maybeSingle();
  let settings: Json = {};
  try { settings = JSON.parse(rs?.value ?? "{}") ?? {}; } catch { /* none */ }
  const to = new Set<string>((settings.emails ?? []).filter((e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)));
  if (body.toSelf && who.user.email) to.add(who.user.email);
  if (!to.size) throw new HttpError(400, "No recipients — add emails under Master Settings → Automatic reports, or tick \"send to me\".");
  const { data: salonsRow } = await admin.from("kv_store").select("value").eq("key", "salonos_salons").maybeSingle();
  let outlet = "Outlet " + sid;
  try { outlet = String((JSON.parse(salonsRow?.value ?? "[]") as Json[]).find((s) => Number(s.id) === sid)?.name ?? outlet); } catch { /* keep */ }
  const month = String(body.month ?? "").slice(0, 40);
  const fileName = String(body.fileName ?? "month_end_pack.pdf").replace(/[^\w.\-]+/g, "_").slice(-100);
  await resend(em.key, {
    from: em.from, to: [...to], subject: `SalonOS · Month-end pack — ${outlet} — ${month}`,
    html: `<div style="font-family:Arial,sans-serif"><h2 style="color:#14335e;margin:0 0 6px">Month-end pack — ${esc(month)}</h2>
<p style="color:#5e6a82;margin:0 0 12px">${esc(outlet)}</p><p>The PDF is attached: summary, P&amp;L, salary, staff scorecard and vendor bills outstanding.</p>
<p style="color:#5e6a82">Sent from SalonOS by ${esc(who.user.email ?? "a SalonOS user")}.</p></div>`,
    attachments: [{ filename: fileName.endsWith(".pdf") ? fileName : fileName + ".pdf", content: pdf }],
  });
  return { ok: true, sentTo: [...to] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (action === "send_pack") return json(await sendPack(req, body));

    const user = await requireSuperAdmin(req);
    if (action === "status") {
      const em = await creds();
      const { data } = await admin.from("app_secrets").select("meta,updated_at").eq("name", "email").maybeSingle();
      return json({ configured: !!em, from: em?.from ?? DEFAULT_FROM, fromEnv: !!em?.fromEnv, keyHint: data?.meta?.keyHint ?? "",
        updatedAt: data?.updated_at ?? null, updatedBy: data?.meta?.updatedByEmail ?? "", defaultFrom: DEFAULT_FROM });
    }
    if (action === "save") {
      const { data: row } = await admin.from("app_secrets").select("value,meta").eq("name", "email").maybeSingle();
      const key = String(body.apiKey ?? "").trim() || String(row?.value ?? "");
      const from = String(body.from ?? "").trim() || String(row?.meta?.from ?? "") || DEFAULT_FROM;
      if (!/^re_[A-Za-z0-9_]{10,}$/.test(key)) throw new HttpError(400, "That doesn't look like a Resend API key (it starts with re_).");
      if (!validFrom(from)) throw new HttpError(400, "The From address should look like: SalonOS Reports <reports@digitalca.co.in>");
      // Check the key: listing domains works with a full-access key; a sending-only key answers
      // "restricted_api_key", which still means the key is real.
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (!r) throw new HttpError(502, "Could not reach Resend — try again in a minute.");
      const t = await r.text();
      if (!r.ok && !/restricted_api_key/.test(t)) throw new HttpError(400, "Resend rejected this API key — check it was copied completely.");
      let domains: string[] = [];
      try { domains = (JSON.parse(t).data ?? []).map((d: Json) => `${d.name} (${d.status})`); } catch { /* restricted key */ }
      const { error } = await admin.from("app_secrets").upsert({
        name: "email", value: key, updated_at: new Date().toISOString(), updated_by: user.id,
        meta: { from, keyHint: "…" + key.slice(-4), updatedByEmail: user.email ?? "", domains },
      });
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true, from, domains });
    }
    if (action === "remove") {
      await admin.from("app_secrets").delete().eq("name", "email");
      return json({ ok: true });
    }
    if (action === "test") {
      const em = await creds();
      if (!em) throw new HttpError(400, "Save the Resend API key first.");
      const to = String(body.to ?? "").trim() || user.email || "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new HttpError(400, "Enter an email address.");
      await resend(em.key, { from: em.from, to: [to], subject: "SalonOS · Test email",
        html: `<div style="font-family:Arial,sans-serif"><h2 style="color:#14335e">Email is working ✓</h2><p>SalonOS can now send your reports and month-end packs by email.</p></div>` });
      return json({ ok: true, to });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message || "Something went wrong." }, status);
  }
});
