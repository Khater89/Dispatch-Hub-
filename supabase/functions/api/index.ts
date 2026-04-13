// supabase/functions/api/index.ts
// Edge Function name: api
// Deploy: supabase functions deploy api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Defaults (override via Secrets)
const TECH_TABLE = Deno.env.get("TECH_TABLE") || "ars_technician";
const ZIP_TABLE  = Deno.env.get("ZIP_TABLE")  || "zipdb_v2";
const FLEX_TABLE = Deno.env.get("FLEX_TABLE") || "usa_tier_2_flex_tech";

// Canada
const CA_W2_TABLE     = Deno.env.get("CA_W2_TABLE") || "canada_w2";
const CA_POSTAL_TABLE = Deno.env.get("CA_POSTAL_TABLE") || ""; // optional mapping postal->province

// Optional
const USA_W2_TABLE = Deno.env.get("USA_W2_TABLE") || "";

// Admin token to protect write endpoints
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") || "";

// Allowed tables for /export/<table>
const ALLOWED_TABLES = new Set(
  [TECH_TABLE, ZIP_TABLE, FLEX_TABLE, CA_W2_TABLE, CA_POSTAL_TABLE, USA_W2_TABLE].filter(Boolean),
);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    // IMPORTANT: include x-admin-token to avoid browser preflight failure (Failed to fetch)
    "Access-Control-Allow-Headers":
      "content-type, authorization, apikey, x-client-info, x-admin-token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

// --- robust key picking (handles: "Tech ID" vs tech_id vs TECHID ... etc) ---
function normKey(k: string) {
  return String(k || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, ""); // remove spaces/_/-
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

// Excel -> DB helpers
function normalizeCol(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sheetToTable(sheetName: string) {
  const s = sheetName.trim().toLowerCase();

  // ARS / main tech db
  if (s.includes("ars") || s.includes("technician") || s.includes("tech db")) return TECH_TABLE;

  // Flex / Tier 2
  if (s.includes("tier 2") || s.includes("tier2") || s.includes("flex")) return FLEX_TABLE;

  // Canada W2
  if (s.includes("canada") && s.includes("w2")) return CA_W2_TABLE;

  // USA W2 (optional)
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
  // Ensure table exists
  await ufhExec(supabase, `create table if not exists public.${table} (id bigserial primary key);`);

  // Ensure columns exist (store as text to be permissive)
  for (const c of cols) {
    if (!c || c === "id") continue;
    await ufhExec(supabase, `alter table public.${table} add column if not exists ${c} text;`);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");

  // Always respond to preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors(origin) });
  }

  // Normalize path whether called as:
  //  - /functions/v1/api/...
  //  - /api/...
  //  - /...
  let p = url.pathname;
  p = p.replace(/^\/functions\/v1\/api/, "");
  p = p.replace(/^\/api/, "");
  if (!p.startsWith("/")) p = "/" + p;

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...cors(origin), "Content-Type": "application/json" } },
      );
    }

    const supabase = getSupabase();

    // --- health ---
    if (p === "/" || p === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          tables: { TECH_TABLE, ZIP_TABLE, FLEX_TABLE, CA_W2_TABLE, CA_POSTAL_TABLE, USA_W2_TABLE },
        }),
        { headers: { ...cors(origin), "Content-Type": "application/json" } },
      );
    }

    // --- ADMIN: Tech DBs Loader (Multi-Sheet) ---
    // POST /admin/techdbs/upload?mode=upsert|replace
    if (p === "/admin/techdbs/upload" && req.method === "POST") {
      const token = req.headers.get("x-admin-token") || "";
      if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...cors(origin), "Content-Type": "application/json" },
        });
      }

      const mode = (url.searchParams.get("mode") || "upsert").toLowerCase();

      const form = await req.formData();
      const f = form.get("file");
      if (!(f instanceof File)) {
        return new Response(JSON.stringify({ ok: false, error: "Missing file" }), {
          status: 400,
          headers: { ...cors(origin), "Content-Type": "application/json" },
        });
      }

      const buf = new Uint8Array(await f.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });

      const report: any = { ok: true, mode, results: [] as any[] };

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

        if (mode === "replace") {
          await ufhExec(supabase, `truncate table public.${table};`);
        }

        let upserted = 0;
        for (const part of chunk(rows, 1000)) {
          const { error } = await supabase.from(table).upsert(part, {
            onConflict,
            ignoreDuplicates: false,
          });
          if (error) throw new Error(`${table} upsert failed: ${error.message}`);
          upserted += part.length;
        }

        report.results.push({ sheet: sheetName, table, rows: rows.length, upserted });
      }

      return new Response(JSON.stringify(report, null, 2), {
        headers: { ...cors(origin), "Content-Type": "application/json" },
      });
    }

    // --- ONCALL: techdb (AOA 9 columns) ---
    if (p === "/oncall/techdb") {
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

      return new Response(JSON.stringify({ ok: true, table, rows }), {
        headers: { ...cors(origin), "Content-Type": "application/json" },
      });
    }

    // --- ONCALL: zip db (AOA: zip, lat, lon, city, state) ---
    if (p === "/oncall/uszips") {
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

      return new Response(JSON.stringify({ ok: true, table, rows }), {
        headers: { ...cors(origin), "Content-Type": "application/json" },
      });
    }

    // --- CANADA W2 techs (objects) ---
    if (p === "/canada/w2techdb") {
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

      return new Response(JSON.stringify({ ok: true, table, techs }), {
        headers: { ...cors(origin), "Content-Type": "application/json" },
      });
    }

    // --- CANADA postal->province mapping (optional table) ---
    if (p === "/canada/postalprov") {
      const table = url.searchParams.get("table") || CA_POSTAL_TABLE;
      if (!table) {
        return new Response(JSON.stringify({ ok: true, table: "", mapping: {}, disabled: true }), {
          headers: { ...cors(origin), "Content-Type": "application/json" },
        });
      }

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

      return new Response(JSON.stringify({ ok: true, table, mapping }), {
        headers: { ...cors(origin), "Content-Type": "application/json" },
      });
    }

    // --- export AOA for Flex (and any allowed table) ---
    if (p.startsWith("/export/")) {
      const table = decodeURIComponent(p.split("/")[2] || "");
      if (ALLOWED_TABLES.size && !ALLOWED_TABLES.has(table)) {
        return new Response(JSON.stringify({ ok: false, error: "Table not allowed", table }), {
          status: 403,
          headers: { ...cors(origin), "Content-Type": "application/json" },
        });
      }

      const format = (url.searchParams.get("format") || "json").toLowerCase();
      const limit = Math.min(
        Math.max(Number(url.searchParams.get("limit") || (format === "aoa" ? 200000 : 500)), 1),
        200000,
      );

      const { data, error } = await supabase.from(table).select("*").range(0, limit - 1);
      if (error) throw error;

      if (format === "aoa") {
        const first = (data && data[0]) ? data[0] : {};
        const columns = Object.keys(first).filter((c) => c !== "_id");
        const rows = (data || []).map((r: any) => columns.map((c) => r[c] ?? null));
        return new Response(JSON.stringify({ ok: true, table, columns, rows }), {
          headers: { ...cors(origin), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, table, rows: data || [] }), {
        headers: { ...cors(origin), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ERR", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message || e) }), {
      status: 500,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  }
});
