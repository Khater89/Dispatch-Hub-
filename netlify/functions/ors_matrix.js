// Netlify Function: ORS Matrix (Canada Dispatch W2)
// Exposes: POST /api/canada/ors_matrix  (via netlify.toml redirect)
// Body: { ticket_postal: "K1A 0B1", tech_postals: ["M5V 2T6", ...] }
// Returns: { ok: true, distances_km: [..], durations_min: [..] }
//
// Setup:
// - Add ORS_API_KEY in Netlify environment variables.

const ORS_KEY = process.env.ORS_API_KEY || process.env.ORS_KEY || "";

const ORS_GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";
const ORS_MATRIX_URL = "https://api.openrouteservice.org/v2/matrix/driving-car";

// Warm-invocation cache (best-effort)
const GEO_CACHE = new Map(); // key -> { lon, lat }

function resp(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(bodyObj ?? {}),
  };
}

function normPostal(x) {
  return String(x || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

async function geocodePostalCA(postal) {
  const key = normPostal(postal);
  if (!key) return null;
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key);

  const url = new URL(ORS_GEOCODE_URL);
  url.searchParams.set("text", `${key} Canada`);
  url.searchParams.set("boundary.country", "CA");
  url.searchParams.set("size", "1");
  // keep api_key param for compatibility
  url.searchParams.set("api_key", ORS_KEY);

  const r = await fetch(url.toString(), {
    headers: {
      Authorization: ORS_KEY,
    },
  });
  if (!r.ok) throw new Error(`ORS geocode failed: ${r.status}`);
  const data = await r.json();
  const feat = data?.features?.[0];
  const coords = feat?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const ll = { lon: coords[0], lat: coords[1] };
  GEO_CACHE.set(key, ll);
  return ll;
}

async function matrixKmMin(sourceLL, destLLs) {
  const locations = [[sourceLL.lon, sourceLL.lat], ...destLLs.map((d) => [d.lon, d.lat])];
  const destinations = destLLs.map((_, i) => i + 1);

  const body = {
    locations,
    sources: [0],
    destinations,
    metrics: ["distance", "duration"],
    units: "km",
  };

  const r = await fetch(ORS_MATRIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: ORS_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`ORS matrix failed: ${r.status} ${t.slice(0, 200)}`);
  }

  const data = await r.json();
  const distances = data?.distances?.[0] || [];
  const durations = data?.durations?.[0] || [];

  return { distances, durations };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return resp(200, { ok: true });
  if (event.httpMethod !== "POST") return resp(405, { ok: false, error: "Method not allowed" });

  if (!ORS_KEY) return resp(500, { ok: false, error: "Missing ORS_API_KEY environment variable" });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { ok: false, error: "Invalid JSON body" });
  }

  const ticket_postal = payload.ticket_postal;
  const tech_postals = Array.isArray(payload.tech_postals) ? payload.tech_postals : [];

  const ticket = normPostal(ticket_postal);
  const tech = tech_postals.map(normPostal).filter(Boolean).slice(0, 40);

  if (!ticket || tech.length === 0) {
    return resp(400, { ok: false, error: "ticket_postal and tech_postals are required" });
  }

  try {
    const src = await geocodePostalCA(ticket);
    if (!src) return resp(200, { ok: false, error: "Could not geocode ticket_postal" });

    const destsRaw = await Promise.all(tech.map(geocodePostalCA));

    // Keep alignment: compute matrix only for valid dests, then expand back.
    const validIdx = [];
    const validDests = [];
    destsRaw.forEach((ll, i) => {
      if (ll) {
        validIdx.push(i);
        validDests.push(ll);
      }
    });

    if (validDests.length === 0) {
      return resp(200, { ok: false, error: "Could not geocode any tech_postals" });
    }

    const { distances, durations } = await matrixKmMin(src, validDests);

    const distances_km = new Array(tech.length).fill(null);
    const durations_min = new Array(tech.length).fill(null);

    validIdx.forEach((origIdx, j) => {
      const d = distances[j];
      const t = durations[j];
      distances_km[origIdx] = typeof d === "number" ? d : null;
      durations_min[origIdx] = typeof t === "number" ? t / 60 : null;
    });

    return resp(200, { ok: true, distances_km, durations_min });
  } catch (e) {
    return resp(200, { ok: false, error: String(e?.message || e) });
  }
};
