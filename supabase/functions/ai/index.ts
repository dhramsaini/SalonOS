// SalonOS — AI features (Supabase Edge Function "ai"), using the Claude API key a Super Admin saved
// in Master Settings → AI Assistant (public.app_secrets, read here with the service role; never
// sent to a browser).
//
// Actions (POST JSON {action, ...}) — any signed-in, active SalonOS user. The app only ever sends
// data the signed-in person can already see in SalonOS; nothing is stored here.
//   status                                   → { configured }
//   read_bill {file (base64), mediaType, categories[]}
//                                            → the bill's fields as structured JSON
//   tag_bank {rows:[{i,d,dr,cr}], natures[], vendors[], employees[]}
//                                            → { items:[{i, nature, vendor, confidence}] }
//   explain_pnl {outlet, month, prevMonth, lines:[{name, section, amt, prev}], notes}
//                                            → { headline, points[], watch[] }
//   ask {question, context (text), outlet}   → { answer, basis }
// Deploy with "Verify JWT" ON.
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
type Cfg = { key: string; model: string };
async function aiConfig(): Promise<Cfg | null> {
  const { data } = await admin.from("app_secrets").select("value,meta").eq("name", "anthropic_api_key").maybeSingle();
  return data ? { key: data.value as string, model: (data.meta?.model as string) ?? "claude-opus-5-5" } : null;
}

// One structured-output call: the answer always comes back as JSON matching `schema`.
// deno-lint-ignore no-explicit-any
async function callClaude(cfg: Cfg, content: any[], schema: Record<string, unknown>, opts: { maxTokens?: number; effort?: string } = {}) {
  const client = new Anthropic({ apiKey: cfg.key, maxRetries: 2, timeout: 120_000 });
  const params: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema } },
  };
  if (cfg.model !== "claude-haiku-4-5") {
    (params.output_config as Record<string, unknown>).effort = opts.effort ?? "low";
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  try {
    // deno-lint-ignore no-explicit-any
    const res: any = cfg.model === "claude-haiku-4-5"
      // deno-lint-ignore no-explicit-any
      ? await client.messages.create(params as any)
      // deno-lint-ignore no-explicit-any
      : await client.beta.messages.create(params as any);
    if (res.stop_reason === "refusal") throw new HttpError(422, "The AI declined this request.");
    if (res.stop_reason === "max_tokens") throw new HttpError(502, "The AI's answer was cut off — please try again with less at once.");
    // deno-lint-ignore no-explicit-any
    const text = (res.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    return { data: JSON.parse(text), model: res.model as string };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof SyntaxError) throw new HttpError(502, "The AI's answer could not be read — please try again.");
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "The saved AI key no longer works — a Super Admin should update it in Master Settings → AI Assistant.");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AI is busy or out of credit right now — try again in a minute.");
    if (e instanceof Anthropic.APIConnectionError) throw new HttpError(502, "Could not reach the AI service — try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, "AI error: " + e.message);
    throw e;
  }
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

async function readBill(cfg: Cfg, file: string, mediaType: string, categories: unknown) {
  if (!file || file.length > 11_000_000) throw new HttpError(400, "The file is missing or too large (max about 8 MB).");
  // deno-lint-ignore no-explicit-any
  let source: any;
  if (mediaType === "application/pdf") source = { type: "document", source: { type: "base64", media_type: "application/pdf", data: file } };
  else if (IMAGE_TYPES.includes(mediaType)) source = { type: "image", source: { type: "base64", media_type: mediaType, data: file } };
  else throw new HttpError(400, "AI can read PDFs and photos (JPG, PNG, WEBP).");
  const cats = strs(categories, 40);
  const { data, model } = await callClaude(cfg, [
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
  return { ...data, model };
}

// ── Bank statement row tagging ──
async function tagBank(cfg: Cfg, body: Record<string, unknown>) {
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
  const { data, model } = await callClaude(cfg, [{
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
  return { items, model };
}

// ── P&L explanation ──
async function explainPnl(cfg: Cfg, body: Record<string, unknown>) {
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
  const { data, model } = await callClaude(cfg, [{
    type: "text",
    text: "You are explaining a salon outlet's monthly P&L to its owner in India, in plain simple English. " +
      "Outlet: " + String(body.outlet ?? "").slice(0, 80) + ". Month: " + String(body.month ?? "") + ", compared with " + String(body.prevMonth ?? "the previous month") + ". " +
      "Amounts are in rupees (write them like ₹1,23,456). Use only these figures — don't invent causes that aren't visible in them; " +
      "where a reason is a guess, say 'possibly'. " + (body.notes ? "Notes: " + String(body.notes).slice(0, 500) + ". " : "") +
      "\n\nLines (amt = this month, prev = previous month):\n" + JSON.stringify(lines),
  }], schema, { maxTokens: 2000, effort: "medium" });
  return { ...data, model };
}

// ── Ask SalonOS ──
async function ask(cfg: Cfg, body: Record<string, unknown>) {
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
  const { data, model } = await callClaude(cfg, [{
    type: "text",
    text: "Question from a SalonOS user (salon management app, India): " + question + "\n\n" +
      "Answer ONLY from the data below, which is what this user can see in SalonOS. If the data doesn't contain the answer, " +
      "say so plainly and name the SalonOS screen that would have it. Do the arithmetic carefully. Reply in the language of the " +
      "question (English or Hindi).\n\nDATA (" + String(body.outlet ?? "").slice(0, 80) + "):\n" + context,
  }], schema, { maxTokens: 2000, effort: "medium" });
  return { ...data, model };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const cfg = await aiConfig();
    if (action === "status") return json({ configured: !!cfg });
    if (!cfg) return json({ notConfigured: true, error: "AI isn't set up yet — a Super Admin can add the key in Master Settings → AI Assistant." });
    if (action === "read_bill") return json(await readBill(cfg, String(body.file ?? ""), String(body.mediaType ?? ""), body.categories));
    if (action === "tag_bank") return json(await tagBank(cfg, body));
    if (action === "explain_pnl") return json(await explainPnl(cfg, body));
    if (action === "ask") return json(await ask(cfg, body));
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message || "Something went wrong." }, status);
  }
});
