// Canada Dispatch W2 — Cloud bootstrap
// Loads CA W2 tech list from Supabase Edge Function before loading app.js
(async function(){
  const API_BASE = String(window.API_BASE || "").replace(/\/$/, "");

  // Defaults (fallback)
  window.CA_W2_TECHS = Array.isArray(window.CA_W2_TECHS) ? window.CA_W2_TECHS : [];
  window.CA_POSTAL_PROV = (window.CA_POSTAL_PROV && typeof window.CA_POSTAL_PROV === 'object') ? window.CA_POSTAL_PROV : {};
  window.CA_W2_CLOUD_ERROR = '';

  function apiUrl(path){
    const root = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;
    return `${root}${path}`;
  }

  async function getJson(url){
    async function authHeaders(){
      let headers = { 'Accept': 'application/json' };
      if (window.UFHAuth) {
        await window.UFHAuth.requireSession();
        headers = await window.UFHAuth.getAuthHeaders(headers);
      }
      return headers;
    }
    let r = await fetch(url, { method: 'GET', headers: await authHeaders() });
    if (r.status === 401 && window.UFHAuth) {
      try{
        const client = await window.UFHAuth.ensureClient();
        await client.auth.refreshSession();
        r = await fetch(url, { method: 'GET', headers: await authHeaders() });
      }catch(_){ }
    }
    if (!r.ok) throw new Error(`API error ${r.status}: ${await r.text()}`);
    return await r.json();
  }

  // Try cloud tech list (small + fast). If it fails, we keep whatever is already embedded.
  if (API_BASE) {
    try {
      const j = await getJson(apiUrl('/canada/w2techdb'));
      if (j && j.ok && Array.isArray(j.techs) && j.techs.length) {
        const usable = j.techs.filter(t => t && t.postal && (t.tech_id || t.name));
        if (!usable.length) throw new Error('Canada cloud table returned rows but no usable Tech ID/postal records.');
        window.CA_W2_TECHS = usable;
        window.CA_W2_CLOUD_SOURCE = `cloud:${j.table || 'canada_w2'}`;
      } else {
        throw new Error('Canada cloud table returned no rows.');
      }
    } catch (e) {
      window.CA_W2_CLOUD_ERROR = String(e && e.message ? e.message : e);
      console.error('Canada cloud techdb load failed:', e);
    }

    // Optional: cloud postal->province mapping (can be large)
    // Enable only if you configured CA_POSTAL_TABLE and want better precision.
    // try {
    //   const j2 = await getJson(`${API_BASE}/api/canada/postalprov`);
    //   if (j2 && j2.ok && j2.mapping && typeof j2.mapping === 'object') {
    //     window.CA_POSTAL_PROV = j2.mapping;
    //   }
    // } catch (e) { /* ignore */ }
  }

  // Now load the main app
  const s = document.createElement('script');
  s.src = 'app.js';
  document.body.appendChild(s);
})();
