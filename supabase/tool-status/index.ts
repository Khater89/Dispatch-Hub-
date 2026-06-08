// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: tool-status
// ═══════════════════════════════════════════════════════════════════
// Deploy path:  supabase/functions/tool-status/index.ts
// Public URL:   ${API_BASE}/tool-status[/me|/admins|/admins/:user_id]
//
// Routes:
//   GET    /tool-status            → list all tools + current user's is_admin flag
//   GET    /tool-status/me         → { is_admin, email }
//   POST   /tool-status            → update tool (admin only)
//                                    body: { tool_key, enabled, disabled_message? }
//   GET    /tool-status/admins     → list admins (admin only)
//   POST   /tool-status/admins     → add admin by email (admin only)
//                                    body: { email }
//   DELETE /tool-status/admins     → remove admin (admin only)
//                                    body: { user_id }
// ═══════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "no_auth" }, 401);

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // user-scoped client → verifies the requester's JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ ok: false, error: "invalid_session" }, 401);

    // service-role client → bypasses RLS for the internal admin check
    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve sub-path:
    // pathname looks like /functions/v1/tool-status[/me|/admins]
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean); // ['functions','v1','tool-status', ...]
    const idx = parts.indexOf("tool-status");
    const sub = idx >= 0 ? parts.slice(idx + 1).join("/") : "";

    // Determine admin status once
    const { data: adminRow } = await admin
      .from("admin_users")
      .select("user_id, email")
      .eq("user_id", user.id)
      .maybeSingle();
    const isAdmin = !!adminRow;

    // ── GET /tool-status/me ─────────────────────────────────────────
    if (req.method === "GET" && sub === "me") {
      return json({ ok: true, is_admin: isAdmin, email: user.email ?? null });
    }

    // ── GET /tool-status ────────────────────────────────────────────
    if (req.method === "GET" && sub === "") {
      const { data, error } = await admin
        .from("tool_status")
        .select("tool_key, tool_name, enabled, disabled_message, updated_at, updated_by")
        .order("tool_name", { ascending: true });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, tools: data ?? [], is_admin: isAdmin });
    }

    // ── POST /tool-status (update) ──────────────────────────────────
    if (req.method === "POST" && sub === "") {
      if (!isAdmin) return json({ ok: false, error: "not_admin" }, 403);
      const body = await req.json().catch(() => null);
      if (!body || typeof body.tool_key !== "string" || typeof body.enabled !== "boolean") {
        return json({ ok: false, error: "bad_request" }, 400);
      }
      const patch: Record<string, unknown> = {
        enabled: body.enabled,
        disabled_message: typeof body.disabled_message === "string" ? body.disabled_message : null,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };
      const { data, error } = await admin
        .from("tool_status")
        .update(patch)
        .eq("tool_key", body.tool_key)
        .select()
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!data)  return json({ ok: false, error: "tool_not_found" }, 404);
      return json({ ok: true, tool: data });
    }

    // ── GET /tool-status/admins ─────────────────────────────────────
    if (req.method === "GET" && sub === "admins") {
      if (!isAdmin) return json({ ok: false, error: "not_admin" }, 403);
      const { data, error } = await admin
        .from("admin_users")
        .select("user_id, email, added_at")
        .order("added_at", { ascending: true });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, admins: data ?? [], me: user.id });
    }

    // ── POST /tool-status/admins (add admin by email) ───────────────
    if (req.method === "POST" && sub === "admins") {
      if (!isAdmin) return json({ ok: false, error: "not_admin" }, 403);
      const body = await req.json().catch(() => null);
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!email || !/^.+@.+\..+$/.test(email)) {
        return json({ ok: false, error: "bad_email" }, 400);
      }

      // Look up the user by email in auth.users (requires service role)
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (listErr) return json({ ok: false, error: listErr.message }, 500);
      const target = (list?.users ?? []).find(u => (u.email ?? "").toLowerCase() === email);
      if (!target) {
        return json({ ok: false, error: "user_not_found", message: `No registered user with email "${email}". Have them sign in once first.` }, 404);
      }

      const { data: row, error: insErr } = await admin
        .from("admin_users")
        .upsert({ user_id: target.id, email: target.email ?? email, added_by: user.id }, { onConflict: "user_id" })
        .select()
        .single();
      if (insErr) return json({ ok: false, error: insErr.message }, 500);
      return json({ ok: true, admin: row });
    }

    // ── DELETE /tool-status/admins (remove admin) ───────────────────
    if (req.method === "DELETE" && sub === "admins") {
      if (!isAdmin) return json({ ok: false, error: "not_admin" }, 403);
      const body = await req.json().catch(() => null);
      const targetId = String(body?.user_id ?? "").trim();
      if (!targetId) return json({ ok: false, error: "bad_request" }, 400);

      // Block self-removal so we never end up with zero admins
      if (targetId === user.id) {
        return json({ ok: false, error: "cant_remove_self" }, 400);
      }

      const { error: delErr } = await admin
        .from("admin_users")
        .delete()
        .eq("user_id", targetId);
      if (delErr) return json({ ok: false, error: delErr.message }, 500);
      return json({ ok: true });
    }

    return json({ ok: false, error: "not_found", path: sub, method: req.method }, 404);
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
