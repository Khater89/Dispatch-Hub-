// supabase/functions/api/index.ts
// Edge Function name: api
// Deploy: supabase functions deploy api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { INTL_SUPPLIERS_DB } from "./intl_suppliers_data.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Defaults (override via Secrets)
const TECH_TABLE = Deno.env.get("TECH_TABLE") || "ars_technician";
const ZIP_TABLE  = Deno.env.get("ZIP_TABLE")  || "zipdb_v2";
const FLEX_TABLE = Deno.env.get("FLEX_TABLE") || "usa_tier_2_flex_tech";

// Canada
const CA_W2_TABLE     = Deno.env.get("CA_W2_TABLE") || "canada_w2";
const CA_POSTAL_TABLE = Deno.env.get("CA_POSTAL_TABLE") || "";

// Optional
const USA_W2_TABLE = Deno.env.get("USA_W2_TABLE") || "";

// Access control
const ADMIN_USERNAME = (Deno.env.get("ADMIN_USERNAME") || "khater").trim();
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "akhater@acuative.com")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);
const COMPANY_DOMAIN = (Deno.env.get("COMPANY_DOMAIN") || "acuative.com").trim().toLowerCase().replace(/^@+/, "");
const ALLOWED_USERS_TABLE = Deno.env.get("ALLOWED_USERS_TABLE") || "ufh_allowed_users";
const DEVICE_LOCKS_TABLE = Deno.env.get("DEVICE_LOCKS_TABLE") || "ufh_device_locks";

// Allowed tables for /export/<table>
const ALLOWED_TABLES = new Set(
  [TECH_TABLE, ZIP_TABLE, FLEX_TABLE, CA_W2_TABLE, CA_POSTAL_TABLE, USA_W2_TABLE].filter(Boolean),
);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, authorization, apikey, x-client-info, x-admin-token, x-admin-user, x-admin-email, x-ufh-device-key, x-ufh-device-name",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

function normalizeIdentity(v: string | null) {
  return String(v || "").trim().toLowerCase();
}

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function isOwnerEmail(email: string) {
  return ADMIN_EMAILS.includes(normalizeIdentity(email));
}

function isCompanyEmail(email: string) {
  return normalizeIdentity(email).endsWith("@" + COMPANY_DOMAIN);
}

function usernameFromEmail(email: string) {
  return String(email || "").split("@")[0] || "user";
}

function deviceKeyFromReq(req: Request) {
  return String(req.headers.get("x-ufh-device-key") || "").trim();
}

function deviceNameFromReq(req: Request) {
  return String(req.headers.get("x-ufh-device-name") || "").trim().slice(0, 240);
}

function isMissingRelationError(error: any) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || (msg.includes("relation") && msg.includes("does not exist"));
}

function setupMissingReason() {
  return `Run supabase/sql/ufh_free_team_auth_setup.sql first, then configure the Before User Created hook and email confirmations.`;
}

async function getSessionUser(req: Request, supabase: any) {
  const token = bearerToken(req);
  if (!token) return { ok: false, reason: "Missing bearer token" };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok: false, reason: "Invalid or expired session" };
  return { ok: true, user: data.user };
}

