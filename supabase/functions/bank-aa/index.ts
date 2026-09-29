// SalonOS — bank statements through the Account Aggregator (Supabase Edge Function "bank-aa").
// Any bank and any account type (savings, current, OD/CC …) that is live on India's RBI Account
// Aggregator network. Uses Setu's AA gateway (FIU APIs). SalonOS never sees or stores a bank
// password: linking an account opens the AA's own page, where the account holder approves with
// an OTP. After that, statements for any period inside the approval are fetched on demand.
//
// Secrets (Supabase → Edge Functions → Secrets), added by the owner — never stored in the app:
//   SETU_CLIENT_ID, SETU_CLIENT_SECRET, SETU_PRODUCT_INSTANCE_ID   from Setu's Bridge dashboard
//   SETU_ENV                                                          "sandbox" (default) or "production"
//
// Actions (POST JSON {action, ...}); every call checks the caller's own access to that outlet's
// Bank Statement with the same database rule as normal saves (salonos_key_access):
//   status                                   → is Setu configured?
//   list    {outlet_id}                      → linked accounts (pending ones re-checked)
//   link    {outlet_id, label, mobile, redirect_url} → creates an approval request, returns {url}
//   refresh {id}                             → re-reads one link's approval status
//   fetch   {id, from, to}  (YYYY-MM-DD)     → transactions for that period, ready to import
//   unlink  {id}                             → revokes the approval
// Deploy with "Verify JWT" ON.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const SETU_ID = Deno.env.get("SETU_CLIENT_ID") ?? "";
const SETU_SECRET = Deno.env.get("SETU_CLIENT_SECRET") ?? "";
const SETU_PI = Deno.env.get("SETU_PRODUCT_INSTANCE_ID") ?? "";
const PROD = (Deno.env.get("SETU_ENV") ?? "sandbox").toLowerCase() === "production";
const SETU_BASE = PROD ? "https://fiu.setu.co" : "https://fiu-sandbox.setu.co";
const configured = () => !!(SETU_ID && SETU_SECRET && SETU_PI);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

// ── Setu auth: newer accounts use a Bearer token from Setu's login API; older ones take the
// client id/secret as headers. Both are sent, so either kind of credentials works. ──
let token: { value: string; until: number } | null = null;
async function setuHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": SETU_ID,
    "x-client-secret": SETU_SECRET,
    "x-product-instance-id": SETU_PI,
  };
  if (!token || Date.now() > token.until) {
    try {
      const r = await fetch("https://orgservice-prod.setu.co/v1/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", client: "bridge" },
        body: JSON.stringify({ clientID: SETU_ID, grant_type: "client_credentials", secret: SETU_SECRET }),
      });
      const b = await r.json().catch(() => ({}));
      const t = b.access_token ?? b.data?.access_token ?? b.data?.token;
      token = t ? { value: t, until: Date.now() + 25 * 60 * 1000 } : null;
    } catch { token = null; }
  }
  if (token) h["Authorization"] = "Bearer " + token.value;
  return h;
}
async function setu(method: string, path: string, body?: unknown) {
  const r = await fetch(SETU_BASE + path, { method, headers: await setuHeaders(), body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) {
    const msg = data?.errorMsg ?? data?.message ?? data?.error?.message ?? data?.error ?? text ?? r.statusText;
    throw new HttpError(r.status >= 500 ? 502 : 400, "Account Aggregator: " + String(msg).slice(0, 300));
  }
  return data;
}

// ── Caller checks: signed in, and allowed on this outlet's Bank Statement (read or edit). ──
async function requireAccess(req: Request, outletId: number, write: boolean) {
  const auth = req.headers.get("Authorization") ?? "";
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!who?.user) throw new HttpError(401, "Please sign in again.");
  const { data: ok, error } = await user.rpc("salonos_key_access", { k: "salonos_bank_statement_rows_outlet_" + outletId, want_write: write });
  if (error) throw new HttpError(500, "Could not check access: " + error.message);
  if (!ok) throw new HttpError(403, write ? "You don't have edit access to this outlet's Bank Statement." : "You don't have access to this outlet.");
  return who.user;
}
async function linkRow(id: string) {
  const { data, error } = await admin.from("bank_aa_links").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "That linked account no longer exists.");
  return data;
}

