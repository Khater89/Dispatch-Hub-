/* ═══════════════════════════════════════════════════════════════════
   hub-tool-status.js — Hub landing page integration
   ───────────────────────────────────────────────────────────────────
   Usage (in the Hub's index.html, near the bottom of <body>):

     <script defer src="assets/hub-tool-status.js"></script>

   How it works:
     1. After DOMContentLoaded + auth, fetches /tool-status.
     2. For each element with [data-tool-key="<key>"], if the tool is
        disabled, applies a "tg-card-disabled" overlay and intercepts
        clicks to show the disabled reason.
     3. Reveals any element with [data-admin-only] only if the user
        is an admin (so you can hide the Admin button by default).

   To wire your Hub's tool cards:
     <a href="flex_webapp_v8/index.html" data-tool-key="flex_tier2">…</a>

   To wire your Admin button:
     <a href="admin/index.html" data-admin-only style="display:none">Admin</a>
   ═══════════════════════════════════════════════════════════════════ */
(function(){

  function injectStyles(){
    if (document.getElementById('hub-tool-status-styles')) return;
    const css = `
      [data-tool-key].tg-card-disabled {
        position: relative;
        opacity: 0.55;
        filter: grayscale(0.5);
        cursor: not-allowed !important;
      }
      [data-tool-key].tg-card-disabled::after {
        content: 'DISABLED';
        position: absolute;
        top: 12px; right: 12px;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.14em;
        padding: 4px 9px;
        border-radius: 999px;
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
        border: 1px solid rgba(245, 158, 11, 0.35);
        pointer-events: none;
        z-index: 5;
        backdrop-filter: blur(4px);
      }
      [data-admin-only] { display: none; }
      [data-admin-only].is-admin-visible { display: inline-flex; }

      /* Toast for disabled-click feedback */
      .tg-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        z-index: 99999;
        max-width: 90vw;
        padding: 14px 20px;
        background: rgba(17, 24, 39, 0.95);
        border: 1px solid rgba(245, 158, 11, 0.35);
        border-left: 3px solid #f59e0b;
        border-radius: 12px;
        color: #f1f5f9;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        backdrop-filter: blur(14px);
        box-shadow: 0 14px 40px rgba(0,0,0,.5);
        opacity: 0;
        transition: transform .25s cubic-bezier(.4,0,.2,1), opacity .25s;
      }
      .tg-toast.is-visible { opacity: 1; transform: translateX(-50%) translateY(0); }
      .tg-toast strong { color: #f59e0b; display: block; font-size: 12px;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        letter-spacing: 0.12em; text-transform: uppercase;
        margin-bottom: 4px; font-weight: 500; }
    `;
    const el = document.createElement('style');
    el.id = 'hub-tool-status-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function apiBase(){ return String(window.API_BASE || '').replace(/\/+$/, ''); }

  function showToast(toolName, message){
    document.querySelectorAll('.tg-toast').forEach(t => t.remove());
    const div = document.createElement('div');
    div.className = 'tg-toast';
    const safeName = String(toolName || 'This tool').replace(/[<>&]/g, '');
    const safeMsg  = String(message || 'This tool has been disabled by an administrator.').replace(/[<>&]/g, '');
    div.innerHTML = `<strong>${safeName} · Disabled</strong>${safeMsg}`;
    document.body.appendChild(div);
    requestAnimationFrame(() => div.classList.add('is-visible'));
    setTimeout(() => {
      div.classList.remove('is-visible');
      setTimeout(() => div.remove(), 250);
    }, 4500);
  }

  async function fetchStatus(){
    if (!window.UFHAuth || !apiBase()) return null;
    try {
      await window.UFHAuth.requireSession();
      const headers = await window.UFHAuth.getAuthHeaders({ 'Accept': 'application/json' });
      const r = await fetch(apiBase() + '/tool-status', { headers });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.ok) return null;
      return { tools: Array.isArray(j.tools) ? j.tools : [], is_admin: !!j.is_admin };
    } catch(_){ return null; }
  }

  function applyToCards(toolsByKey){
    const cards = document.querySelectorAll('[data-tool-key]');
    cards.forEach(card => {
      const key = card.getAttribute('data-tool-key');
      const entry = toolsByKey.get(key);
      if (!entry) return; // Tool not in DB — leave it alone

      if (entry.enabled === false){
        card.classList.add('tg-card-disabled');
        card.setAttribute('aria-disabled', 'true');
        card.setAttribute('title', `Disabled: ${entry.disabled_message || 'No reason provided'}`);

        // Intercept click → toast instead of navigating
        card.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showToast(entry.tool_name, entry.disabled_message);
        }, { capture: true });

        // Block keyboard activation too
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' '){
            e.preventDefault();
            e.stopPropagation();
            showToast(entry.tool_name, entry.disabled_message);
          }
        }, { capture: true });
      } else {
        card.classList.remove('tg-card-disabled');
        card.removeAttribute('aria-disabled');
        card.removeAttribute('title');
      }
    });
  }

  function applyAdminVisibility(isAdmin){
    document.querySelectorAll('[data-admin-only]').forEach(el => {
      if (isAdmin) el.classList.add('is-admin-visible');
      else el.classList.remove('is-admin-visible');
    });
  }

  async function run(){
    injectStyles();
    const data = await fetchStatus();
    if (!data) return; // Network/auth failure → leave everything as-is

    const byKey = new Map();
    for (const t of data.tools){
      if (t && t.tool_key) byKey.set(t.tool_key, t);
    }
    applyToCards(byKey);
    applyAdminVisibility(data.is_admin);

    // Expose for other scripts / debugging
    window.__hubToolStatus = { tools: data.tools, is_admin: data.is_admin };
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
