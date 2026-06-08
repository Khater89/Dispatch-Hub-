/* ═══════════════════════════════════════════════════════════════════
   tool-gate.js — Drop-in admin-toggle guard for any tool
   ───────────────────────────────────────────────────────────────────
   Usage (in each tool's index.html, place in <head>):

     <script>window.__toolGateKey = 'flex_tier2';</script>
     <style id="tool-gate-hide">body{visibility:hidden}</style>
     <script defer src="../assets/tool-gate.js"></script>

   What it does:
     1. Hides body until status is resolved (no flash).
     2. After DOMContentLoaded, fetches tool status from the cloud.
     3. If enabled  → reveals the page.
     4. If disabled → replaces the page with a styled "Tool disabled" notice.
     5. Caches result in sessionStorage for 30s to keep navigation snappy.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  const CACHE_TTL_MS = 30 * 1000;
  const HIDE_STYLE_ID = 'tool-gate-hide';

  function reveal(){
    const s = document.getElementById(HIDE_STYLE_ID);
    if (s) s.remove();
  }

  function apiBase(){
    return String(window.API_BASE || '').replace(/\/+$/, '');
  }

  function cacheGet(key){
    try {
      const raw = sessionStorage.getItem('ufh_tg_' + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || (Date.now() - obj.ts) > CACHE_TTL_MS) return null;
      return obj;
    } catch(_){ return null; }
  }

  function cacheSet(key, value){
    try {
      sessionStorage.setItem('ufh_tg_' + key, JSON.stringify({
        ts: Date.now(),
        enabled: value.enabled,
        tool_name: value.tool_name,
        disabled_message: value.disabled_message || null
      }));
    } catch(_){}
  }

  async function fetchStatus(){
    if (!window.UFHAuth || !apiBase()) return null;
    try {
      await window.UFHAuth.requireSession();
      const headers = await window.UFHAuth.getAuthHeaders({ 'Accept': 'application/json' });
      const r = await fetch(apiBase() + '/tool-status', { headers });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.ok || !Array.isArray(j.tools)) return null;
      return j.tools;
    } catch(_){ return null; }
  }

  function renderDisabled(toolName, message){
    // Replace the body with a clean, themed "disabled" notice
    const safeName = String(toolName || 'This tool').replace(/[<>&]/g, '');
    const safeMsg  = String(message || 'This tool has been temporarily disabled by an administrator.').replace(/[<>&]/g, '');

    document.body.innerHTML = `
      <style>
        body { margin: 0; padding: 0; background: #060c18; color: #f1f5f9; font-family: 'Inter', system-ui, sans-serif; }
        .tg-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          background:
            radial-gradient(900px 600px at 50% 0%, rgba(245, 158, 11, 0.06), transparent 60%),
            radial-gradient(700px 500px at 50% 100%, rgba(245, 158, 11, 0.04), transparent 55%),
            #060c18;
        }
        .tg-card {
          max-width: 520px;
          width: 100%;
          background: rgba(17, 24, 39, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 20px;
          padding: 40px 32px;
          backdrop-filter: blur(14px);
          box-shadow: 0 12px 40px rgba(0,0,0,.45);
          text-align: center;
        }
        .tg-icon {
          width: 64px; height: 64px; margin: 0 auto 22px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #f59e0b;
        }
        .tg-eyebrow {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #f59e0b;
          margin-bottom: 10px;
        }
        .tg-title {
          font-family: 'Syne', system-ui, sans-serif;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin: 0 0 16px;
          color: #f1f5f9;
        }
        .tg-message {
          font-size: 15px;
          line-height: 1.6;
          color: #cbd5e1;
          margin: 0 0 28px;
          padding: 16px 18px;
          background: rgba(15, 23, 42, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-left: 3px solid #f59e0b;
          border-radius: 10px;
          text-align: left;
        }
        .tg-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .tg-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: linear-gradient(135deg, #06b6d4, #0891b2);
          color: #021018;
          font-family: 'Syne', system-ui, sans-serif;
          font-weight: 700;
          font-size: 13px;
          text-decoration: none;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: transform .15s ease, box-shadow .15s ease;
          box-shadow: 0 4px 14px rgba(6, 182, 212, .3);
        }
        .tg-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(6, 182, 212, .5); }
        .tg-btn.ghost {
          background: transparent;
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: none;
        }
        .tg-btn.ghost:hover { background: rgba(255, 255, 255, .03); color: #fff; }
      </style>
      <div class="tg-wrap">
        <div class="tg-card">
          <div class="tg-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="tg-eyebrow">Tool Unavailable</div>
          <h1 class="tg-title">${safeName} is Disabled</h1>
          <div class="tg-message">${safeMsg}</div>
          <div class="tg-actions">
            <a class="tg-btn" href="../index.html">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Back to Hub
            </a>
            <button class="tg-btn ghost" onclick="try{sessionStorage.clear()}catch(e){};location.reload();">Retry</button>
          </div>
        </div>
      </div>
    `;
    document.title = `${safeName} — Disabled`;
    reveal(); // remove the visibility:hidden style
  }

  function findToolEntry(tools, key){
    if (!Array.isArray(tools)) return null;
    return tools.find(t => t && t.tool_key === key) || null;
  }

  async function run(){
    const toolKey = window.__toolGateKey;
    if (!toolKey){
      // No key set → fail open, just reveal
      reveal();
      return;
    }

    // Try cache first (fast path: no network needed)
    const cached = cacheGet(toolKey);
    if (cached){
      if (cached.enabled === false){
        renderDisabled(cached.tool_name || toolKey, cached.disabled_message);
        return;
      }
      reveal();
      // Still refresh in background to catch changes within a session
      fetchStatus().then(tools => {
        if (!tools) return;
        const entry = findToolEntry(tools, toolKey);
        if (!entry) return;
        cacheSet(toolKey, entry);
        if (entry.enabled === false){
          renderDisabled(entry.tool_name, entry.disabled_message);
        }
      }).catch(()=>{});
      return;
    }

    // No cache → must wait for network
    const tools = await fetchStatus();
    if (!tools){
      // Fail open if we couldn't reach the API
      // (don't lock users out due to a network blip)
      reveal();
      return;
    }
    const entry = findToolEntry(tools, toolKey);
    if (!entry){
      // Tool not registered in DB → treat as enabled
      reveal();
      return;
    }
    cacheSet(toolKey, entry);
    if (entry.enabled === false){
      renderDisabled(entry.tool_name, entry.disabled_message);
    } else {
      reveal();
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  // Safety net: if anything stalls for >4s, reveal anyway
  setTimeout(reveal, 4000);
})();
