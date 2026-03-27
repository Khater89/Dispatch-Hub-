
(function(){
  const STATE = {
    client: null,
    initPromise: null,
    readyPromise: null,
    readyResolve: null,
    readyReject: null,
    overlay: null,
    statusEl: null,
    infoEl: null,
    emailEl: null,
    passwordEl: null,
    userBadge: null,
    options: {}
  };

  const DEFAULTS = {
    appName: 'Unified Finder Hub',
    ownerUsername: 'khater',
    allowedEmails: ['akhater@acuative.com'],
    mountUserBadge: true
  };

  function normalize(v){
    return String(v || '').trim().toLowerCase();
  }

  function cfg(){
    const raw = window.UFH_AUTH_CONFIG || {};
    const allowedEmails = Array.isArray(raw.allowedEmails) ? raw.allowedEmails.map(normalize).filter(Boolean) : [];
    return Object.assign({}, DEFAULTS, raw, { allowedEmails });
  }

  function configErrors(){
    const c = cfg();
    const errs = [];
    if (!c.supabaseUrl) errs.push('Missing supabaseUrl in assets/auth-config.js');
    if (!c.supabaseAnonKey || String(c.supabaseAnonKey).includes('REPLACE_WITH_SUPABASE_ANON_KEY')) {
      errs.push('Replace supabaseAnonKey in assets/auth-config.js');
    }
    return errs;
  }

  function ensureStyle(){
    if (document.getElementById('ufh-auth-style')) return;
    const style = document.createElement('style');
    style.id = 'ufh-auth-style';
    style.textContent = `
      #ufh-auth-overlay {
        position: fixed; inset: 0; z-index: 2147483646;
        display: none; align-items: center; justify-content: center;
        background:
          radial-gradient(900px 500px at 15% 0%, rgba(96,165,250,.18), transparent 60%),
          radial-gradient(800px 400px at 85% 10%, rgba(52,211,153,.15), transparent 55%),
          rgba(6, 11, 24, .92);
        padding: 20px;
      }
      #ufh-auth-overlay.show { display: flex; }
      .ufh-auth-card {
        width: min(460px, 96vw);
        color: #e5e7eb;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 22px;
        padding: 22px 20px 18px;
        background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
        box-shadow: 0 22px 60px rgba(0,0,0,.45);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      .ufh-auth-card h2 { margin: 0 0 8px; font-size: 24px; color: #fff; }
      .ufh-auth-muted { color: #b8c2d3; font-size: 13px; line-height: 1.5; }
      .ufh-auth-row { display: grid; gap: 10px; margin-top: 14px; }
      .ufh-auth-card label { display:block; font-weight: 700; font-size: 13px; margin-bottom: 6px; color:#fff; }
      .ufh-auth-card input {
        width: 100%; padding: 12px 13px; border-radius: 12px; border: 1px solid rgba(255,255,255,.16);
        background: rgba(255,255,255,.06); color: #fff; outline: none;
      }
      .ufh-auth-card input::placeholder { color: #c7cedb; opacity: .75; }
      .ufh-auth-card input:focus { border-color: rgba(96,165,250,.7); box-shadow: 0 0 0 4px rgba(96,165,250,.15); }
      .ufh-auth-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
      .ufh-auth-btn {
        appearance:none; border:1px solid rgba(255,255,255,.16); border-radius: 12px;
        padding: 11px 14px; cursor:pointer; font-weight: 700; color:#fff;
        background: rgba(255,255,255,.06);
      }
      .ufh-auth-btn.primary {
        border-color: rgba(37,99,235,.8);
        background: linear-gradient(135deg, rgba(37,99,235,.95), rgba(59,130,246,.88));
      }
      .ufh-auth-status {
        margin-top: 14px; border-radius: 12px; padding: 11px 12px; font-size: 13px;
        border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); color: #dbe4f5;
      }
      .ufh-auth-status.error { border-color: rgba(248,113,113,.45); background: rgba(127,29,29,.22); color: #fecaca; }
      .ufh-auth-status.ok { border-color: rgba(74,222,128,.45); background: rgba(20,83,45,.22); color: #bbf7d0; }
      .ufh-auth-owner { margin-top: 8px; color:#93c5fd; font-weight:700; font-size:13px; }
      .ufh-auth-badge {
        position: fixed; right: 14px; top: 14px; z-index: 2147483645;
        display:flex; gap:10px; align-items:center;
        padding: 10px 12px; border-radius: 999px;
        border: 1px solid rgba(255,255,255,.14); background: rgba(8,15,28,.88); color:#fff;
        box-shadow: 0 12px 30px rgba(0,0,0,.35);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      .ufh-auth-badge button {
        appearance:none; border:1px solid rgba(255,255,255,.14); border-radius:999px;
        padding: 7px 10px; cursor:pointer; background: rgba(255,255,255,.08); color:#fff; font-weight:700;
      }
      .ufh-auth-badge span { font-size: 12px; color:#dbe4f5; }
      .ufh-auth-spinner {
        display:inline-block; width:16px; height:16px; border-radius:50%;
        border:2px solid rgba(255,255,255,.25); border-top-color:#fff;
        animation: ufhSpin .8s linear infinite; vertical-align: -3px; margin-right: 8px;
      }
      @keyframes ufhSpin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  function setStatus(msg, kind){
    if (!STATE.statusEl) return;
    STATE.statusEl.className = 'ufh-auth-status' + (kind ? ' ' + kind : '');
    STATE.statusEl.innerHTML = msg;
  }

  function ensureOverlay(){
    if (STATE.overlay) return STATE.overlay;
    const wrap = document.createElement('div');
    wrap.id = 'ufh-auth-overlay';
    wrap.innerHTML = `
      <div class="ufh-auth-card">
        <h2>Sign in to continue</h2>
        <div id="ufh-auth-info" class="ufh-auth-muted"></div>
        <div class="ufh-auth-owner">Owner-only access: ${escapeHtml((cfg().allowedEmails || []).join(', ')) || 'configured account only'}</div>
        <div class="ufh-auth-row">
          <div>
            <label for="ufh-auth-email">Email</label>
            <input id="ufh-auth-email" type="email" autocomplete="username" placeholder="akhater@acuative.com" />
          </div>
          <div>
            <label for="ufh-auth-password">Password</label>
            <input id="ufh-auth-password" type="password" autocomplete="current-password" placeholder="Enter your password" />
          </div>
        </div>
        <div class="ufh-auth-actions">
          <button type="button" class="ufh-auth-btn primary" id="ufh-auth-signin">Sign in</button>
          <button type="button" class="ufh-auth-btn" id="ufh-auth-signup">Create owner account</button>
          <button type="button" class="ufh-auth-btn" id="ufh-auth-reset">Reset password</button>
        </div>
        <div id="ufh-auth-status" class="ufh-auth-status">Loading authentication…</div>
      </div>
    `;
    document.body.appendChild(wrap);
    STATE.overlay = wrap;
    STATE.statusEl = wrap.querySelector('#ufh-auth-status');
    STATE.infoEl = wrap.querySelector('#ufh-auth-info');
    STATE.emailEl = wrap.querySelector('#ufh-auth-email');
    STATE.passwordEl = wrap.querySelector('#ufh-auth-password');

    const c = cfg();
    STATE.infoEl.textContent = `${c.appName} now starts with Supabase login. Use the owner account to open the app and protected tools.`;
    if (c.allowedEmails[0] && !STATE.emailEl.value) STATE.emailEl.value = c.allowedEmails[0];

    wrap.querySelector('#ufh-auth-signin').addEventListener('click', signIn);
    wrap.querySelector('#ufh-auth-signup').addEventListener('click', signUp);
    wrap.querySelector('#ufh-auth-reset').addEventListener('click', resetPassword);
    STATE.passwordEl.addEventListener('keydown', function(e){
      if (e.key === 'Enter') signIn();
    });
    return wrap;
  }

  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function showOverlay(){
    ensureOverlay().classList.add('show');
  }

  function hideOverlay(){
    ensureOverlay().classList.remove('show');
  }

  async function loadSupabase(){
    if (window.supabase && typeof window.supabase.createClient === 'function') return;
    await new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      el.async = true;
      el.onload = resolve;
      el.onerror = () => reject(new Error('Failed to load Supabase JS from CDN'));
      document.head.appendChild(el);
    });
  }

  async function ensureClient(){
    if (STATE.client) return STATE.client;
    const errs = configErrors();
    if (errs.length) {
      ensureOverlay();
      showOverlay();
      setStatus(errs.map(escapeHtml).join('<br>'), 'error');
      throw new Error(errs.join(' | '));
    }
    await loadSupabase();
    const c = cfg();
    STATE.client = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return STATE.client;
  }

  function resolveReady(session){
    if (!STATE.readyResolve) return;
    STATE.readyResolve(session);
    STATE.readyResolve = null;
    STATE.readyReject = null;
  }

  function rejectReady(err){
    if (!STATE.readyReject) return;
    STATE.readyReject(err);
    STATE.readyResolve = null;
    STATE.readyReject = null;
  }

  function setReadyPromise(){
    STATE.readyPromise = new Promise((resolve, reject) => {
      STATE.readyResolve = resolve;
      STATE.readyReject = reject;
    });
  }

  function isAllowedSession(session){
    const c = cfg();
    const email = normalize(session && session.user && session.user.email);
    if (!email) return false;
    if (!c.allowedEmails.length) return true;
    return c.allowedEmails.includes(email);
  }

  function getDisplayName(session){
    const meta = (session && session.user && session.user.user_metadata) || {};
    return meta.username || meta.full_name || meta.name || (cfg().ownerUsername || 'Owner');
  }

  function mountBadge(session){
    const c = cfg();
    if (!c.mountUserBadge) return;
    if (STATE.userBadge) STATE.userBadge.remove();
    const badge = document.createElement('div');
    badge.className = 'ufh-auth-badge';
    badge.innerHTML = `<span>${escapeHtml(getDisplayName(session))} • ${escapeHtml(session.user.email || '')}</span><button type="button">Logout</button>`;
    badge.querySelector('button').addEventListener('click', async function(){
      const client = await ensureClient();
      await client.auth.signOut();
    });
    document.body.appendChild(badge);
    STATE.userBadge = badge;
  }

  async function handleSession(session){
    ensureOverlay();
    const client = await ensureClient();
    if (!session) {
      showOverlay();
      setStatus('Sign in with the owner account to open this page.', '');
      setReadyPromise();
      return null;
    }
    if (!isAllowedSession(session)) {
      const email = normalize(session && session.user && session.user.email);
      await client.auth.signOut();
      showOverlay();
      setStatus(`This account is not allowed here: <b>${escapeHtml(email || 'unknown')}</b>`, 'error');
      rejectReady(new Error('Account not allowed'));
      setReadyPromise();
      return null;
    }
    hideOverlay();
    mountBadge(session);
    resolveReady(session);
    window.dispatchEvent(new CustomEvent('ufh-auth-ready', { detail: { session, user: session.user, client } }));
    return session;
  }

  async function signIn(){
    try {
      const client = await ensureClient();
      const email = String(STATE.emailEl && STATE.emailEl.value || '').trim();
      const password = String(STATE.passwordEl && STATE.passwordEl.value || '').trim();
      if (!email || !password) {
        setStatus('Enter email and password first.', 'error');
        return;
      }
      setStatus('<span class="ufh-auth-spinner"></span>Signing in…', '');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await handleSession(data.session || null);
      setStatus('Signed in successfully.', 'ok');
    } catch (err) {
      setStatus(escapeHtml(err && err.message ? err.message : String(err)), 'error');
    }
  }

  async function signUp(){
    try {
      const client = await ensureClient();
      const c = cfg();
      const email = String(STATE.emailEl && STATE.emailEl.value || '').trim();
      const password = String(STATE.passwordEl && STATE.passwordEl.value || '').trim();
      if (!email || !password) {
        setStatus('Enter email and password first.', 'error');
        return;
      }
      if (c.allowedEmails.length && !c.allowedEmails.includes(normalize(email))) {
        setStatus('Only the owner email can create an account in this app.', 'error');
        return;
      }
      setStatus('<span class="ufh-auth-spinner"></span>Creating owner account…', '');
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: c.ownerUsername,
            full_name: c.ownerUsername
          }
        }
      });
      if (error) throw error;
      if (data.session) {
        await handleSession(data.session);
        setStatus('Owner account created and signed in.', 'ok');
      } else {
        setStatus('Owner account created. Check your email if confirmation is enabled, then sign in.', 'ok');
      }
    } catch (err) {
      setStatus(escapeHtml(err && err.message ? err.message : String(err)), 'error');
    }
  }

  async function resetPassword(){
    try {
      const client = await ensureClient();
      const email = String(STATE.emailEl && STATE.emailEl.value || '').trim();
      if (!email) {
        setStatus('Enter your email first.', 'error');
        return;
      }
      setStatus('<span class="ufh-auth-spinner"></span>Sending reset email…', '');
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      setStatus('Password reset email sent.', 'ok');
    } catch (err) {
      setStatus(escapeHtml(err && err.message ? err.message : String(err)), 'error');
    }
  }

  async function getSession(){
    const client = await ensureClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function getAccessToken(){
    const session = await getSession();
    return session && session.access_token ? session.access_token : '';
  }

  async function getAuthHeaders(extra){
    const headers = Object.assign({}, extra || {});
    const token = await getAccessToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  async function requireSession(){
    if (!STATE.readyPromise) setReadyPromise();
    const session = await getSession();
    if (session && isAllowedSession(session)) {
      await handleSession(session);
      return session;
    }
    showOverlay();
    return STATE.readyPromise;
  }

  async function init(options){
    if (STATE.initPromise) return STATE.initPromise;
    STATE.options = Object.assign({}, STATE.options, options || {});
    ensureStyle();
    ensureOverlay();
    setReadyPromise();
    STATE.initPromise = (async function(){
      try {
        const client = await ensureClient();
        const { data } = await client.auth.getSession();
        await handleSession(data.session || null);
        client.auth.onAuthStateChange(function(_event, session){
          setTimeout(function(){ handleSession(session || null); }, 0);
        });
        return client;
      } catch (err) {
        showOverlay();
        setStatus(escapeHtml(err && err.message ? err.message : String(err)), 'error');
        throw err;
      }
    })();
    return STATE.initPromise;
  }

  window.UFHAuth = {
    init,
    ensureClient,
    getSession,
    getAccessToken,
    getAuthHeaders,
    requireSession
  };
})();
