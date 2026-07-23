/**
 * ══════════════════════════════════════════════════════════════
 *  DRIVE DB — Google Drive كقاعدة بيانات حقيقية
 *
 *  Priority:
 *  1. cv_data.json  — كل بيانات الـ CV
 *  2. CV PDFs       — مرجع للقراءة
 *  3. cert files    — صور/PDF الشهادات
 *
 *  Flow:
 *  - فتح الـ App → يقرأ من localStorage فوراً (offline)
 *                → في الخلفية يجيب Drive ويحدّث
 *  - أي تعديل   → localStorage فوراً + Drive بعد 3 ثواني
 *  - رفع شهادة  → مباشرة لـ Drive
 * ══════════════════════════════════════════════════════════════
 */
(function () {
  "use strict";

  const DB_FILE   = "cv_data.json";
  const DRIVE_API = "https://www.googleapis.com/drive/v3";
  const UPLOAD    = "https://www.googleapis.com/upload/drive/v3";
  const LOCAL_KEY = "cv_local_data";
  const TOKEN_KEY = "cv_google_token_v2";
  const FILE_KEY  = "cv_db_file_id";

  let token     = null;
  let dbFileId  = null;
  let dirty     = false;
  let syncTimer = null;

  const $ = id => document.getElementById(id);

  // ── Token ────────────────────────────────────────────────────
  function saveToken(t, expiresIn) {
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
        t, exp: Date.now() + (expiresIn - 120) * 1000
      }));
    } catch(_) {}
  }
  function loadToken() {
    try {
      const s = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
      if (!s || Date.now() > s.exp) { sessionStorage.removeItem(TOKEN_KEY); return null; }
      return s.t;
    } catch(_) { return null; }
  }
  function getToken() { return token || loadToken(); }

  // ── Local cache ──────────────────────────────────────────────
  function localSave(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch(_) {}
  }
  function localLoad() {
    try { const r = localStorage.getItem(LOCAL_KEY); return r ? JSON.parse(r) : null; }
    catch(_) { return null; }
  }

  // ── Drive fetch helper ───────────────────────────────────────
  async function df(path, opts = {}) {
    const tk = getToken();
    if (!tk) throw new Error("NOT_SIGNED_IN");
    const res = await fetch(`${DRIVE_API}/${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${tk}`, ...(opts.headers || {}) }
    });
    if (res.status === 401) { token = null; sessionStorage.removeItem(TOKEN_KEY); throw new Error("SESSION_EXPIRED"); }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
    return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
  }

  // ── Find cv_data.json ────────────────────────────────────────
  async function findDbFile() {
    try { dbFileId = localStorage.getItem(FILE_KEY) || null; } catch(_) {}
    if (dbFileId) return dbFileId;

    const folderId = (window.DRIVE_CONFIG || {}).folder_id || "";
    const q = folderId
      ? `name='${DB_FILE}' and '${folderId}' in parents and trashed=false`
      : `name='${DB_FILE}' and trashed=false`;

    const data = await df(`files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
    if (data.files?.length) {
      dbFileId = data.files[0].id;
      try { localStorage.setItem(FILE_KEY, dbFileId); } catch(_) {}
    }
    return dbFileId;
  }

  // ── Upload JSON to Drive ─────────────────────────────────────
  async function uploadJson(data, fileId) {
    const tk       = getToken();
    const body     = JSON.stringify(data, null, 2);
    const blob     = new Blob([body], { type: "application/json" });
    const folderId = (window.DRIVE_CONFIG || {}).folder_id || "";

    if (fileId) {
      const res = await fetch(`${UPLOAD}/files/${fileId}?uploadType=media`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body
      });
      if (!res.ok) throw new Error(`Upload failed HTTP ${res.status}`);
      return fileId;
    }

    // Create new
    const meta = { name: DB_FILE };
    if (folderId) meta.parents = [folderId];
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    form.append("file", blob);

    const res = await fetch(`${UPLOAD}/files?uploadType=multipart`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}` },
      body: form
    });
    if (!res.ok) throw new Error(`Create failed HTTP ${res.status}`);
    const d = await res.json();
    dbFileId = d.id;
    try { localStorage.setItem(FILE_KEY, dbFileId); } catch(_) {}
    return dbFileId;
  }

  // ── Upload any file (cert/PDF) ───────────────────────────────
  async function uploadFile(file, name) {
    const tk       = getToken();
    if (!tk) throw new Error("سجّل الدخول أولاً");
    const folderId = (window.DRIVE_CONFIG || {}).folder_id || "";

    const meta = { name: name || file.name };
    if (folderId) meta.parents = [folderId];

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    form.append("file", file);

    const res = await fetch(`${UPLOAD}/files?uploadType=multipart`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}` },
      body: form
    });
    if (!res.ok) throw new Error(`File upload failed HTTP ${res.status}`);
    const d = await res.json();

    // Make readable by anyone (for cert display)
    await fetch(`${DRIVE_API}/files/${d.id}/permissions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" })
    }).catch(() => {});

    return {
      id:       d.id,
      viewUrl:  `https://drive.google.com/file/d/${d.id}/view`,
      imageUrl: `https://drive.google.com/uc?export=view&id=${d.id}`
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  LOAD from Drive (background, non-blocking)
  // ══════════════════════════════════════════════════════════════
  async function syncFromDrive() {
    setStatus("sync");
    try {
      await findDbFile();

      if (!dbFileId) {
        // First time — push current data.js to Drive
        const currentData = window.CV_DATA;
        if (currentData) {
          await uploadJson(currentData, null);
          localSave(currentData);
          setStatus("ok");
          toast("✅ تم رفع بياناتك لـ Drive لأول مرة");
        } else {
          setStatus("idle");
        }
        return;
      }

      // Download
      const text   = await df(`files/${dbFileId}?alt=media`);
      const remote = JSON.parse(text);

      // Compare with local — use whichever is newer
      // (Simple strategy: Drive wins unless local has unsaved changes)
      if (!dirty) {
        applyData(remote);
        localSave(remote);
        setStatus("ok");
      } else {
        // Local has unsaved changes — push local to Drive
        await syncToDrive();
      }

    } catch(e) {
      if (e.message === "NOT_SIGNED_IN" || e.message === "SESSION_EXPIRED") {
        setStatus("auth");
      } else {
        console.warn("[DriveDB] sync error:", e.message);
        setStatus("offline");
      }
    }
  }

  // ── Apply data to running app ────────────────────────────────
  function applyData(data) {
    if (!data) return;
    window.CV_DATA = data;
    const app = window.__cvApp;
    if (!app) return;
    try {
      const d = app.getData();
      Object.assign(d, data);
      app.renderTabs?.();
      app.renderBranches?.();
      app.renderAll?.();
    } catch(e) { console.warn("[DriveDB] applyData:", e); }
  }

  // ══════════════════════════════════════════════════════════════
  //  SAVE to Drive (debounced)
  // ══════════════════════════════════════════════════════════════
  function scheduleSave() {
    dirty = true;
    setStatus("pending");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncToDrive, 3000);
  }

  async function syncToDrive() {
    if (!getToken()) { setStatus("offline"); return; }
    const data = window.__cvApp?.getData() || window.CV_DATA;
    if (!data) return;

    localSave(data);
    setStatus("saving");
    try {
      dbFileId = await uploadJson(data, dbFileId);
      dirty = false;
      setStatus("ok");
    } catch(e) {
      console.error("[DriveDB] save error:", e);
      setStatus("offline");
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  GOOGLE SIGN-IN (GIS)
  // ══════════════════════════════════════════════════════════════
  function signIn() {
    const clientId = window.GOOGLE_CLIENT_ID || "";

    // Show helpful message if Client ID not configured
    if (!clientId || clientId.includes("YOUR_GOOGLE")) {
      const msg = document.getElementById("driveNoConfigMsg");
      if (msg) msg.style.display = "block";
      toast("⚠️ لازم تضيف Google Client ID في google_config.js أولاً — راجع GUIDE.md", 6000);
      return;
    }

    // Must be served from http/https for OAuth to work
    if (location.protocol === "file:") {
      toast("⚠️ OAuth لا يعمل من ملف محلي — ارفع على GitHub Pages أو شغّل: python3 -m http.server 8080", 7000);
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      toast("⚠️ جاري تحميل Google — انتظر ثانية وأعد المحاولة", 4000);
      return;
    }

    setSignInBtn(true);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: async (resp) => {
        if (resp.error) {
          toast("⚠️ فشل تسجيل الدخول: " + resp.error, 5000);
          setSignInBtn(false);
          return;
        }
        token = resp.access_token;
        saveToken(token, resp.expires_in);
        updateUI(true);
        await syncFromDrive();
        setSignInBtn(false);
      }
    });
    client.requestAccessToken({ prompt: "" });
  }

  function signOut() {
    token = null;
    sessionStorage.removeItem(TOKEN_KEY);
    updateUI(false);
    setStatus("auth");
    toast("تم تسجيل الخروج من Google");
  }

  // ── Setup guide for missing Client ID ───────────────────────
  function showSetupGuide() {
    toast(`⚙️ أضف Google Client ID في google_config.js — راجع GUIDE.md للتفاصيل`, 6000);
    // Open guide in new tab if available
    const readme = document.querySelector('a[href*="GUIDE"]');
    if (!readme) {
      window.open("https://github.com", "_blank");
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  UI helpers
  // ══════════════════════════════════════════════════════════════
  const STATUS = {
    idle:    ["☁",  "#aaa",    "Drive"],
    auth:    ["🔑",  "#888",    "غير مسجّل"],
    sync:    ["⟳",  "#3b82f6", "جاري القراءة من Drive…"],
    saving:  ["⬆",  "#f59e0b", "جاري الحفظ…"],
    pending: ["●",  "#f59e0b", "تغييرات غير محفوظة"],
    ok:      ["✓",  "#10b981", "Drive محدَّث ✓"],
    offline: ["⚡",  "#f59e0b", "offline — محفوظ محلياً"],
    error:   ["⚠",  "#ef4444", "خطأ في Drive"]
  };

  function setStatus(key) {
    const el = $("driveDbStatus");
    if (!el) return;
    const [icon, color, text] = STATUS[key] || STATUS.idle;
    const spin = key === "sync" || key === "saving";
    el.innerHTML = `<span style="color:${color};font-size:11px;font-weight:700;display:flex;align-items:center;gap:4px;">
      <span style="${spin ? "display:inline-block;animation:spin .7s linear infinite;" : ""}">${icon}</span>${text}
    </span>`;
  }

  function updateUI(signedIn) {
    const signIn  = $("driveSignInBtn");
    const signOut = $("driveSignOutBtn");
    const info    = $("driveDbInfo");
    if (signIn)  signIn.style.display  = signedIn ? "none"  : "block";
    if (signOut) signOut.style.display = signedIn ? "block" : "none";
    if (info)    info.style.display    = signedIn ? "block" : "none";
  }

  function setSignInBtn(loading) {
    const btn = $("driveSignInBtn");
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
      ? `<span style="display:inline-block;animation:spin .8s linear infinite;">⟳</span> جاري تسجيل الدخول…`
      : `<svg width="16" height="16" viewBox="0 0 24 24" style="flex-shrink:0">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg> تسجيل الدخول بـ Google`;
  }

  let toastTimer;
  function toast(msg, ms = 4000) {
    let t = $("driveDbToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "driveDbToast";
      t.style.cssText = "position:fixed;bottom:20px;right:20px;background:#1a1a2e;color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;font-weight:700;z-index:99998;box-shadow:0 8px 24px rgba(0,0,0,.3);transition:opacity .3s;";
      document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = "0"; }, ms);
  }

  // ══════════════════════════════════════════════════════════════
  //  PATCH renderAll for auto-save
  // ══════════════════════════════════════════════════════════════
  function patchApp() {
    const app = window.__cvApp;
    if (!app) return;
    const orig = app.renderAll;
    app.renderAll = function() {
      orig.call(this);
      if (getToken()) scheduleSave();
      else {
        const d = app.getData();
        if (d) localSave(d);
      }
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════════
  window.__driveDB = {
    isSignedIn:    () => !!getToken(),
    uploadFile,
    scheduleSave,
    syncNow:       syncToDrive
  };

  // ══════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════
  window.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);

    // Step 1: Load from local cache immediately (fast)
    const cached = localLoad();
    if (cached) {
      applyData(cached);
      setStatus("offline");
    }

    // Step 2: If we have a token, sync from Drive in background
    const cached_token = loadToken();
    if (cached_token) {
      token = cached_token;
      updateUI(true);
      // Background sync
      setTimeout(() => syncFromDrive(), 500);
    } else {
      setStatus("auth");
      updateUI(false);
    }

    // Wire buttons
    $("driveSignInBtn") ?.addEventListener("click", signIn);
    $("driveSignOutBtn")?.addEventListener("click", signOut);
    $("driveSaveNowBtn")?.addEventListener("click", async () => {
      await syncToDrive();
      toast("✅ تم الحفظ في Drive");
    });

    // Patch app
    const tryPatch = setInterval(() => {
      if (window.__cvApp) { clearInterval(tryPatch); patchApp(); }
    }, 100);

    // Save on page unload
    window.addEventListener("beforeunload", () => {
      if (dirty && getToken()) syncToDrive();
      else if (dirty) {
        const d = window.__cvApp?.getData() || window.CV_DATA;
        if (d) localSave(d);
      }
    });
  });

})();
