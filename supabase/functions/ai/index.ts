// SalonOS — AI features (Supabase Edge Function "ai"), using the AI keys a Super Admin saved in
// Master Settings → AI Assistant (public.app_secrets, read here with the service role; never sent
// to a browser). Four providers: Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google AI Studio)
// and Grok (xAI). The Super Admin picks which one is used first; with "fallback" on, a provider
// that fails (bad/expired key, no credit, busy, can't read that file type) hands over to the next
// saved one.
//
// Actions (POST JSON {action, ...}) — any signed-in, active SalonOS user. The app only ever sends
// data the signed-in person can already see in SalonOS; nothing is stored here.
//   status                                   → { configured, providers[] }
//   read_bill {file (base64), mediaType, categories[]}
//                                            → the bill's fields as structured JSON
//   tag_bank {rows:[{i,d,dr,cr}], natures[], vendors[], employees[]}
//                                            → { items:[{i, nature, vendor, confidence}] }
//   explain_pnl {outlet, month, prevMonth, lines:[{name, section, amt, prev}], notes}
//                                            → { headline, points[], watch[] }
//   ask {question, context (text), outlet}   → { answer, basis }
// Every answer also carries { model, provider }. Deploy with "Verify JWT" ON.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const ROLES = ["Super Admin", "Salon Owner", "Owner", "Salon Manager", "ASM", "Data Entry User", "Accountant", "Reviewer"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function requireUser(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: null };
  if (!who?.user) throw new HttpError(401, "Please sign in again.");
  const { data: me } = await admin.from("profiles").select("role,status").eq("id", who.user.id).maybeSingle();
  if (!me || !ROLES.includes(me.role) || (me.status ?? "Active") === "Inactive") throw new HttpError(403, "Your account can't use AI features.");
  return who.user;
}

// ── Providers ──
type Provider = "anthropic" | "openai" | "gemini" | "xai";
type Cfg = { provider: Provider; key: string; model: string };
const PROVIDERS: Provider[] = ["anthropic", "openai", "gemini", "xai"];
const SECRET_NAME: Record<Provider, string> = { anthropic: "anthropic_api_key", openai: "openai_api_key", gemini: "gemini_api_key", xai: "xai_api_key" };
const DEFAULT_MODEL: Record<Provider, string> = { anthropic: "claude-opus-5-5", openai: "gpt-6-astra", gemini: "gemini-3.8-flash", xai: "grok-4.7" };
const LABEL: Record<Provider, string> = { anthropic: "Claude", openai: "ChatGPT", gemini: "Gemini", xai: "Grok" };

// The saved keys, in the order they should be tried: the chosen one first, then (if fallback is
// on) the others that have a key.
async function aiConfig(): Promise<Cfg[]> {
  const { data } = await admin.from("app_secrets").select("name,value,meta").in("name", [...Object.values(SECRET_NAME), "ai_settings"]);
  const rows = data ?? [];
  const pref = rows.find((r) => r.name === "ai_settings")?.meta ?? {};
  const saved: Cfg[] = PROVIDERS.flatMap((p) => {
    const r = rows.find((x) => x.name === SECRET_NAME[p]);
    return r ? [{ provider: p, key: r.value as string, model: (r.meta?.model as string) || DEFAULT_MODEL[p] }] : [];
  });
  const primary = PROVIDERS.includes(pref.primary) ? pref.primary : saved[0]?.provider;
  const first = saved.filter((c) => c.provider === primary);
  const rest = saved.filter((c) => c.provider !== primary);
  return pref.fallback === false ? (first.length ? first : rest.slice(0, 1)) : [...first, ...rest];
}

// Parts are provider-neutral: {type:'text', text} or {type:'file', mediaType, data (base64)}.
type Part = { type: "text"; text: string } | { type: "file"; mediaType: string; data: string };
type Opts = { maxTokens?: number; effort?: string };
// deno-lint-ignore no-explicit-any
type Json = any;
// Why a provider was skipped: "unsupported" (can't read that file type) or a failure worth trying
// the next provider for. Anything else (e.g. the request itself is wrong) stops right away.
class ProviderError extends Error { constructor(public kind: "unsupported" | "retry" | "fatal", msg: string) { super(msg); } }

