// SalonOS — AI API key settings (Supabase Edge Function "ai-settings"), Master Settings → AI Assistant.
// Keys for Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google AI Studio) and Grok (xAI) are stored
// server-side in public.app_secrets (service role only) and never returned to any browser — the app
// only sees "configured", the model and the key's last 4 characters. Which provider SalonOS uses
// first, and whether it falls back to the others, is the "ai_settings" row. Only an active Super
// Admin (at two-step level when their account has an authenticator) can change anything here.
//
// Actions (POST JSON {action, ...}):
//   status                                → { providers: {p: {configured, model, keyHint, updatedAt, updatedBy}}, models, primary, fallback }
//   save   {provider, key, model}         → checks the key with a tiny request, then stores it (blank key = change model only)
//   test   {provider}                     → a tiny request with the stored key
//   remove {provider}                     → deletes that key
//   prefs  {primary, fallback}            → which provider is used first, and whether to try the others on failure
// Deploy with "Verify JWT" ON.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
type Provider = "anthropic" | "openai" | "gemini" | "xai";
const PROVIDERS: Provider[] = ["anthropic", "openai", "gemini", "xai"];
const SECRET: Record<Provider, string> = { anthropic: "anthropic_api_key", openai: "openai_api_key", gemini: "gemini_api_key", xai: "xai_api_key" };
// Suggested models (the app also lets a Super Admin type any other model name the provider offers).
const MODELS: Record<Provider, string[]> = {
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"],
  openai: ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"],
  gemini: ["gemini-3.8-flash", "gemini-3.1-pro-preview"],
  xai: ["grok-4.7"],
};
const LABEL: Record<Provider, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI (ChatGPT)", gemini: "Google AI Studio (Gemini)", xai: "xAI (Grok)" };
const MODEL_RE = /^[A-Za-z0-9._:\/-]{2,80}$/;

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
  if (!me || me.role !== "Super Admin" || (me.status ?? "Active") === "Inactive") throw new HttpError(403, "Only a Super Admin can manage the AI keys.");
  const hasTotp = (user.factors ?? []).some((f: { status?: string }) => f.status === "verified");
  if (hasTotp && jwtPayload(jwt).aal !== "aal2") throw new HttpError(403, "Sign in again with your authenticator code first.");
  return user;
}

// Quick sanity check of what was pasted, before spending a request on it.
function checkKeyShape(p: Provider, key: string) {
  const ok = p === "anthropic" ? /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)
    : p === "openai" ? /^sk-[A-Za-z0-9_-]{20,}$/.test(key)
    : p === "xai" ? /^xai-[A-Za-z0-9_-]{20,}$/.test(key)
    : /^[A-Za-z0-9_-]{30,}$/.test(key);
  const hint = p === "anthropic" ? "starts with sk-ant-" : p === "openai" ? "starts with sk-" : p === "xai" ? "starts with xai-" : "is a long code from aistudio.google.com → Get API key";
  if (!ok) throw new HttpError(400, "That doesn't look like a " + LABEL[p] + " API key (it " + hint + ").");
}

async function post(url: string, headers: Record<string, string>, body: unknown, who: string) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  } catch { throw new HttpError(502, "Could not reach " + who + " — try again in a minute."); }
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = String(data?.error?.message ?? data?.error ?? text).slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new HttpError(400, who + " rejected this API key — check it was copied completely. (" + msg + ")");
    if (res.status === 404) throw new HttpError(400, "That model isn't available to this key. (" + msg + ")");
    if (res.status === 429) throw new HttpError(429, who + " says too many requests or no credit left on this key — check billing on their site. (" + msg + ")");
    throw new HttpError(502, who + " error " + res.status + ": " + msg);
  }
  return data;
}

