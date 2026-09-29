// SalonOS — AI (Claude) API key settings (Supabase Edge Function "ai-settings").
// Master Settings → AI Assistant. The key is stored server-side in public.app_secrets (service
// role only) and is never returned to any browser — the app only sees "configured", the model,
// and the key's last 4 characters. Only an active Super Admin (at two-step level when their
// account has an authenticator) can save, test or remove it.
//
// Actions (POST JSON {action, ...}):
//   status                 → { configured, model, keyHint, updatedAt, updatedBy }
//   save   {key, model}    → checks the key with a tiny Claude request, then stores it
//   test                   → a tiny Claude request with the stored key
//   remove                 → deletes the stored key
// Deploy with "Verify JWT" ON.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const SECRET = "anthropic_api_key";
const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"];
const DEFAULT_MODEL = "claude-opus-5-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

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
  if (!me || me.role !== "Super Admin" || (me.status ?? "Active") === "Inactive") throw new HttpError(403, "Only a Super Admin can manage the AI key.");
  const hasTotp = (user.factors ?? []).some((f: { status?: string }) => f.status === "verified");
  if (hasTotp && jwtPayload(jwt).aal !== "aal2") throw new HttpError(403, "Sign in again with your authenticator code first.");
  return user;
}

// One small request to confirm the key and model work. Claude Opus 5.5 / Sonnet 5.5 get the
// server-side refusal fallback; the reply is checked for a refusal before its text is read.
async function tryKey(apiKey: string, model: string) {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  const params: Record<string, unknown> = {
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: "Reply with exactly: SalonOS connected" }],
  };
  if (model !== "claude-haiku-4-5") {
    params.output_config = { effort: "low" };
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  try {
    // deno-lint-ignore no-explicit-any
    const res: any = model === "claude-haiku-4-5"
      // deno-lint-ignore no-explicit-any
      ? await client.messages.create(params as any)
      // deno-lint-ignore no-explicit-any
      : await client.beta.messages.create(params as any);
    if (res.stop_reason === "refusal") return { ok: true, model: res.model, reply: "(the model declined the test prompt, but the key works)" };
    // deno-lint-ignore no-explicit-any
    const text = (res.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
    return { ok: true, model: res.model, reply: text.slice(0, 200) };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(400, "Anthropic rejected this API key — check it was copied completely.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new HttpError(400, "This API key isn't allowed to use " + model + ".");
    if (e instanceof Anthropic.NotFoundError) throw new HttpError(400, "Model " + model + " isn't available to this key.");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "Anthropic says too many requests or no credit left on this key — check your plan/billing at console.anthropic.com.");
    if (e instanceof Anthropic.APIConnectionError) throw new HttpError(502, "Could not reach Anthropic — try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, "Anthropic error: " + e.message);
    throw e;
  }
}
const hintOf = (key: string) => "…" + key.slice(-4);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const user = await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "status") {
      const { data } = await admin.from("app_secrets").select("meta,updated_at").eq("name", SECRET).maybeSingle();
      return json({ configured: !!data, models: MODELS, model: data?.meta?.model ?? DEFAULT_MODEL, keyHint: data?.meta?.keyHint ?? "", updatedAt: data?.updated_at ?? null, updatedBy: data?.meta?.updatedByEmail ?? "" });
    }

    if (action === "save") {
      const key = String(body.key ?? "").trim();
      const model = MODELS.includes(String(body.model)) ? String(body.model) : DEFAULT_MODEL;
      if (!key) {
        // Only the model changed — keep the stored key.
        const { data } = await admin.from("app_secrets").select("meta").eq("name", SECRET).maybeSingle();
        if (!data) throw new HttpError(400, "Paste the API key first.");
        await admin.from("app_secrets").update({ meta: { ...data.meta, model }, updated_at: new Date().toISOString(), updated_by: user.id }).eq("name", SECRET);
        return json({ ok: true, model });
      }
      if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) throw new HttpError(400, "That doesn't look like an Anthropic API key (it starts with sk-ant-).");
      const check = await tryKey(key, model);
      const { error } = await admin.from("app_secrets").upsert({
        name: SECRET, value: key, updated_at: new Date().toISOString(), updated_by: user.id,
        meta: { model, keyHint: hintOf(key), updatedByEmail: user.email ?? "" },
      });
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true, model, keyHint: hintOf(key), reply: check.reply });
    }

    if (action === "test") {
      const { data } = await admin.from("app_secrets").select("value,meta").eq("name", SECRET).maybeSingle();
      if (!data) throw new HttpError(400, "No AI key saved yet.");
      return json(await tryKey(data.value, data.meta?.model ?? DEFAULT_MODEL));
    }

    if (action === "remove") {
      await admin.from("app_secrets").delete().eq("name", SECRET);
      return json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message || "Something went wrong." }, status);
  }
});
