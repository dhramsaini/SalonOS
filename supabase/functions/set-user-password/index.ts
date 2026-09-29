// SalonOS — lets a Super Admin set a new password for another user (Supabase Edge Function
// "set-user-password", called from User Management → Edit user → "New Password").
// Passwords are stored only as one-way hashes, so nobody (not even a Super Admin) can view an
// existing one; this replaces it instead.
//
// Rules: the caller must be a signed-in, active Super Admin, at two-step level (aal2) when their
// account has an authenticator; the target must exist and must not be a Super Admin (they use
// "Forgot password?" on the login screen); the password must be at least 8 characters.
// Deploy with "Verify JWT" ON (the default) — this function also checks the caller itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function jwtPayload(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: null };
    const caller = who?.user;
    if (!caller) return json({ error: "Please sign in again." }, 401);

    const { data: me } = await admin.from("profiles").select("role,status").eq("id", caller.id).maybeSingle();
    if (!me || me.role !== "Super Admin" || (me.status ?? "Active") === "Inactive") {
      return json({ error: "Only a Super Admin can change another user's password." }, 403);
    }
    const hasTotp = (caller.factors ?? []).some((f: { status?: string }) => f.status === "verified");
    if (hasTotp && jwtPayload(jwt).aal !== "aal2") {
      return json({ error: "Sign in again with your authenticator code first." }, 403);
    }

    const { user_id, password } = await req.json().catch(() => ({}));
    if (typeof user_id !== "string" || !user_id) return json({ error: "Missing user." }, 400);
    if (typeof password !== "string" || password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }
    if (user_id === caller.id) return json({ error: "Change your own password with \"Forgot password?\" on the login screen." }, 400);

    const { data: target } = await admin.from("profiles").select("role").eq("id", user_id).maybeSingle();
    if (!target) return json({ error: "User not found." }, 404);
    if (target.role === "Super Admin") {
      return json({ error: "A Super Admin's password can only be changed by that person (\"Forgot password?\")." }, 403);
    }

    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message || "Could not change the password." }, 500);
  }
});