async function httpJson(url: string, headers: Record<string, string>, body: unknown, who: string) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  } catch { throw new ProviderError("retry", "Could not reach " + who + "."); }
  const text = await res.text();
  let data: Json = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = String(data?.error?.message ?? data?.error ?? text).slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new ProviderError("retry", who + " rejected the saved key (" + msg + ").");
    if (res.status === 429) throw new ProviderError("retry", who + " is busy or out of credit (" + msg + ").");
    if (res.status === 404) throw new ProviderError("retry", who + ": model not available to this key (" + msg + ").");
    if (res.status >= 500) throw new ProviderError("retry", who + " had a server error (" + msg + ").");
    throw new ProviderError("retry", who + " error " + res.status + ": " + msg);
  }
  return data;
}
const dataUrl = (p: { mediaType: string; data: string }) => "data:" + p.mediaType + ";base64," + p.data;

async function viaAnthropic(c: Cfg, parts: Part[], schema: Json, o: Opts): Promise<string> {
  const content = parts.map((p) => p.type === "text" ? { type: "text", text: p.text }
    : p.mediaType === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data } }
    : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } });
  const client = new Anthropic({ apiKey: c.key, maxRetries: 2, timeout: 120_000 });
  const params: Record<string, unknown> = {
    model: c.model, max_tokens: o.maxTokens ?? 4096, messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema } },
  };
  const haiku = c.model.startsWith("claude-haiku");
  if (!haiku) {
    (params.output_config as Record<string, unknown>).effort = o.effort ?? "low";
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  try {
    // deno-lint-ignore no-explicit-any
    const res: any = haiku ? await client.messages.create(params as any) : await client.beta.messages.create(params as any);
    if (res.stop_reason === "refusal") throw new ProviderError("retry", "Claude declined this request.");
    if (res.stop_reason === "max_tokens") throw new ProviderError("fatal", "The AI's answer was cut off — please try again with less at once.");
    return (res.content ?? []).filter((b: Json) => b.type === "text").map((b: Json) => b.text).join("");
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new ProviderError("retry", "Claude rejected the saved key.");
    if (e instanceof Anthropic.NotFoundError) throw new ProviderError("retry", "Claude model " + c.model + " isn't available to this key.");
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError("retry", "Claude is busy or out of credit.");
    if (e instanceof Anthropic.APIConnectionError) throw new ProviderError("retry", "Could not reach Claude.");
    if (e instanceof Anthropic.APIError) throw new ProviderError("retry", "Claude error: " + e.message);
    throw e;
  }
}

// OpenAI — Responses API with a strict JSON schema.
async function viaOpenAI(c: Cfg, parts: Part[], schema: Json, o: Opts): Promise<string> {
  const content = parts.map((p) => p.type === "text" ? { type: "input_text", text: p.text }
    : p.mediaType === "application/pdf" ? { type: "input_file", filename: "bill.pdf", file_data: dataUrl(p) }
    : { type: "input_image", image_url: dataUrl(p) });
  const res = await httpJson("https://api.openai.com/v1/responses", { Authorization: "Bearer " + c.key }, {
    model: c.model, input: [{ role: "user", content }], max_output_tokens: o.maxTokens ?? 4096,
    text: { format: { type: "json_schema", name: "salonos", schema, strict: true } },
  }, "ChatGPT");
  if (res.status === "incomplete") throw new ProviderError("fatal", "The AI's answer was cut off — please try again with less at once.");
  const pieces = (res.output ?? []).flatMap((it: Json) => it.content ?? it.message?.content ?? []);
  if (pieces.some((x: Json) => x.type === "refusal")) throw new ProviderError("retry", "ChatGPT declined this request.");
  return pieces.filter((x: Json) => x.type === "output_text").map((x: Json) => x.text).join("");
}

// xAI Grok — OpenAI-style Chat Completions. Reads JPG/PNG images, not PDFs.
async function viaXai(c: Cfg, parts: Part[], schema: Json, o: Opts): Promise<string> {
  for (const p of parts) if (p.type === "file" && !["image/jpeg", "image/png"].includes(p.mediaType)) throw new ProviderError("unsupported", "Grok can't read this file type.");
  const content = parts.map((p) => p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: dataUrl(p) } });
  const res = await httpJson("https://api.x.ai/v1/chat/completions", { Authorization: "Bearer " + c.key }, {
    model: c.model, messages: [{ role: "user", content }], max_tokens: o.maxTokens ?? 4096,
    response_format: { type: "json_schema", json_schema: { name: "salonos", schema, strict: true } },
  }, "Grok");
  const ch = res.choices?.[0];
  if (ch?.finish_reason === "length") throw new ProviderError("fatal", "The AI's answer was cut off — please try again with less at once.");
  if (ch?.message?.refusal) throw new ProviderError("retry", "Grok declined this request.");
  return String(ch?.message?.content ?? "");
}