// One small request to confirm the key and model work.
async function tryKey(p: Provider, apiKey: string, model: string) {
  const prompt = "Reply with exactly: SalonOS connected";
  if (p === "anthropic") {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
    const params: Record<string, unknown> = { model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] };
    const haiku = model.startsWith("claude-haiku");
    if (!haiku) {
      params.output_config = { effort: "low" };
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }
    try {
      // deno-lint-ignore no-explicit-any
      const res: any = haiku ? await client.messages.create(params as any) : await client.beta.messages.create(params as any);
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
  if (p === "openai") {
    const r = await post("https://api.openai.com/v1/responses", { Authorization: "Bearer " + apiKey }, { model, input: prompt, max_output_tokens: 200 }, "OpenAI");
    // deno-lint-ignore no-explicit-any
    const text = (r.output ?? []).flatMap((it: any) => it.content ?? []).filter((x: any) => x.type === "output_text").map((x: any) => x.text).join(" ").trim();
    return { ok: true, model: r.model ?? model, reply: text.slice(0, 200) };
  }
  if (p === "xai") {
    const r = await post("https://api.x.ai/v1/chat/completions", { Authorization: "Bearer " + apiKey }, { model, messages: [{ role: "user", content: prompt }], max_tokens: 200 }, "xAI");
    return { ok: true, model: r.model ?? model, reply: String(r.choices?.[0]?.message?.content ?? "").trim().slice(0, 200) };
  }
  const r = await post("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", { "x-goog-api-key": apiKey },
    { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200 } }, "Google AI Studio");
  // deno-lint-ignore no-explicit-any
  const text = (r.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? "").join(" ").trim();
  return { ok: true, model: r.modelVersion ?? model, reply: text.slice(0, 200) };
}
const hintOf = (key: string) => "…" + key.slice(-4);
const providerOf = (v: unknown): Provider => {
  const p = String(v ?? "anthropic") as Provider; // old app versions send no provider = Claude
  if (!PROVIDERS.includes(p)) throw new HttpError(400, "Unknown AI provider.");
  return p;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const user = await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "status") {
      const { data } = await admin.from("app_secrets").select("name,meta,updated_at").in("name", [...Object.values(SECRET), "ai_settings"]);
      const rows = data ?? [];
      const providers = Object.fromEntries(PROVIDERS.map((p) => {
        const r = rows.find((x) => x.name === SECRET[p]);
        return [p, { configured: !!r, model: r?.meta?.model ?? MODELS[p][0], keyHint: r?.meta?.keyHint ?? "", updatedAt: r?.updated_at ?? null, updatedBy: r?.meta?.updatedByEmail ?? "" }];
      }));
      const pref = rows.find((x) => x.name === "ai_settings")?.meta ?? {};
      const firstSaved = PROVIDERS.find((p) => providers[p].configured) ?? null;
      const primary = PROVIDERS.includes(pref.primary) && providers[pref.primary].configured ? pref.primary : firstSaved;
      // Back-compat fields for older app versions (Claude only).
      const a = providers.anthropic;
      return json({ providers, models: MODELS, primary, fallback: pref.fallback !== false,
        configured: a.configured, model: a.model, keyHint: a.keyHint, updatedAt: a.updatedAt, updatedBy: a.updatedBy });
    }

    if (action === "save") {
      const p = providerOf(body.provider);
      const key = String(body.key ?? "").trim();
      const model = String(body.model ?? "").trim() || MODELS[p][0];
      if (!MODEL_RE.test(model)) throw new HttpError(400, "That model name doesn't look right.");
      if (!key) {
        // Only the model changed — check it with the stored key, then keep the key.
        const { data } = await admin.from("app_secrets").select("value,meta").eq("name", SECRET[p]).maybeSingle();
        if (!data) throw new HttpError(400, "Paste the API key first.");
        const check = await tryKey(p, data.value, model);
        await admin.from("app_secrets").update({ meta: { ...data.meta, model }, updated_at: new Date().toISOString(), updated_by: user.id }).eq("name", SECRET[p]);
        return json({ ok: true, model, reply: check.reply });
      }
      checkKeyShape(p, key);
      const check = await tryKey(p, key, model);
      const { error } = await admin.from("app_secrets").upsert({
        name: SECRET[p], value: key, updated_at: new Date().toISOString(), updated_by: user.id,
        meta: { model, keyHint: hintOf(key), updatedByEmail: user.email ?? "" },
      });
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true, model, keyHint: hintOf(key), reply: check.reply });
    }

    if (action === "test") {
      const p = providerOf(body.provider);
      const { data } = await admin.from("app_secrets").select("value,meta").eq("name", SECRET[p]).maybeSingle();
      if (!data) throw new HttpError(400, "No " + LABEL[p] + " key saved yet.");
      return json(await tryKey(p, data.value, data.meta?.model ?? MODELS[p][0]));
    }

    if (action === "remove") {
      const p = providerOf(body.provider);
      await admin.from("app_secrets").delete().eq("name", SECRET[p]);
      return json({ ok: true });
    }

    if (action === "prefs") {
      const primary = providerOf(body.primary);
      const { error } = await admin.from("app_secrets").upsert({
        name: "ai_settings", value: "-", updated_at: new Date().toISOString(), updated_by: user.id,
        meta: { primary, fallback: body.fallback !== false, updatedByEmail: user.email ?? "" },
      });
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true, primary, fallback: body.fallback !== false });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message || "Something went wrong." }, status);
  }
});