// ── Setu → app shapes ──
const pad = (n: number) => String(n).padStart(2, "0");
function istDate(ts?: string) { // "DD/MM/YYYY" in India time, as the Bank Statement tab stores dates
  if (!ts) return "";
  const d = new Date(new Date(ts).getTime() + 5.5 * 3600e3);
  return isNaN(d.getTime()) ? "" : pad(d.getUTCDate()) + "/" + pad(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
}
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const arr = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
function accountsFromConsent(c: any) {
  const list = arr(c?.detail?.accounts ?? c?.accountsLinked ?? c?.accounts);
  return list.map((a: any) => ({ masked: a.maskedAccNumber ?? a.maskedAccountNumber ?? "", type: a.accType ?? a.fiType ?? "", fip: a.fipId ?? a.fipID ?? "" }));
}
async function refreshLink(row: any) {
  const c = await setu("GET", "/consents/" + encodeURIComponent(row.consent_id) + "?expanded=true");
  const status = String(c?.status ?? row.status).toUpperCase();
  const accounts = accountsFromConsent(c);
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (accounts.length) patch.accounts = accounts;
  await admin.from("bank_aa_links").update(patch).eq("id", row.id);
  return { ...row, ...patch };
}
const publicRow = (r: any) => ({
  id: r.id, label: r.label, mobile_last4: r.mobile_last4, status: r.status, accounts: r.accounts ?? [],
  data_from: r.data_from, data_to: r.data_to, last_fetch_at: r.last_fetch_at, created_at: r.created_at,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (action === "status") return json({ configured: configured(), env: PROD ? "production" : "sandbox" });
    if (!configured()) return json({ notConfigured: true, error: "Bank fetch isn't set up yet — a Super Admin needs to add the Setu keys in Supabase." }, 200);

    if (action === "list") {
      const outletId = Number(body.outlet_id);
      await requireAccess(req, outletId, false);
      const { data, error } = await admin.from("bank_aa_links").select("*").eq("outlet_id", outletId).order("created_at");
      if (error) throw new HttpError(500, error.message);
      const rows = [];
      for (const r of data ?? []) rows.push(r.status === "PENDING" ? await refreshLink(r).catch(() => r) : r);
      return json({ links: rows.map(publicRow) });
    }

    if (action === "link") {
      const outletId = Number(body.outlet_id);
      const user = await requireAccess(req, outletId, true);
      const mobile = String(body.mobile ?? "").replace(/\D/g, "").slice(-10);
      if (mobile.length !== 10) throw new HttpError(400, "Enter the 10-digit mobile number registered with the bank.");
      const label = String(body.label ?? "").trim().slice(0, 80) || "Bank account";
      // One approval covers statements from 2 years back up to 1 year ahead, so later fetches of
      // any period need no new OTP. If the AA refuses a future end date, fall back to today.
      const now = new Date();
      const from = new Date(now.getTime() - 2 * 365 * 86400e3).toISOString();
      const ahead = new Date(now.getTime() + 365 * 86400e3).toISOString();
      const req1 = (to: string) => ({
        consentDuration: { unit: "YEAR", value: "1" },
        vua: mobile,
        dataRange: { from, to },
        context: [],
        redirectUrl: typeof body.redirect_url === "string" ? body.redirect_url : undefined,
        additionalParams: { tags: ["SalonOS", "outlet_" + outletId] },
      });
      let c: any, to = ahead;
      try { c = await setu("POST", "/consents", req1(ahead)); }
      catch (e) {
        if (!(e instanceof HttpError) || e.status !== 400) throw e;
        to = now.toISOString();
        c = await setu("POST", "/consents", req1(to));
      }
      if (!c?.id || !c?.url) throw new HttpError(502, "Account Aggregator did not return an approval link.");
      const { data: row, error } = await admin.from("bank_aa_links").insert({
        outlet_id: outletId, label, mobile_last4: mobile.slice(-4), consent_id: c.id, status: String(c.status ?? "PENDING").toUpperCase(),
        data_from: from, data_to: to, created_by: user.id,
      }).select("*").single();
      if (error) throw new HttpError(500, error.message);
      return json({ link: publicRow(row), url: c.url });
    }

    const row = await linkRow(String(body.id ?? ""));

    if (action === "refresh") {
      await requireAccess(req, row.outlet_id, false);
      return json({ link: publicRow(await refreshLink(row)) });
    }

    if (action === "unlink") {
      await requireAccess(req, row.outlet_id, true);
      try { await setu("POST", "/v2/consents/" + encodeURIComponent(row.consent_id) + "/revoke", {}); } catch { /* already gone at the AA */ }
      await admin.from("bank_aa_links").update({ status: "REVOKED", updated_at: new Date().toISOString() }).eq("id", row.id);
      return json({ ok: true });
    }

    if (action === "fetch") {
      await requireAccess(req, row.outlet_id, true);
      const re = /^\d{4}-\d{2}-\d{2}$/;
      if (!re.test(String(body.from)) || !re.test(String(body.to)) || body.from > body.to) throw new HttpError(400, "Choose a valid From and To date.");
      const live = row.status === "ACTIVE" ? row : await refreshLink(row);
      if (live.status !== "ACTIVE") {
        throw new HttpError(400, live.status === "PENDING"
          ? "This account hasn't been approved yet — finish the approval (OTP) first."
          : "This account's approval is " + live.status.toLowerCase() + " — link it again.");
      }
      const from = new Date(body.from + "T00:00:00+05:30"), to = new Date(body.to + "T23:59:59+05:30");
      const clampTo = new Date(Math.min(to.getTime(), Date.now()));
      if (live.data_from && from < new Date(live.data_from)) throw new HttpError(400, "That period starts before this account's approval covers — pick a later From date.");
      if (live.data_to && clampTo > new Date(live.data_to)) throw new HttpError(400, "This account's approval ends on " + istDate(live.data_to) + " — link it again to fetch later periods.");

      const session = await setu("POST", "/sessions", { consentId: live.consent_id, dataRange: { from: from.toISOString(), to: clampTo.toISOString() }, format: "json" });
      if (!session?.id) throw new HttpError(502, "Account Aggregator did not start the fetch.");
      let s: any = session;
      const deadline = Date.now() + 45_000; // banks usually answer within a few seconds
      while (!["COMPLETED", "PARTIAL", "FAILED", "EXPIRED"].includes(String(s?.status).toUpperCase()) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        s = await setu("GET", "/sessions/" + encodeURIComponent(session.id));
      }
      const st = String(s?.status ?? "").toUpperCase();
      if (st === "FAILED" || st === "EXPIRED") throw new HttpError(502, "The bank did not send the statement (" + st.toLowerCase() + "). Try again in a few minutes.");
      if (st !== "COMPLETED" && st !== "PARTIAL") throw new HttpError(504, "The bank is taking long to respond — try again in a minute.");

      const transactions: any[] = [], accounts: any[] = [], notReady: string[] = [];
      for (const fip of arr(s.fips)) {
        for (const acc of arr(fip.accounts)) {
          const a = acc?.data?.account;
          const masked = acc?.maskedAccNumber ?? a?.maskedAccNumber ?? "";
          if (!a) { notReady.push(masked || "an account"); continue; }
          const txns = arr(a?.transactions?.transaction);
          accounts.push({ masked, type: a?.summary?.type ?? a?.type ?? "", fip: fip.fipID ?? fip.fipId ?? "", count: txns.length, balance: a?.summary?.currentBalance ?? null });
          for (const t of txns) {
            const amt = num(t.amount), isDebit = String(t.type).toUpperCase() === "DEBIT";
            transactions.push({
              transactionDate: istDate(t.transactionTimestamp ?? t.valueDate),
              valueDate: istDate(t.valueDate ?? t.transactionTimestamp),
              description: String(t.narration ?? "").trim(),
              refNo: String(t.reference ?? t.txnId ?? "").trim(),
              debit: isDebit ? amt : 0,
              credit: isDebit ? 0 : amt,
              closingBalance: num(t.currentBalance),
              txnId: String(t.txnId ?? ""),
              account: masked,
              mode: String(t.mode ?? ""),
              ts: t.transactionTimestamp ?? t.valueDate ?? "",
            });
          }
        }
      }
      transactions.sort((x, y) => String(x.ts).localeCompare(String(y.ts)));
      await admin.from("bank_aa_links").update({ last_fetch_at: new Date().toISOString(), accounts, updated_at: new Date().toISOString() }).eq("id", row.id);
      return json({ status: st, transactions: transactions.map(({ ts, ...t }) => t), accounts, notReady });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message || "Something went wrong." }, status);
  }
});