async function authorizeUser(req: Request, supabase: any) {
  const session = await getSessionUser(req, supabase);
  if (!session.ok) return session;

  const user = session.user;
  const email = normalizeIdentity(user.email || "");
  if (!email) return { ok: false, reason: "User email is missing" };
  if (!isCompanyEmail(email)) return { ok: false, reason: `Only @${COMPANY_DOMAIN} work emails are allowed` };
  if (!user.email_confirmed_at) return { ok: false, reason: "Verify your work email first, then sign in again." };

  const deviceKey = deviceKeyFromReq(req);
  const deviceName = deviceNameFromReq(req);
  if (!deviceKey) return { ok: false, reason: "Missing device key" };

  let accessRow: any = null;
  const owner = isOwnerEmail(email);
  if (!owner) {
    const { data, error } = await supabase
      .from(ALLOWED_USERS_TABLE)
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) return { ok: false, reason: setupMissingReason() };
      return { ok: false, reason: error.message };
    }
    if (!data) return { ok: false, reason: "Your email is not approved for this app yet." };
    if (data.is_active === false) return { ok: false, reason: "Your access is currently disabled." };
    if (data.can_sign_up === false && !user.email_confirmed_at) return { ok: false, reason: "Self-signup is disabled for this user." };
    accessRow = data;
  }

  const { data: device, error: deviceError } = await supabase
    .from(DEVICE_LOCKS_TABLE)
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (deviceError) {
    if (isMissingRelationError(deviceError)) return { ok: false, reason: setupMissingReason() };
    return { ok: false, reason: deviceError.message };
  }

  const now = new Date().toISOString();
  if (!device) {
    const payload: any = {
      email,
      user_id: user.id,
      device_key: deviceKey,
      device_name: deviceName || "browser-device",
      bound_at: now,
      last_seen_at: now,
      updated_at: now,
    };
    const { error } = await supabase.from(DEVICE_LOCKS_TABLE).insert(payload);
    if (error) {
      if (isMissingRelationError(error)) return { ok: false, reason: setupMissingReason() };
      return { ok: false, reason: error.message };
    }
  } else if (String(device.device_key || "") !== deviceKey) {
    return { ok: false, reason: "This account is already locked to another device. Ask the owner to reset your device lock." };
  } else {
    const { error } = await supabase
      .from(DEVICE_LOCKS_TABLE)
      .update({ last_seen_at: now, updated_at: now, device_name: deviceName || device.device_name || "browser-device", user_id: user.id })
      .eq("email", email);
    if (error && !isMissingRelationError(error)) return { ok: false, reason: error.message };
  }

  const meta = user.user_metadata || {};
  const username = String(accessRow?.username || meta.username || meta.full_name || ADMIN_USERNAME || usernameFromEmail(email)).trim() || usernameFromEmail(email);
  const role = owner ? "owner" : String(accessRow?.role || "user");
  return {
    ok: true,
    email,
    username,
    role,
    owner,
    user,
    access: accessRow,
    device: {
      device_key: deviceKey,
      device_name: deviceName || "browser-device",
    },
  };
}

async function requireAuthorizedUser(req: Request, supabase: any, origin: string | null) {
  const auth = await authorizeUser(req, supabase);
  if (!auth.ok) return jsonResponse(origin, { ok: false, error: "Unauthorized", reason: auth.reason }, 401);
  return auth;
}

