// SalonOS — AI features (Supabase Edge Function "ai"), using the Claude API key a Super Admin saved
// in Master Settings → AI Assistant (public.app_secrets, read here with the service role; never
// sent to a browser).
//
// Actions (POST JSON {action, ...}) — any signed-in, active SalonOS user:
//   status                                   → { configured }
//   read_bill {file (base64), mediaType, categories[]}
//                                            → the bill's fields as structured JSON
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
async function aiConfig() {
  const { data } = await admin.from("app_secrets").select("value,meta").eq("name", "anthropic_api_key").maybeSingle();
  return data ? { key: data.value as string, model: (data.meta?.model as string) ?? "claude-opus-5-5" } : null;
}

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

async function readBill(cfg: { key: string; model: string }, file: string, mediaType: string, categories: string[]) {
  if (!file || file.length > 11_000_000) throw new HttpError(400, "The file is missing or too large (max about 8 MB).");
  // deno-lint-ignore no-explicit-any
  let source: any;
  if (mediaType === "application/pdf") source = { type: "document", source: { type: "base64", media_type: "application/pdf", data: file } };
  else if (IMAGE_TYPES.includes(mediaType)) source = { type: "image", source: { type: "base64", media_type: mediaType, data: file } };
  else throw new HttpError(400, "AI can read PDFs and photos (JPG, PNG, WEBP).");
  const cats = (categories || []).filter((c) => typeof c === "string").slice(0, 40);
  const client = new Anthropic({ apiKey: cfg.key, maxRetries: 2, timeout: 120_000 });
  const params: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        source,
        {
          type: "text",
          text: "This is a purchase bill received by a salon business in India. Read it and fill in every field. " +
            "Use amounts exactly as printed (rupees, no commas). Dates as YYYY-MM-DD. If a field is not on the bill, use an empty string or 0. " +
            "docNature: 'Performa Invoice' for a proforma/estimate, 'Tax Invoice' when it says Tax Invoice, otherwise 'Invoice'. " +
            "category must be exactly one of: " + (cats.length ? cats.join(" | ") : "Other") + ".",
        },
      ],
    }],
    output_config: { format: { type: "json_schema", schema: BILL_SCHEMA } },
  };
  if (cfg.model !== "claude-haiku-4-5") {
    (params.output_config as Record<string, unknown>).effort = "low";
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
    if (res.stop_reason === "refusal") throw new HttpError(422, "The AI declined to read this file — please enter the details manually.");
    if (res.stop_reason === "max_tokens") throw new HttpError(502, "The AI's answer was cut off — please try again.");
    // deno-lint-ignore no-explicit-any
    const text = (res.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const data = JSON.parse(text);
    if (cats.length && !cats.includes(data.category)) data.category = "";
    return { ...data, model: res.model };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof SyntaxError) throw new HttpError(502, "The AI's answer could not be read — please try again.");
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, "The saved AI key no longer works — a Super Admin should update it in Master Settings → AI Assistant.");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "AI is busy or out of credit right now — try again in a minute, or enter the details manually.");
    if (e instanceof Anthropic.APIConnectionError) throw new HttpError(502, "Could not reach the AI service — try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, "AI error: " + e.message);
    throw e;
  }
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
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message || "Something went wrong." }, status);
  }
});