// Google Gemini (AI Studio key) — generateContent with a JSON response schema. Its schema format
// is an OpenAPI subset: upper-case types, no additionalProperties, no empty enum values.
export function geminiSchema(s: Json): Json {
  if (!s || typeof s !== "object") return s;
  const out: Json = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.description) out.description = s.description;
  if (Array.isArray(s.enum)) { const e = s.enum.filter((x: unknown) => x !== ""); if (e.length === s.enum.length) out.enum = e; else out.description = (out.description ? out.description + ". " : "") + "One of: " + e.join(" | ") + ", or empty"; }
  if (s.properties) { out.properties = {}; for (const k of Object.keys(s.properties)) out.properties[k] = geminiSchema(s.properties[k]); out.propertyOrdering = Object.keys(s.properties); }
  if (s.required) out.required = s.required;
  if (s.items) out.items = geminiSchema(s.items);
  return out;
}
async function viaGemini(c: Cfg, parts: Part[], schema: Json, o: Opts): Promise<string> {
  const gparts = parts.map((p) => p.type === "text" ? { text: p.text } : { inline_data: { mime_type: p.mediaType, data: p.data } });
  const res = await httpJson("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(c.model) + ":generateContent", { "x-goog-api-key": c.key }, {
    contents: [{ role: "user", parts: gparts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: geminiSchema(schema), maxOutputTokens: o.maxTokens ?? 4096 },
  }, "Gemini");
  if (res.promptFeedback?.blockReason) throw new ProviderError("retry", "Gemini declined this request (" + res.promptFeedback.blockReason + ").");
  const cand = res.candidates?.[0];
  if (cand?.finishReason === "MAX_TOKENS") throw new ProviderError("fatal", "The AI's answer was cut off — please try again with less at once.");
  if (cand?.finishReason === "SAFETY") throw new ProviderError("retry", "Gemini declined this request.");
  return (cand?.content?.parts ?? []).map((p: Json) => p.text ?? "").join("");
}

// One structured-output request: tries the saved providers in order until one answers with JSON
// matching `schema`.
export async function callAI(cfgs: Cfg[], parts: Part[], schema: Record<string, unknown>, opts: Opts = {}) {
  const problems: string[] = [];
  let unsupportedOnly = true;
  for (const c of cfgs) {
    try {
      const text = c.provider === "anthropic" ? await viaAnthropic(c, parts, schema, opts)
        : c.provider === "openai" ? await viaOpenAI(c, parts, schema, opts)
        : c.provider === "gemini" ? await viaGemini(c, parts, schema, opts)
        : await viaXai(c, parts, schema, opts);
      try { return { data: JSON.parse(text), model: c.model, provider: LABEL[c.provider] }; }
      catch { throw new ProviderError("retry", LABEL[c.provider] + "'s answer could not be read."); }
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      if (e.kind === "fatal") throw new HttpError(502, e.message);
      if (e.kind !== "unsupported") unsupportedOnly = false;
      problems.push(e.message);
    }
  }
  if (unsupportedOnly) throw new HttpError(415, problems.join(" "));
  throw new HttpError(502, problems.join(" ") + " — a Super Admin can check the keys in Master Settings → AI Assistant.");
}
const strs = (v: unknown, max: number, len = 120) =>
  (Array.isArray(v) ? v : []).filter((x) => typeof x === "string").map((x) => (x as string).slice(0, len)).slice(0, max);