async function requireAdminUser(req: Request, supabase: any, origin: string | null) {
  const auth = await authorizeUser(req, supabase);
  if (!auth.ok) return jsonResponse(origin, { ok: false, error: "Unauthorized", reason: auth.reason }, 401);
  if (!auth.owner) return jsonResponse(origin, { ok: false, error: "Forbidden", reason: "Owner account required" }, 403);
  return auth;
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// --- robust key picking ---
function normKey(k: string) {
  return String(k || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function buildKeyMap(obj: any) {
  const m: Record<string, any> = Object.create(null);
  if (!obj) return m;
  for (const [k, v] of Object.entries(obj)) m[normKey(k)] = v;
  return m;
}

function pick(m: Record<string, any>, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = m[normKey(k)];
    if (v != null && String(v).trim() !== "") return v;
  }
  return fallback;
}

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeCol(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sheetToTable(sheetName: string) {
  const s = sheetName.trim().toLowerCase();
  if (s.includes("ars") || s.includes("technician") || s.includes("tech db")) return TECH_TABLE;
  if (s.includes("tier 2") || s.includes("tier2") || s.includes("flex")) return FLEX_TABLE;
  if (s.includes("canada") && s.includes("w2")) return CA_W2_TABLE;
  if (USA_W2_TABLE && s.includes("usa") && s.includes("w2")) return USA_W2_TABLE;
  return null;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function ufhExec(supabase: any, sql: string) {
  const { error } = await supabase.rpc("ufh_exec", { sql });
  if (error) throw new Error("ufh_exec failed: " + error.message);
}

async function ensureTableAndColumns(supabase: any, table: string, cols: string[]) {
  await ufhExec(supabase, `create table if not exists public.${table} (id bigserial primary key);`);
  for (const c of cols) {
    if (!c || c === "id") continue;
    await ufhExec(supabase, `alter table public.${table} add column if not exists ${c} text;`);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });

  let p = url.pathname;
  p = p.replace(/^\/functions\/v1\/api\b/, "");
  p = p.replace(/^\/api\b/, "");
  if (!p.startsWith("/")) p = "/" + p;

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return jsonResponse(origin, { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const supabase = getSupabase();

    if (p === "/" || p === "/health") {
      return jsonResponse(origin, {
        ok: true,
        tables: { TECH_TABLE, ZIP_TABLE, FLEX_TABLE, CA_W2_TABLE, CA_POSTAL_TABLE, USA_W2_TABLE, ALLOWED_USERS_TABLE, DEVICE_LOCKS_TABLE },
      });
    }

    if (p === "/auth/authorize" && (req.method === "POST" || req.method === "GET")) {
      const auth = await requireAuthorizedUser(req, supabase, origin);
      if (auth instanceof Response) return auth;
      return jsonResponse(origin, {
        ok: true,
        user: { email: auth.email, username: auth.username, role: auth.role, is_owner: auth.owner },
        device: auth.device,
      });
    }

    if (p === "/admin/access/list" && req.method === "GET") {
      const admin = await requireAdminUser(req, supabase, origin);
      if (admin instanceof Response) return admin;

      const { data: users, error: usersError } = await supabase.from(ALLOWED_USERS_TABLE).select("*").order("email", { ascending: true });
      if (usersError) {
        if (isMissingRelationError(usersError)) return jsonResponse(origin, { ok: false, error: setupMissingReason() }, 500);
        throw usersError;
      }
      const { data: devices, error: devicesError } = await supabase.from(DEVICE_LOCKS_TABLE).select("*");
      if (devicesError) {
        if (isMissingRelationError(devicesError)) return jsonResponse(origin, { ok: false, error: setupMissingReason() }, 500);
        throw devicesError;
      }
      const deviceMap = new Map((devices || []).map((d: any) => [normalizeIdentity(d.email), d]));
      const rows = (users || []).map((u: any) => ({ ...u, ...(deviceMap.get(normalizeIdentity(u.email)) || {}) }));
      return jsonResponse(origin, { ok: true, rows });
    }

    if (p === "/admin/access/upsert" && req.method === "POST") {
      const admin = await requireAdminUser(req, supabase, origin);
      if (admin instanceof Response) return admin;
      const body = await readJson(req);
      const email = normalizeIdentity(body.email || "");
      if (!email) return jsonResponse(origin, { ok: false, error: "Email is required" }, 400);
      if (!isCompanyEmail(email)) return jsonResponse(origin, { ok: false, error: `Only @${COMPANY_DOMAIN} emails are allowed` }, 400);
      const payload: any = {
        email,
        username: String(body.username || usernameFromEmail(email)).trim(),
        role: String(body.role || "user").trim() || "user",
        is_active: body.is_active !== false,
        can_sign_up: body.can_sign_up !== false,
        note: String(body.note || "").trim(),
        approved_by: admin.email,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from(ALLOWED_USERS_TABLE).upsert(payload, { onConflict: "email" }).select("*").single();
      if (error) {
        if (isMissingRelationError(error)) return jsonResponse(origin, { ok: false, error: setupMissingReason() }, 500);
        throw error;
      }
      return jsonResponse(origin, { ok: true, row: data });
    }

    if (p === "/admin/access/reset-device" && req.method === "POST") {
      const admin = await requireAdminUser(req, supabase, origin);
      if (admin instanceof Response) return admin;
      const body = await readJson(req);
      const email = normalizeIdentity(body.email || "");
      if (!email) return jsonResponse(origin, { ok: false, error: "Email is required" }, 400);
      const { error } = await supabase.from(DEVICE_LOCKS_TABLE).delete().eq("email", email);
      if (error && !isMissingRelationError(error)) throw error;
      return jsonResponse(origin, { ok: true, email, reset: true });
    }

    if (p === "/intl/suppliers") {
      const auth = await requireAuthorizedUser(req, supabase, origin);
      if (auth instanceof Response) return auth;
      return jsonResponse(origin, { ok: true, data: INTL_SUPPLIERS_DB });
    }

    if (p === "/admin/techdbs/upload" && req.method === "POST") {
      const adminCheck = await requireAdminUser(req, supabase, origin);
      if (adminCheck instanceof Response) return adminCheck;
      const mode = (url.searchParams.get("mode") || "upsert").toLowerCase();
      const form = await req.formData();
      const f = form.get("file");
      if (!(f instanceof File)) return jsonResponse(origin, { ok: false, error: "Missing file" }, 400);

      const buf = new Uint8Array(await f.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });
      const report: any = {
        ok: true,
        mode,
        admin: { username: adminCheck.username, email: adminCheck.email },
        results: [] as any[],
      };

      for (const sheetName of wb.SheetNames) {
        const table = sheetToTable(sheetName);
        if (!table) {
          report.results.push({ sheet: sheetName, skipped: true, reason: "No mapping" });
          continue;
        }

        const ws = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
        if (!rawRows.length) {
          report.results.push({ sheet: sheetName, table, skipped: true, reason: "Empty sheet" });
          continue;
        }

        const colsSet = new Set<string>();
        const rows = rawRows.map((r) => {
          const o: any = {};
          for (const [k, v] of Object.entries(r)) {
            const col = normalizeCol(k);
            if (!col) continue;
            colsSet.add(col);
            o[col] = String(v ?? "");
          }
          return o;
        });

        const cols = Array.from(colsSet);
        await ensureTableAndColumns(supabase, table, cols);
        const hasTechId = cols.includes("tech_id");
        const onConflict = hasTechId ? "tech_id" : "id";
        if (mode === "replace") await ufhExec(supabase, `truncate table public.${table};`);

        let upserted = 0;
        for (const part of chunk(rows, 1000)) {
          const { error } = await supabase.from(table).upsert(part, { onConflict, ignoreDuplicates: false });
          if (error) throw new Error(`${table} upsert failed: ${error.message}`);
          upserted += part.length;
        }
        report.results.push({ sheet: sheetName, table, rows: rows.length, upserted });
      }
      return jsonResponse(origin, report);
    }

    if (p === "/oncall/techdb") {
      const auth = await requireAuthorizedUser(req, supabase, origin);
      if (auth instanceof Response) return auth;
      const table = url.searchParams.get("table") || TECH_TABLE;
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200000), 1), 200000);
      const { data, error } = await supabase.from(table).select("*").range(0, limit - 1);
      if (error) throw error;
      const rows = (data || []).map((x: any) => {
        const m = buildKeyMap(x);
        return [
          String(pick(m, ["tech_id", "Tech ID", "tech id", "TechID", "techid", "id", "col_1"], "")),
          String(pick(m, ["first_name", "First Name", "first name", "firstname", "col_2"], "")),
          String(pick(m, ["last_name", "Last Name", "last name", "lastname", "col_3"], "")),
          String(pick(m, ["region", "Region", "col_4"], "")),
          String(pick(m, ["zone", "Zone", "col_5"], "")),
          String(pick(m, ["type", "Type", "col_6"], "")),
          String(pick(m, ["city", "City", "col_7"], "")),
          String(pick(m, ["state", "State", "col_8"], "")),
          String(pick(m, ["zip", "Zip", "zip_code", "Zip Code", "postal", "Postal", "col_9"], "")),
        ];
      });
      return jsonResponse(origin, { ok: true, table, rows });
    }

    if (p === "/oncall/uszips") {
      const auth = await requireAuthorizedUser(req, supabase, origin);
      if (auth instanceof Response) return auth;
      const table = url.searchParams.get("table") || ZIP_TABLE;
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200000), 1), 200000);
      const { data, error } = await supabase.from(table).select("*").range(0, limit - 1);
      if (error) throw error;
      const rows = (data || []).map((x: any) => {
        const m = buildKeyMap(x);
        const zip = String(pick(m, ["zip", "zip_code", "Zip", "Zip Code", "col_1"], ""));
        const lat = toNum(pick(m, ["lat", "latitude", "Lat", "Latitude", "col_2"], null as any));
        const lon = toNum(pick(m, ["lon", "lng", "longitude", "Lon", "LON", "Longitude", "col_3"], null as any));
        const city = String(pick(m, ["city", "City", "col_4"], "")).trim().toLowerCase();
        const st = String(pick(m, ["state", "State", "col_5"], "")).trim().toUpperCase();
        return [zip, lat, lon, city, st];
      });
      return jsonResponse(origin, { ok: true, table, rows });
    }

    if (p === "/canada/w2techdb") {
      const auth = await requireAuthorizedUser(req, supabase, origin);
      if (auth instanceof Response) return auth;
      const table = url.searchParams.get("table") || CA_W2_TABLE;
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 5000), 1), 50000);
      const { data, error } = await supabase.from(table).select("*").range(0, limit - 1);
      if (error) throw error;
      const techs = (data || []).map((x: any) => {
        const m = buildKeyMap(x);
        return {
          tech_id: String(pick(m, ["tech_id", "Tech ID", "tech id", "id"], "")),
          name: String(pick(m, ["name", "Name", "full_name", "Full Name", "tech_name"], "")),
          city: String(pick(m, ["city", "City"], "")),
          province: String(pick(m, ["province", "prov", "state", "State"], "")).toUpperCase(),
          postal: String(pick(m, ["postal", "postal_code", "Zip", "zip"], "")).replace(/\s+/g, "").toUpperCase(),
        };
      });
      return jsonResponse(origin, { ok: true, table, techs });
    }

    if (p === "/canada/postalprov") {
      const auth = await requireAuthorizedUser(req, supabase, origin);
      if (auth instanceof Response) return auth;
      const table = url.searchParams.get("table") || CA_POSTAL_TABLE;
      if (!table) return jsonResponse(origin, { ok: true, table: "", mapping: {}, disabled: true });
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50000), 1), 200000);
      const { data, error } = await supabase.from(table).select("*").range(0, limit - 1);
      if (error) throw error;
      const mapping: Record<string, string> = {};
      for (const x of (data || []) as any[]) {
        const m = buildKeyMap(x);
        const postal = String(pick(m, ["postal", "postal_code", "col_1"], "")).replace(/\s+/g, "").toUpperCase();
        const prov = String(pick(m, ["province", "prov", "state", "col_2"], "")).toUpperCase();
        if (postal && prov) mapping[postal] = prov;
      }
      return jsonResponse(origin, { ok: true, table, mapping });
    }

    if (p.startsWith("/export/")) {
      const auth = await requireAuthorizedUser(req, supabase, origin);
      if (auth instanceof Response) return auth;
      const table = decodeURIComponent(p.split("/")[2] || "");
      if (ALLOWED_TABLES.size && !ALLOWED_TABLES.has(table)) {
        return jsonResponse(origin, { ok: false, error: "Table not allowed", table }, 403);
      }
      const format = (url.searchParams.get("format") || "json").toLowerCase();
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || (format === "aoa" ? 200000 : 500)), 1), 200000);
      const { data, error } = await supabase.from(table).select("*").range(0, limit - 1);
      if (error) throw error;
      if (format === "aoa") {
        const first = (data && data[0]) ? data[0] : {};
        const columns = Object.keys(first).filter((c) => c !== "_id");
        const rows = (data || []).map((r: any) => columns.map((c) => r[c] ?? null));
        return jsonResponse(origin, { ok: true, table, columns, rows });
      }
      return jsonResponse(origin, { ok: true, table, rows: data || [] });
    }

    return jsonResponse(origin, { ok: false, error: "Not found" }, 404);
  } catch (e) {
    console.error("ERR", e);
    return jsonResponse(origin, { ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
