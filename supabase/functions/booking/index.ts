// SalonOS — public booking requests (Supabase Edge Function "booking").
//
// booking.html (the outlet's public booking page) POSTs {sid, token, name, phone, services[], day, time, note}.
// The token is a per-outlet secret kept in kv salonos_frontdesk_settings_outlet_<sid>.bookingToken (made by the
// app when the booking link is copied); a request without the right token is refused. Accepted requests are
// appended to kv salonos_booking_requests_outlet_<sid> as "Pending" — staff accept or decline them in
// SalonOS → Appointments → 📥 Requests. Nothing is booked without a person.
//
// Deploy with "Verify JWT" OFF (clients are not logged in). Limits: 3 pending requests per mobile per outlet,
// 300 requests kept per outlet, 60-day booking window, short text fields.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const pad = (n: number) => String(n).padStart(2, "0");
const istToday = () => { const d = new Date(Date.now() + 5.5 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

async function kvGet(key: string) {
  const { data } = await admin.from("kv_store").select("value").eq("key", key).maybeSingle();
  try { return data?.value ? JSON.parse(data.value) : null; } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const sid = Number(b.sid);
    const token = String(b.token ?? "");
    if (!Number.isInteger(sid) || sid < 1 || sid > 1_000_000 || !/^[A-Za-z0-9]{16,64}$/.test(token)) return json({ error: "This booking link is not valid." }, 400);
    const settings = await kvGet(`salonos_frontdesk_settings_outlet_${sid}`);
    if (!settings || settings.bookingToken !== token) return json({ error: "This booking link is no longer active — please ask the salon for a new one." }, 403);

    let phone = String(b.phone ?? "").replace(/\D/g, "");
    if (phone.length === 12 && phone.startsWith("91")) phone = phone.slice(2);
    if (phone.length === 11 && phone.startsWith("0")) phone = phone.slice(1);
    if (!/^[6-9]\d{9}$/.test(phone)) return json({ error: "Enter a 10-digit mobile number." }, 400);
    const name = clean(b.name, 60);
    if (!name) return json({ error: "Enter your name." }, 400);
    const services = (Array.isArray(b.services) ? b.services : []).map((s: unknown) => clean(s, 80)).filter(Boolean).slice(0, 6);
    if (!services.length) return json({ error: "Pick a service." }, 400);
    const day = String(b.day ?? "");
    const today = istToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today || day > addDays(today, 60)) return json({ error: "Pick a day within the next 60 days." }, 400);
    const time = Number(b.time);
    if (!Number.isInteger(time) || time < 0 || time >= 1440) return json({ error: "Pick a time." }, 400);
    const note = clean(b.note, 300);

    const key = `salonos_booking_requests_outlet_${sid}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: row } = await admin.from("kv_store").select("value,updated_at").eq("key", key).maybeSingle();
      let list: Record<string, unknown>[] = [];
      try { list = row?.value ? JSON.parse(row.value) : []; } catch { list = []; }
      if (!Array.isArray(list)) list = [];
      if (list.filter((x) => x && x.phone === phone && x.status === "Pending").length >= 3) return json({ error: "You already have requests waiting — the salon will contact you." }, 429);
      const item = { id: "BR-" + crypto.randomUUID(), receivedAt: new Date().toISOString(), status: "Pending", name, phone, services, day, time, note };
      const next = JSON.stringify([...list, item].slice(-300));
      const now = new Date().toISOString();
      const res = row
        ? await admin.from("kv_store").update({ value: next, updated_at: now }).eq("key", key).eq("updated_at", row.updated_at).select("key")
        : await admin.from("kv_store").insert({ key, value: next, updated_at: now }).select("key");
      if (!res.error && res.data && res.data.length) return json({ ok: true });
    }
    return json({ error: "Busy — please try again in a moment." }, 503);
  } catch (err) {
    return json({ error: (err as Error).message || "Something went wrong." }, 500);
  }
});