// ── Bill reading ──
const BILL_SCHEMA = {
  type: "object",
  properties: {
    supplierName: { type: "string", description: "Seller / supplier business name as printed" },
    supplierGstin: { type: "string", description: "Seller's 15-character GSTIN, or empty" },
    supplierPhone: { type: "string" },
    supplierEmail: { type: "string" },
    docNature: { type: "string", enum: ["Tax Invoice", "Invoice", "Performa Invoice"] },
    invoiceNo: { type: "string" },
    invoiceDate: { type: "string", description: "YYYY-MM-DD, or empty" },
    dueDate: { type: "string", description: "YYYY-MM-DD, or empty" },
    periodFrom: { type: "string", description: "For utility/rent bills: first month billed, YYYY-MM, or empty" },
    periodTo: { type: "string", description: "For utility/rent bills: last month billed, YYYY-MM, or empty" },
    taxable: { type: "number", description: "Total taxable value (before GST); 0 if not shown" },
    igst: { type: "number" },
    cgst: { type: "number" },
    sgst: { type: "number", description: "SGST or UTGST" },
    freight: { type: "number" },
    roundOff: { type: "number", description: "Round-off adjustment, may be negative" },
    total: { type: "number", description: "Grand total payable" },
    category: { type: "string", description: "Best matching category from the list given" },
    description: { type: "string", description: "Short description of what was bought, max 12 words" },
    notes: { type: "string", description: "Anything unclear or unreadable on the bill; empty if all clear" },
  },
  required: ["supplierName", "supplierGstin", "supplierPhone", "supplierEmail", "docNature", "invoiceNo", "invoiceDate", "dueDate",
    "periodFrom", "periodTo", "taxable", "igst", "cgst", "sgst", "freight", "roundOff", "total", "category", "description", "notes"],
  additionalProperties: false,
};
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function readBill(cfg: Cfg[], file: string, mediaType: string, categories: unknown) {
  if (!file || file.length > 11_000_000) throw new HttpError(400, "The file is missing or too large (max about 8 MB).");
  // deno-lint-ignore no-explicit-any
  let source: any;
  if (mediaType === "application/pdf" || IMAGE_TYPES.includes(mediaType)) source = { type: "file", mediaType, data: file };
  else throw new HttpError(400, "AI can read PDFs and photos (JPG, PNG, WEBP).");
  const cats = strs(categories, 40);
  const { data, model, provider } = await callAI(cfg, [
    source,
    {
      type: "text",
      text: "This is a purchase bill received by a salon business in India. Read it and fill in every field. " +
        "Use amounts exactly as printed (rupees, no commas). Dates as YYYY-MM-DD. If a field is not on the bill, use an empty string or 0. " +
        "docNature: 'Performa Invoice' for a proforma/estimate, 'Tax Invoice' when it says Tax Invoice, otherwise 'Invoice'. " +
        "category must be exactly one of: " + (cats.length ? cats.join(" | ") : "Other") + ".",
    },
  ], BILL_SCHEMA);
  if (cats.length && !cats.includes(data.category)) data.category = "";
  return { ...data, model, provider };
}

// ── Bank statement row tagging ──
async function tagBank(cfg: Cfg[], body: Record<string, unknown>) {
  const natures = strs(body.natures, 40, 60).filter(Boolean);
  if (!natures.length) throw new HttpError(400, "No categories given.");
  // deno-lint-ignore no-explicit-any
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 150).map((r: any) => ({
    i: Number(r.i) || 0, d: String(r.d ?? "").slice(0, 200), dr: Number(r.dr) || 0, cr: Number(r.cr) || 0,
  }));
  if (!rows.length) return { items: [] };
  const vendors = strs(body.vendors, 300, 80), employees = strs(body.employees, 300, 60);
  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            i: { type: "integer" },
            nature: { type: "string", enum: [...natures, ""] },
            vendor: { type: "string", description: "Exact vendor name from the list when the row is a payment to that vendor, else empty" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["i", "nature", "vendor", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
  const { data, model, provider } = await callAI(cfg, [{
    type: "text",
    text: "Bank statement rows of a salon business in India (d = narration, dr = money out, cr = money in). " +
      "For each row choose the best 'nature' from this list: " + natures.join(" | ") + ". " +
      "Card/UPI settlements are credits from payment processors (e.g. Razorpay, Pine Labs, Paytm, PhonePe, BharatPe). " +
      "Salary / Incentive / Advance Salary are debits to staff (staff names: " + (employees.join(", ") || "none given") + "). " +
      "Vendor Payment is a debit to a supplier; when it matches one of these vendors put its exact name in 'vendor': " + (vendors.join(" | ") || "none") + ". " +
      "Use an empty nature with confidence low when you can't tell. Return one item per row, same i.\n\n" +
      JSON.stringify(rows),
  }], schema, { maxTokens: 8000 });
  const valid = new Set(natures);
  // deno-lint-ignore no-explicit-any
  const items = (data.items ?? []).filter((x: any) => rows.some((r) => r.i === x.i)).map((x: any) => ({
    i: x.i, nature: valid.has(x.nature) ? x.nature : "", vendor: vendors.includes(x.vendor) ? x.vendor : "", confidence: x.confidence,
  }));
  return { items, model, provider };
}

// ── P&L explanation ──
async function explainPnl(cfg: Cfg[], body: Record<string, unknown>) {
  // deno-lint-ignore no-explicit-any
  const lines = (Array.isArray(body.lines) ? body.lines : []).slice(0, 80).map((l: any) => ({
    name: String(l.name ?? "").slice(0, 80), section: String(l.section ?? "").slice(0, 40),
    amt: Math.round(Number(l.amt) || 0), prev: Math.round(Number(l.prev) || 0),
  }));
  if (!lines.length) throw new HttpError(400, "No P&L figures given.");
  const schema = {
    type: "object",
    properties: {
      headline: { type: "string", description: "One sentence: how the month went overall" },
      points: { type: "array", items: { type: "string" }, description: "3-6 short points on the biggest changes and why they matter" },
      watch: { type: "array", items: { type: "string" }, description: "0-3 things to check or act on" },
    },
    required: ["headline", "points", "watch"],
    additionalProperties: false,
  };
  const { data, model, provider } = await callAI(cfg, [{
    type: "text",
    text: "You are explaining a salon outlet's monthly P&L to its owner in India, in plain simple English. " +
      "Outlet: " + String(body.outlet ?? "").slice(0, 80) + ". Month: " + String(body.month ?? "") + ", compared with " + String(body.prevMonth ?? "the previous month") + ". " +
      "Amounts are in rupees (write them like ₹1,23,456). Use only these figures — don't invent causes that aren't visible in them; " +
      "where a reason is a guess, say 'possibly'. " + (body.notes ? "Notes: " + String(body.notes).slice(0, 500) + ". " : "") +
      "\n\nLines (amt = this month, prev = previous month):\n" + JSON.stringify(lines),
  }], schema, { maxTokens: 2000, effort: "medium" });
  return { ...data, model, provider };
}

// ── Ask SalonOS ──
async function ask(cfg: Cfg[], body: Record<string, unknown>) {
  const question = String(body.question ?? "").trim().slice(0, 1000);
  if (!question) throw new HttpError(400, "Type a question first.");
  const context = String(body.context ?? "").slice(0, 120_000);
  const schema = {
    type: "object",
    properties: {
      answer: { type: "string", description: "The answer, short and direct; ₹ amounts in Indian format" },
      basis: { type: "string", description: "One line: which figures the answer is based on, or what data is missing" },
    },
    required: ["answer", "basis"],
    additionalProperties: false,
  };
  const { data, model, provider } = await callAI(cfg, [{
    type: "text",
    text: "Question from a SalonOS user (salon management app, India): " + question + "\n\n" +
      "Answer ONLY from the data below, which is what this user can see in SalonOS. If the data doesn't contain the answer, " +
      "say so plainly and name the SalonOS screen that would have it. Do the arithmetic carefully. Reply in the language of the " +
      "question (English or Hindi).\n\nDATA (" + String(body.outlet ?? "").slice(0, 80) + "):\n" + context,
  }], schema, { maxTokens: 2000, effort: "medium" });
  return { ...data, model, provider };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const cfg = await aiConfig();
    if (action === "status") return json({ configured: cfg.length > 0, providers: cfg.map((c) => c.provider) });
    if (!cfg.length) return json({ notConfigured: true, error: "AI isn't set up yet — a Super Admin can add the key in Master Settings → AI Assistant." });
    if (action === "read_bill") return json(await readBill(cfg, String(body.file ?? ""), String(body.mediaType ?? ""), body.categories));
    if (action === "tag_bank") return json(await tagBank(cfg, body));
    if (action === "explain_pnl") return json(await explainPnl(cfg, body));
    if (action === "ask") return json(await ask(cfg, body));
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    // No saved AI can read this kind of file (e.g. only Grok is set up and the bill is a PDF): the app
    // then reads it in the browser instead, as if AI weren't set up.
    if (e instanceof HttpError && e.status === 415) return json({ notConfigured: true, error: e.message });
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message || "Something went wrong." }, status);
  }
});
