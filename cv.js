/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  cv.js — Dynamic CV Engine                                   ║
 * ║  Single source of truth. Clean state → render → edit loop.   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
(function () {
"use strict";

/* ═══════════════════════════════════════════════════════════════
   STATE — one object owns everything
═══════════════════════════════════════════════════════════════ */
const S = {
  data:          null,   // CV_DATA from data.js
  tab:           null,   // active tab id
  merge:         false,  // merge mode active
  mergeSelection:[],     // [{tabId}]
  mergeOrder:    [],     // ordered experience keys
  dateOverrides: {},     // {key: date string}
  jdTokens:      new Set(),
  searchTerm:    "",
  editMode:      false,
  branchId:      null,

  /* computed */
  profile()     { return this.mergedProfile() || this.data?.curated?.[this.tab] || {}; },
  mergedProfile(){ return this.merge ? this.data?.curated?.["__merged__"] || null : null; },
  tabs()        { return this.data?.tabs || []; },
  tabMeta()     { return this.tabs().find(t => t.id === this.tab) || {}; },

  save() {
    try { localStorage.setItem("cv_state_data", JSON.stringify(this.data)); } catch(_) {}
    window.__driveDB?.scheduleSave?.();
  },
};

/* ═══════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const norm = s => (s||"").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]/g,"").replace(/\s+/g," ").trim();
const esc  = s => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function uniq(arr, key) {
  const seen = new Set();
  return (arr||[]).filter(x => { const k = key(x); return k && !seen.has(k) ? (seen.add(k), true) : false; });
}

function scoreText(text) {
  if (!S.jdTokens.size) return 0;
  const n = norm(text);
  let score = 0;
  for (const tok of S.jdTokens) if (n.includes(tok)) score++;
  return score;
}

function parseDateEnd(dates) {
  if (!dates) return 0;
  if (/present|now|current/i.test(dates)) return 9999;
  const m = dates.match(/(\d{4})/g);
  return m ? parseInt(m[m.length-1]) : 0;
}

let toastTimer;
function toast(msg, ms=3500) {
  let el = $("cvToast");
  if (!el) {
    el = Object.assign(document.createElement("div"), {id:"cvToast"});
    Object.assign(el.style, {
      position:"fixed",bottom:"20px",left:"50%",transform:"translateX(-50%)",
      background:"#1a1a2e",color:"#fff",padding:"10px 22px",borderRadius:"12px",
      fontSize:"13px",fontWeight:"700",zIndex:"99999",boxShadow:"0 8px 24px rgba(0,0,0,.3)",
      transition:"opacity .3s",pointerEvents:"none",maxWidth:"80vw",textAlign:"center"
    });
    document.body.appendChild(el);
  }
  el.innerHTML = msg; el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.opacity = "0", ms);
}

/* ═══════════════════════════════════════════════════════════════
   MERGE ENGINE
═══════════════════════════════════════════════════════════════ */
function buildMerge() {
  const sels = S.mergeSelection.length ? S.mergeSelection : [{ tabId: S.tab }];
  const profiles = sels.map(s => S.data.curated?.[s.tabId] || {});

  // Experience — merge + dedup by company
  let exp = profiles.flatMap(p => (p.experience||[]).map(e => ({...e})));
  exp = uniq(exp, e => norm((e.company||"").slice(0,15) + (e.location||"").slice(0,8)));

  // Apply date overrides
  exp.forEach(e => {
    const key = expKey(e);
    if (S.dateOverrides[key]) e.dates = S.dateOverrides[key];
  });

  // Apply manual order if set, else sort by date
  if (S.mergeOrder.length) {
    const idx = new Map(S.mergeOrder.map((k,i) => [k,i]));
    exp.sort((a,b) => (idx.get(expKey(a))??999) - (idx.get(expKey(b))??999));
  } else {
    exp.sort((a,b) => parseDateEnd(b.dates) - parseDateEnd(a.dates));
  }

  const skills = uniq(profiles.flatMap(p => p.skills||[]), s => norm(s));
  const links  = uniq(profiles.flatMap(p => p.links||[]),  l => norm(l.url||""));
  const certs  = uniq(profiles.flatMap(p => p.certs||[]),  c => norm((c.title||c.name||"")+(c.issuer||"")));
  const summary = profiles.find(p => p.summary)?.summary || "";
  const projects = uniq(
    (S.data.projects||[]).filter(p => sels.some(s => (p.tab_ids||[]).includes(s.tabId))),
    p => norm(p.name||"")
  );

  return { summary, experience: exp, skills, links, certs, projects };
}

function expKey(e) {
  return norm((e.company||"").slice(0,15) + "|" + (e.title||"").slice(0,15));
}

function snapshotMerge() {
  const model = buildMerge();
  if (!S.data.curated) S.data.curated = {};
  S.data.curated["__merged__"] = {
    summary:    model.summary,
    experience: JSON.parse(JSON.stringify(model.experience)),
    skills:     JSON.parse(JSON.stringify(model.skills)),
    certs:      JSON.parse(JSON.stringify(model.certs)),
    links:      JSON.parse(JSON.stringify(model.links)),
    projects:   JSON.parse(JSON.stringify(model.projects)),
  };
  if (!S.mergeOrder.length) S.mergeOrder = model.experience.map(expKey);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════════════ */
function renderAll() {
  const p = S.profile();
  renderHeader();
  renderSummary(p);
  renderHighlights(p);
  renderExperience(p);
  renderProjects(p);
  renderLinks(p);
  renderSkills(p);
  renderCerts(p);
  renderCertGallery(p);
  renderEducation();
  renderMergeControls();
  renderTabs();
  renderBranches();
  if (S.editMode) setTimeout(attachEditor, 30);
}

function renderHeader() {
  const person = S.data?.person || {};
  const el = $("cvName"); if (el) el.textContent = person.name || "";
  const sub = $("cvTabSub"); if (sub) {
    sub.textContent = S.merge ? "Merged CV" : (S.tabMeta().label || "");
  }
  const contact = $("cvContact");
  if (contact) {
    const parts = [person.location, person.email, person.phone].filter(Boolean);
    contact.textContent = parts.join("  •  ");
  }
  // Topbar subtitle
  const ts = $("topbarSub");
  if (ts) ts.textContent = S.merge
    ? `Merged: ${S.mergeSelection.map(s => s.tabId).join(" + ")}`
    : S.tabMeta().subtitle || "";
}

function renderSummary(p) {
  const el = $("cvSummary"); if (!el) return;
  el.textContent = p.summary || "";
  $("cvSummaryCard").style.display = p.summary ? "" : (S.editMode ? "" : "none");
}

function renderExperience(p) {
  const wrap = $("cvExperience"); if (!wrap) return;
  const exp = p.experience || [];

  let filtered = exp;
  if (S.searchTerm) {
    filtered = exp.filter(e => {
      const blob = norm([e.title,e.company,e.location,...(e.bullets||[])].join(" "));
      return blob.includes(S.searchTerm);
    });
  }

  // Sort by JD score if JD active (but keep manual order in merge)
  if (S.jdTokens.size && !S.merge) {
    filtered = [...filtered].sort((a,b) => {
      const sa = scoreText([a.title,a.company,...(a.bullets||[])].join(" "));
      const sb = scoreText([b.title,b.company,...(b.bullets||[])].join(" "));
      return sb - sa;
    });
  }

  wrap.innerHTML = filtered.map((e,i) => {
    const jdClass = S.jdTokens.size && scoreText([e.title,...(e.bullets||[])].join(" ")) > 0 ? " relevant" : "";
    const bullets = (e.bullets||[])
      .filter(b => !S.searchTerm || norm(b).includes(S.searchTerm))
      .map(b => `<li>${esc(b)}</li>`).join("");
    return `<div class="exp-item${jdClass}" data-exp-idx="${i}">
      <div class="exp-title">${esc(e.title||"")}</div>
      <div class="exp-meta">${esc(e.company||"")}${e.location?" · "+esc(e.location):""}${e.dates?" · "+esc(e.dates):""}</div>
      ${bullets ? `<ul class="exp-bullets">${bullets}</ul>` : ""}
    </div>`;
  }).join("");

  $("cvExperienceCard").style.display = filtered.length || S.editMode ? "" : "none";
}

function renderProjects(p) {
  const wrap = $("cvProjects"); if (!wrap) return;
  const projs = p.projects
    || (S.data.projects||[]).filter(pr => (pr.tab_ids||[]).includes(S.tab));

  wrap.innerHTML = (projs||[]).map((pr,i) => `
    <div class="proj-item" data-proj-idx="${i}">
      <div class="exp-title">${esc(pr.name||pr.title||"")}</div>
      <div class="exp-meta">${esc(pr.summary||"")}</div>
      ${(pr.bullets||[]).length ? `<ul class="exp-bullets">${(pr.bullets||[]).map(b=>`<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      ${pr.url ? `<div class="proj-link"><a href="${esc(pr.url)}" target="_blank" rel="noopener">↗ Link</a></div>` : ""}
    </div>`).join("");

  $("cvProjectsCard").style.display = (projs||[]).length || S.editMode ? "" : "none";
}

function renderLinks(p) {
  const wrap = $("cvLinks"); if (!wrap) return;
  const links = p.links || [];
  wrap.innerHTML = links.map((l,i) =>
    `<div class="link-item" data-link-idx="${i}">
      <a href="${esc(l.url||"")}" target="_blank" rel="noopener">${esc(l.label||l.url||"")}</a>
    </div>`
  ).join("");
  $("cvLinksCard").style.display = links.length || S.editMode ? "" : "none";
}

function renderSkills(p) {
  const wrap = $("cvSkills"); if (!wrap) return;
  const skills = p.skills || [];
  wrap.innerHTML = skills.map((s,i) => {
    const jd = S.jdTokens.size && scoreText(s) > 0;
    return `<span class="skill-chip${jd?" relevant":""}" data-skill-idx="${i}">${esc(s)}</span>`;
  }).join("");
}

function renderCerts(p) {
  const wrap = $("cvCerts"); if (!wrap) return;
  const certs = p.certs || [];
  wrap.innerHTML = certs.map((c,i) => `
    <div class="cert-item" data-cert-idx="${i}">
      <span class="cert-name">${esc(c.title||c.name||"")}</span>
      ${c.issuer ? `<span class="cert-meta"> — ${esc(c.issuer)}</span>` : ""}
      ${c.date   ? `<span class="cert-meta"> (${esc(c.date)})</span>` : ""}
      ${c.drive_url ? `<a href="${esc(c.drive_url)}" target="_blank" class="cert-link">↗</a>` : ""}
    </div>`).join("");
  $("cvCertsCard").style.display = certs.length || S.editMode ? "" : "none";
}

function renderEducation() {
  const wrap = $("cvEducation"); if (!wrap) return;
  const edu = S.data.education || [];
  wrap.innerHTML = edu.map((e,i) => `
    <div class="edu-item" data-edu-idx="${i}">
      <span class="edu-school">${esc(e.school||e.institution||"")}</span>
      ${e.degree||e.title ? ` — <span class="edu-degree">${esc(e.degree||e.title||"")}</span>` : ""}
      ${e.major ? `<span class="edu-meta"> · ${esc(e.major)}</span>` : ""}
      ${e.year||e.dates ? `<span class="edu-meta"> (${esc(e.year||e.dates||"")})</span>` : ""}
    </div>`).join("");
}

/* ── Highlights (Key Highlights from docs + JD matching) ────── */
function renderHighlights(p) {
  const card = $("cvHighlightsCard");
  const wrap = $("cvHighlights");
  if (!card || !wrap) return;

  // In merge mode, skip highlights
  if (S.merge) { card.style.display="none"; return; }

  // Get auto_bullets for current tab
  const auto   = (S.data.auto_bullets?.[S.tab] || []).map(x => ({text: typeof x==="string"?x:x.text, score:x.score||0}));
  // Get doc highlights for current tab
  const docHls = (S.data.docs||[]).flatMap(doc => (doc.highlights?.[S.tab]||[]).map(h => ({text:h.text, score:h.score||0})));

  // Combine + dedup
  const all = [...auto, ...docHls];
  const seen = new Set();
  const unique = all.filter(x => { const k=norm(x.text); if(seen.has(k)||!k) return false; seen.add(k); return true; });

  // Score by JD if active
  const scored = unique.map(x => ({...x, jd: scoreText(x.text)})).sort((a,b)=>(b.jd+b.score/10)-(a.jd+a.score/10));

  // Show top 12
  const top = scored.slice(0, 12);

  if (!top.length) { card.style.display="none"; return; }
  card.style.display="";
  wrap.innerHTML = top.map(x => {
    const rel = x.jd > 0 ? " relevant" : "";
    return `<div class="highlight-item${rel}">${esc(x.text)}</div>`;
  }).join("");
}

/* ── Cert Gallery (images) ───────────────────────────────────── */
function renderCertGallery(p) {
  const card = $("cvCertGalleryCard");
  const wrap = $("cvCertGallery");
  if (!card || !wrap) return;

  const imgs = p.cert_images || [];
  if (!imgs.length) { card.style.display="none"; return; }
  card.style.display="";
  wrap.innerHTML = imgs.map((img,i) => `
    <div class="cert-img-item" data-img-idx="${i}">
      <img src="${esc(img.src||"")}" alt="${esc(img.title||"")}" loading="lazy" onerror="this.parentElement.style.display='none'"/>
      <div class="cert-img-title">${esc(img.title||"")}</div>
      ${img.issuer ? `<div class="cert-img-issuer">${esc(img.issuer)}</div>` : ""}
    </div>`).join("");
}

/* ── Branches (sub-tabs for tabs with branching) ─────────────── */
function renderBranches() {
  const card = $("branchesCard");
  const wrap = $("cvBranches");
  if (!card || !wrap) return;

  if (S.merge) { card.style.display="none"; return; }

  const branching = S.data.branching?.[S.tab];
  if (!branching?.branches?.length) { card.style.display="none"; return; }

  card.style.display="";
  const title = $("branchTitle");
  if (title) title.textContent = S.tabMeta().label || S.tab;

  wrap.innerHTML = "";
  branching.branches.forEach(b => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (S.branchId===b.id ? " active" : "");
    btn.innerHTML = `<b>${esc(b.label)}</b><small>${esc(b.subtitle||"")}</small>`;
    btn.onclick = () => setBranch(b.id);
    wrap.appendChild(btn);
  });
}

function setBranch(id) {
  S.branchId = id;
  renderAll();
  window.scrollTo({top:0,behavior:"smooth"});
}

/* ── Override profile() to use branch if active ─────────────── */
// Patch S.profile to check branch
const _origProfile = S.profile.bind(S);
S.profile = function() {
  if (this.merge) return this.data?.curated?.["__merged__"] || null;
  if (this.branchId && this.data?.curated_branches?.[this.tab]?.[this.branchId]) {
    return this.data.curated_branches[this.tab][this.branchId];
  }
  return this.data?.curated?.[this.tab] || {};
};

function renderTabs() {
  const wrap = $("cvTabs"); if (!wrap) return;
  wrap.innerHTML = "";

  // Merge button
  const mb = el("button","tab-btn" + (S.merge?" active":""));
  mb.innerHTML = `<b>⊕ Merged CV</b><small>Combine tabs</small>`;
  mb.onclick = () => openMergeModal();
  wrap.appendChild(mb);

  S.tabs().forEach(t => {
    const w = el("div","tab-wrapper");
    const b = el("button","tab-btn" + (t.id===S.tab&&!S.merge?" active":""));
    b.innerHTML = `<b>${esc(t.label)}</b><small>${esc(t.subtitle||"")}</small>`;
    b.onclick = () => setTab(t.id);

    // Hover actions
    const acts = el("div","tab-actions");
    const resetBtn = el("button","tab-act-btn");
    resetBtn.textContent = "↺ Reset";
    resetBtn.title = "مسح محتوى التاب";
    resetBtn.onclick = e => { e.stopPropagation(); resetTab(t.id); };

    const extractBtn = el("button","tab-act-btn tab-act-extract");
    extractBtn.textContent = "⬇ Extract";
    extractBtn.title = "استخراج من Drive";
    extractBtn.onclick = e => { e.stopPropagation(); extractFromDrive(t.id, extractBtn); };

    acts.appendChild(resetBtn);
    acts.appendChild(extractBtn);
    w.appendChild(b);
    w.appendChild(acts);
    wrap.appendChild(w);
  });

  // ＋ Add tab
  const addBtn = el("button","tab-btn tab-add-btn");
  addBtn.innerHTML = `<b>＋</b><small>إضافة تاب</small>`;
  addBtn.onclick = () => showAddTabForm();
  wrap.appendChild(addBtn);
}

function renderMergeControls() {
  const card = $("mergeControls"); if (!card) return;
  if (!S.merge) { card.style.display="none"; return; }
  card.style.display = "";

  const list = $("mergeOrderList"); if (!list) return;
  const p = S.mergedProfile();
  const exp = p?.experience || [];

  list.innerHTML = "";
  exp.forEach((e,i) => {
    const row = el("div","merge-row");
    const info = el("div","merge-info");
    info.innerHTML = `<b>${esc(e.title||"")}</b> — ${esc(e.company||"")}`;

    const dateIn = el("input","merge-date-input");
    dateIn.value = e.dates || "";
    dateIn.placeholder = "e.g. Jan 2022 – Present";
    dateIn.oninput = () => {
      e.dates = dateIn.value;
      renderExperience(p);
    };

    const btns = el("div","merge-btns");
    const up   = el("button","merge-btn"); up.textContent="↑"; up.disabled=(i===0);
    const down = el("button","merge-btn"); down.textContent="↓"; down.disabled=(i===exp.length-1);

    up.onclick = () => {
      [exp[i-1],exp[i]] = [exp[i],exp[i-1]];
      renderAll();
    };
    down.onclick = () => {
      [exp[i],exp[i+1]] = [exp[i+1],exp[i]];
      renderAll();
    };

    btns.appendChild(up);
    btns.appendChild(down);
    row.appendChild(info);
    row.appendChild(dateIn);
    row.appendChild(btns);
    list.appendChild(row);
  });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/* ═══════════════════════════════════════════════════════════════
   EDIT MODE — comprehensive inline editing
═══════════════════════════════════════════════════════════════ */
function attachEditor() {
  if (!S.editMode) return;
  const p = S.profile();

  // Header
  editInline($("cvName"), v => { if(!S.data.person) S.data.person={}; S.data.person.name=v; S.save(); renderHeader(); });
  $("cvContact")?.setAttribute("data-editable-contact","1");

  // Summary
  editInline($("cvSummary"), v => { p.summary=v; S.save(); });
  addPlusBtn("cvSummaryCard", "summary-add", "＋ إضافة ملخص", () => {
    p.summary = "اكتب ملخصك المهني هنا...";
    S.save(); renderAll();
  }, !p.summary);

  // Experience
  $("cvExperience")?.querySelectorAll(".exp-item").forEach((item, i) => {
    if (item.dataset.edit) return; item.dataset.edit="1";
    const exp = (p.experience||[])[i]; if (!exp) return;
    addDelBtn(item, () => { p.experience.splice(i,1); S.save(); renderAll(); });
    editInline(item.querySelector(".exp-title"), v => { exp.title=v; S.save(); });
    makeClickEdit(item.querySelector(".exp-meta"), () => openExpMetaForm(item, exp));
    item.querySelectorAll(".exp-bullets li").forEach((li, bi) => {
      if (li.dataset.edit) return; li.dataset.edit="1";
      addDelBtn(li, () => { exp.bullets.splice(bi,1); S.save(); renderAll(); });
      editInline(li, v => { exp.bullets[bi]=v; S.save(); });
    });
    addPlusBtn(item, "add-bullet-"+i, "＋ نقطة", () => {
      if (!exp.bullets) exp.bullets=[];
      exp.bullets.push("اكتب إنجازاً جديداً...");
      S.save(); renderAll();
    });
  });
  addPlusBtn("cvExperienceCard","add-exp","＋ إضافة خبرة", () => openAddExpForm(p));

  // Projects
  $("cvProjects")?.querySelectorAll(".proj-item").forEach((item, i) => {
    if (item.dataset.edit) return; item.dataset.edit="1";
    const projs = p.projects || (S.data.projects||[]).filter(pr=>(pr.tab_ids||[]).includes(S.tab));
    const proj = projs[i]; if (!proj) return;
    addDelBtn(item, () => {
      if (p.projects) p.projects.splice(i,1);
      else proj.tab_ids=(proj.tab_ids||[]).filter(t=>t!==S.tab);
      S.save(); renderAll();
    });
    editInline(item.querySelector(".exp-title"), v => { proj.name=proj.title=v; S.save(); });
    editInline(item.querySelector(".exp-meta"),  v => { proj.summary=v; S.save(); });
    item.querySelectorAll(".exp-bullets li").forEach((li, bi) => {
      if (li.dataset.edit) return; li.dataset.edit="1";
      addDelBtn(li, () => { proj.bullets.splice(bi,1); S.save(); renderAll(); });
      editInline(li, v => { proj.bullets[bi]=v; S.save(); });
    });
    addPlusBtn(item, "add-proj-bullet-"+i, "＋ نقطة", () => {
      if (!proj.bullets) proj.bullets=[];
      proj.bullets.push("إنجاز جديد...");
      S.save(); renderAll();
    });
  });
  addPlusBtn("cvProjectsCard","add-proj","＋ إضافة مشروع", () => openAddProjForm(p));

  // Links
  const linksCard = $("cvLinksCard");
  if (linksCard) linksCard.style.display = "";
  $("cvLinks")?.querySelectorAll(".link-item").forEach((item, i) => {
    if (item.dataset.edit) return; item.dataset.edit="1";
    const link = (p.links||[])[i]; if (!link) return;
    addDelBtn(item, () => { p.links.splice(i,1); S.save(); renderAll(); });
    makeClickEdit(item, () => openLinkForm(item, link, p));
  });
  addPlusBtn("cvLinksCard","add-link","＋ إضافة رابط", () => {
    if (!p.links) p.links=[];
    p.links.push({url:"https://", label:"رابط جديد"});
    S.save(); renderAll();
  });

  // Skills
  $("cvSkills")?.querySelectorAll(".skill-chip").forEach((chip, i) => {
    if (chip.dataset.edit) return; chip.dataset.edit="1";
    addDelBtn(chip, () => { (p.skills||[]).splice(i,1); S.save(); renderAll(); });
    editInline(chip, v => { if(p.skills) p.skills[i]=v; S.save(); });
  });
  addPlusBtn("cvSkillsCard","add-skill","＋ مهارة", () => {
    if (!p.skills) p.skills=[];
    p.skills.unshift("مهارة جديدة");
    S.save(); renderAll();
  });

  // Certs
  $("cvCerts")?.querySelectorAll(".cert-item").forEach((item, i) => {
    if (item.dataset.edit) return; item.dataset.edit="1";
    const cert = (p.certs||[])[i]; if (!cert) return;
    addDelBtn(item, () => { p.certs.splice(i,1); S.save(); renderAll(); });
    makeClickEdit(item, () => openCertForm(item, cert, p));
  });
  addPlusBtn("cvCertsCard","add-cert","＋ إضافة شهادة", () => openCertForm(null, null, p));

  // Education (global)
  $("cvEducation")?.querySelectorAll(".edu-item").forEach((item, i) => {
    if (item.dataset.edit) return; item.dataset.edit="1";
    const edu = (S.data.education||[])[i]; if (!edu) return;
    addDelBtn(item, () => { S.data.education.splice(i,1); S.save(); renderAll(); });
    makeClickEdit(item, () => openEduForm(item, edu));
  });
  addPlusBtn("cvEducationCard","add-edu","＋ إضافة تعليم", () => openEduForm(null, null));

  // Contact edit
  const contactEl = $("cvContact");
  if (contactEl && !contactEl.dataset.edit) {
    contactEl.dataset.edit="1";
    contactEl.style.cursor="pointer";
    contactEl.title="كليك لتعديل التواصل";
    contactEl.onclick = e => { if(!S.editMode) return; openContactForm(contactEl); };
  }
}

/* ── Inline text editor (double-click) ─────────────────────── */
function editInline(el, onSave) {
  if (!el || el.dataset.inlineEdit) return;
  el.dataset.inlineEdit = "1";
  el.title = (el.title||"") + " ✏ دبل-كليك لتعديل";
  el.addEventListener("dblclick", function(e) {
    if (!S.editMode) return;
    e.stopPropagation();
    if (el.querySelector("textarea,input")) return;

    const orig = el.innerHTML;
    const cur  = el.innerText || el.textContent || "";
    const isMultiline = cur.length > 60 || el.tagName === "P";

    const inp = isMultiline ? document.createElement("textarea") : document.createElement("input");
    inp.className = "cv-inline-input";
    inp.value = cur;
    if (isMultiline) { inp.rows = Math.max(2, Math.ceil(cur.length/60)); }

    function save() {
      const v = inp.value.trim();
      el.innerHTML = orig;
      if (v && v !== cur) { onSave(v); }
    }
    function cancel() { el.innerHTML = orig; }

    inp.addEventListener("blur", save);
    inp.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && !ev.shiftKey && !isMultiline) { ev.preventDefault(); inp.blur(); }
      if (ev.key === "Escape") { inp.removeEventListener("blur",save); cancel(); }
    });

    el.innerHTML = "";
    el.appendChild(inp);
    inp.focus(); inp.select();
  });
}

/* ── Click to open form ─────────────────────────────────────── */
function makeClickEdit(el, openForm) {
  if (!el || el.dataset.clickEdit) return;
  el.dataset.clickEdit="1";
  el.style.cursor="pointer";
  el.title = "✏ كليك لتعديل";
  el.addEventListener("click", e => { if (S.editMode) { e.stopPropagation(); openForm(); } });
}

/* ── Delete button ──────────────────────────────────────────── */
function addDelBtn(parent, onDelete) {
  if (parent.querySelector(".cv-del")) return;
  const btn = document.createElement("button");
  btn.className = "cv-del";
  btn.innerHTML = "✕";
  btn.title = "حذف";
  btn.onclick = e => { e.stopPropagation(); if (confirm("حذف هذا العنصر؟")) onDelete(); };
  parent.style.position="relative";
  parent.appendChild(btn);
}

/* ── Plus button ────────────────────────────────────────────── */
function addPlusBtn(parent, id, label, onClick, show=true) {
  if (!show) return;
  const container = typeof parent === "string" ? $(parent) : parent;
  if (!container || container.querySelector(`#${id}`)) return;
  const btn = document.createElement("button");
  btn.id = id;
  btn.className = "cv-add";
  btn.textContent = label;
  btn.onclick = onClick;
  container.appendChild(btn);
}

/* ═══════════════════════════════════════════════════════════════
   INLINE FORMS (no prompt() dialogs)
═══════════════════════════════════════════════════════════════ */
function inlineForm(anchorEl, html, onSave) {
  // Remove any existing form
  document.querySelectorAll(".cv-form").forEach(f => f.remove());

  const form = document.createElement("div");
  form.className = "cv-form";
  form.innerHTML = html;

  form.querySelector(".cf-save").onclick = () => { onSave(form); form.remove(); renderAll(); };
  form.querySelector(".cf-cancel").onclick = () => form.remove();

  if (anchorEl) {
    anchorEl.style.position="relative";
    anchorEl.appendChild(form);
  } else {
    document.body.appendChild(form);
    Object.assign(form.style, { position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:"9999" });
  }
  form.querySelector("input,textarea")?.focus();
  return form;
}

function formHtml(fields, saveLabel="حفظ") {
  const inputs = fields.map(f => {
    if (f.type === "textarea") return `<textarea class="${f.cls}" placeholder="${f.ph||""}" rows="3">${f.val||""}</textarea>`;
    return `<input class="${f.cls}" type="${f.type||"text"}" placeholder="${f.ph||""}" value="${esc(f.val||"")}"/>`;
  }).join("");
  return `<div class="cf-title">${fields[0]?.label||"تعديل"}</div>
    ${inputs}
    <div class="cf-btns">
      <button class="cf-save">${saveLabel}</button>
      <button class="cf-cancel">إلغاء</button>
    </div>`;
}

function openExpMetaForm(anchor, exp) {
  inlineForm(anchor,
    formHtml([
      {label:"تعديل الخبرة", cls:"cf-company", ph:"الشركة", val:exp.company},
      {cls:"cf-location", ph:"الموقع", val:exp.location},
      {cls:"cf-dates", ph:"التواريخ (مثال: Jan 2022 – Present)", val:exp.dates},
    ]),
    form => {
      exp.company  = form.querySelector(".cf-company").value.trim();
      exp.location = form.querySelector(".cf-location").value.trim();
      exp.dates    = form.querySelector(".cf-dates").value.trim();
      S.save();
    }
  );
}

function openContactForm(anchor) {
  const p = S.data.person||{};
  inlineForm(anchor,
    formHtml([
      {label:"تعديل التواصل", cls:"cf-name", ph:"الاسم الكامل", val:p.name},
      {cls:"cf-location", ph:"الموقع (مثال: Amman, Jordan)", val:p.location},
      {cls:"cf-email",    ph:"البريد الإلكتروني", val:p.email},
      {cls:"cf-phone",    ph:"رقم الهاتف", val:p.phone},
    ]),
    form => {
      if (!S.data.person) S.data.person={};
      S.data.person.name     = form.querySelector(".cf-name").value.trim();
      S.data.person.location = form.querySelector(".cf-location").value.trim();
      S.data.person.email    = form.querySelector(".cf-email").value.trim();
      S.data.person.phone    = form.querySelector(".cf-phone").value.trim();
      S.save();
    }
  );
}

function openAddExpForm(p) {
  inlineForm(null,
    `<div class="cf-title">＋ إضافة خبرة جديدة</div>
    <input class="cf-title-i" placeholder="المسمى الوظيفي *"/>
    <input class="cf-company" placeholder="الشركة *"/>
    <input class="cf-location" placeholder="الموقع"/>
    <input class="cf-dates" placeholder="التواريخ (مثال: Jan 2022 – Present)"/>
    <textarea class="cf-bullets" placeholder="الإنجازات — كل إنجاز في سطر جديد" rows="4"></textarea>
    <div class="cf-btns"><button class="cf-save">＋ إضافة</button><button class="cf-cancel">إلغاء</button></div>`,
    form => {
      const title = form.querySelector(".cf-title-i").value.trim();
      if (!title) return;
      const entry = {
        title,
        company:  form.querySelector(".cf-company").value.trim(),
        location: form.querySelector(".cf-location").value.trim(),
        dates:    form.querySelector(".cf-dates").value.trim(),
        bullets:  form.querySelector(".cf-bullets").value.split("\n").map(b=>b.trim()).filter(Boolean),
      };
      if (!p.experience) p.experience=[];
      p.experience.unshift(entry);
      S.save();
    }
  );
}

function openAddProjForm(p) {
  inlineForm(null,
    `<div class="cf-title">＋ إضافة مشروع</div>
    <input class="cf-pname"  placeholder="اسم المشروع *"/>
    <input class="cf-psummary" placeholder="وصف مختصر"/>
    <input class="cf-purl"   placeholder="الرابط (URL) اختياري"/>
    <textarea class="cf-pbullets" placeholder="النقاط — كل نقطة في سطر" rows="3"></textarea>
    <div class="cf-btns"><button class="cf-save">＋ إضافة</button><button class="cf-cancel">إلغاء</button></div>`,
    form => {
      const name = form.querySelector(".cf-pname").value.trim();
      if (!name) return;
      const proj = {
        name, title: name,
        summary: form.querySelector(".cf-psummary").value.trim(),
        url:     form.querySelector(".cf-purl").value.trim(),
        bullets: form.querySelector(".cf-pbullets").value.split("\n").map(b=>b.trim()).filter(Boolean),
        tab_ids: [S.tab],
      };
      if (S.merge && S.mergedProfile()?.projects) {
        S.mergedProfile().projects.unshift(proj);
      } else {
        if (!S.data.projects) S.data.projects=[];
        S.data.projects.unshift(proj);
      }
      S.save();
    }
  );
}

function openLinkForm(anchor, link, p) {
  inlineForm(anchor,
    formHtml([
      {label:"تعديل الرابط", cls:"cf-lurl",   ph:"https://...", val:link?.url},
      {cls:"cf-llabel", ph:"النص المعروض",     val:link?.label||link?.url},
    ]),
    form => {
      if (link) {
        link.url   = form.querySelector(".cf-lurl").value.trim();
        link.label = form.querySelector(".cf-llabel").value.trim() || link.url;
      } else {
        if (!p.links) p.links=[];
        p.links.push({
          url:   form.querySelector(".cf-lurl").value.trim(),
          label: form.querySelector(".cf-llabel").value.trim(),
        });
      }
      S.save();
    }
  );
}

function openCertForm(anchor, cert, p) {
  inlineForm(anchor,
    `<div class="cf-title">${cert ? "تعديل الشهادة" : "＋ إضافة شهادة"}</div>
    <input class="cf-cname"   placeholder="اسم الشهادة *"   value="${esc(cert?.title||cert?.name||"")}"/>
    <input class="cf-cissuer" placeholder="الجهة المانحة"    value="${esc(cert?.issuer||"")}"/>
    <input class="cf-cdate"   placeholder="التاريخ"          value="${esc(cert?.date||"")}"/>
    <div class="cf-btns"><button class="cf-save">حفظ</button><button class="cf-cancel">إلغاء</button></div>`,
    form => {
      const name = form.querySelector(".cf-cname").value.trim(); if (!name) return;
      if (cert) {
        cert.title = cert.name = name;
        cert.issuer = form.querySelector(".cf-cissuer").value.trim();
        cert.date   = form.querySelector(".cf-cdate").value.trim();
      } else {
        if (!p.certs) p.certs=[];
        p.certs.push({ title:name, name, issuer:form.querySelector(".cf-cissuer").value.trim(), date:form.querySelector(".cf-cdate").value.trim() });
      }
      S.save();
    }
  );
}

function openEduForm(anchor, edu) {
  inlineForm(anchor,
    `<div class="cf-title">${edu ? "تعديل التعليم" : "＋ إضافة تعليم"}</div>
    <input class="cf-eschool"  placeholder="المدرسة / الجامعة *" value="${esc(edu?.school||edu?.institution||"")}"/>
    <input class="cf-edegree"  placeholder="الدرجة العلمية"      value="${esc(edu?.degree||edu?.title||"")}"/>
    <input class="cf-emajor"   placeholder="التخصص"              value="${esc(edu?.major||"")}"/>
    <input class="cf-eyear"    placeholder="السنة"               value="${esc(edu?.year||edu?.dates||"")}"/>
    <div class="cf-btns"><button class="cf-save">حفظ</button><button class="cf-cancel">إلغاء</button></div>`,
    form => {
      const school = form.querySelector(".cf-eschool").value.trim(); if (!school) return;
      const entry = {
        school, institution:school,
        degree: form.querySelector(".cf-edegree").value.trim(),
        major:  form.querySelector(".cf-emajor").value.trim(),
        year:   form.querySelector(".cf-eyear").value.trim(),
      };
      entry.title=entry.degree; entry.dates=entry.year;
      if (edu) { Object.assign(edu, entry); }
      else { if(!S.data.education) S.data.education=[]; S.data.education.push(entry); }
      S.save();
    }
  );
}

/* ═══════════════════════════════════════════════════════════════
   ACTIONS
═══════════════════════════════════════════════════════════════ */
function setTab(id) {
  S.tab      = id;
  S.merge    = false;
  S.branchId = null;
  // Auto-select default branch if tab has branching
  const branching = S.data?.branching?.[id];
  if (branching?.default) S.branchId = branching.default;
  renderAll();
  window.scrollTo({top:0, behavior:"smooth"});
}

function setEditMode(on) {
  S.editMode = on;
  document.body.classList.toggle("edit-mode", on);
  const btn = $("btnEdit");
  if (btn) {
    btn.textContent = on ? "✏ تعديل: مفعّل" : "✏ Edit Mode";
    btn.classList.toggle("active", on);
  }
  const banner = $("editBanner");
  if (banner) banner.style.display = on ? "flex" : "none";
  // Clear old edit markers
  document.querySelectorAll("[data-edit],[data-inline-edit],[data-click-edit]").forEach(e => {
    delete e.dataset.edit;
    delete e.dataset.inlineEdit;
    delete e.dataset.clickEdit;
  });
  document.querySelectorAll(".cv-del,.cv-add,.cv-form,.cv-inline-input").forEach(e=>e.remove());
  if (on) setTimeout(attachEditor, 50);
}

function resetTab(id) {
  if (!confirm(`مسح كل محتوى تاب "${id}"؟`)) return;
  if (!S.data.curated) S.data.curated={};
  S.data.curated[id] = { summary:"", experience:[], skills:[], certs:[], links:[] };
  S.save();
  if (S.tab===id) renderAll();
  toast(`✅ تم مسح تاب ${id}`);
}

/* ── Merge ───────────────────────────────────────────────────── */
function openMergeModal() {
  let modal = $("mergeModal");
  if (!modal) return;
  // Populate checkboxes
  const list = $("mergeTabList"); if (!list) return;
  list.innerHTML = S.tabs().map(t => `
    <label class="merge-check-item">
      <input type="checkbox" value="${t.id}" ${S.mergeSelection.some(s=>s.tabId===t.id)?"checked":""}/>
      <b>${esc(t.label)}</b><span>${esc(t.subtitle||"")}</span>
    </label>`).join("");
  modal.style.display="flex";
}

function applyMerge() {
  const checks = document.querySelectorAll("#mergeTabList input:checked");
  S.mergeSelection = Array.from(checks).map(c=>({tabId:c.value}));
  if (!S.mergeSelection.length) { toast("⚠ اختر تاباً واحداً على الأقل"); return; }
  S.merge  = true;
  S.tab    = "__merged__";
  S.mergeOrder = [];
  snapshotMerge();
  S.save();
  $("mergeModal").style.display="none";
  $("btnExitMerge").style.display="";
  renderAll();
  toast(`✅ Merged: ${S.mergeSelection.map(s=>s.tabId).join(" + ")}`);
}

function exitMerge() {
  S.merge  = false;
  S.tab    = S.tabs()[0]?.id || "electrical";
  $("btnExitMerge").style.display="none";
  renderAll();
}

/* ── JD Auto-merge ───────────────────────────────────────────── */
function onTailor() {
  const jd = $("jdInput")?.value || "";
  S.jdTokens = new Set(norm(jd).split(" ").filter(t=>t.length>2));
  renderAll();
  if (jd.trim().length < 30) return;

  // Score each tab
  const scored = S.tabs().map(t => {
    const p = S.data.curated?.[t.id]||{};
    const blob = [p.summary, ...(p.experience||[]).flatMap(e=>[e.title,...(e.bullets||[])]), ...(p.skills||[])].join(" ");
    return {tabId:t.id, score: scoreText(blob)};
  }).filter(t=>t.score>0).sort((a,b)=>b.score-a.score);

  if (scored.length < 1) return;
  const top = scored.slice(0, Math.min(3, scored.length));
  S.mergeSelection = top.map(t=>({tabId:t.tabId}));
  S.merge=true; S.tab="__merged__"; S.mergeOrder=[];
  snapshotMerge(); S.save();
  $("btnExitMerge").style.display="";
  renderAll();
  toast(`✅ Auto-merged: ${top.map(t=>t.tabId).join(" + ")} (score-based)`);
}

/* ── Show add tab form ───────────────────────────────────────── */
function showAddTabForm() {
  const existing = $("addTabFormModal"); if (existing) { existing.remove(); return; }
  const modal = document.createElement("div");
  modal.id="addTabFormModal";
  modal.className="cv-modal";
  modal.innerHTML=`
    <div class="cv-modal-panel">
      <div class="cv-modal-title">＋ إضافة تاب جديد</div>
      <input id="newTabLabel"    class="cv-modal-input" placeholder="اسم التاب *"/>
      <input id="newTabSubtitle" class="cv-modal-input" placeholder="Subtitle (اختياري)"/>
      <div class="cv-modal-btns">
        <button id="newTabSave" class="btn-primary">＋ إضافة</button>
        <button id="newTabCancel">إلغاء</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  $("newTabCancel").onclick=()=>modal.remove();
  $("newTabSave").onclick=()=>{
    const label=($("newTabLabel").value||"").trim(); if(!label){return;}
    const id=label.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"").slice(0,20);
    if((S.data.tabs||[]).some(t=>t.id===id)){toast("⚠ يوجد تاب بهذا الـ ID");return;}
    if(!S.data.tabs) S.data.tabs=[];
    if(!S.data.curated) S.data.curated={};
    S.data.tabs.push({id, label, subtitle:($("newTabSubtitle").value||"").trim()});
    S.data.curated[id]={summary:"",experience:[],skills:[],certs:[],links:[]};
    S.save(); modal.remove(); renderAll();
    toast(`✅ تم إضافة تاب "${label}"`);
  };
}

/* ── Quick Add skill (with AI classify) ─────────────────────── */
async function quickAddSkill() {
  const input = $("quickSkillInput"); if (!input) return;
  const skill = input.value.trim(); if (!skill) return;
  const btn   = $("quickSkillBtn");

  btn.disabled=true; btn.textContent="⟳";
  try {
    const key = localStorage.getItem("gemini_key")||"";
    if (!key) { toast("⚠ أدخل Gemini API Key في AI Builder أولاً"); return; }
    const tabs = S.tabs().map(t=>t.id).join(", ");
    const res  = await geminiCall(key,
      `Classify skill: "${skill}" into tab. Tabs: ${tabs}. Return JSON only: {"tab":"id","label":"Clean Name"}`
    );
    const clean = res.replace(/```json?|```/g,"").trim();
    const data  = JSON.parse(clean);
    const tabId = data.tab || S.tab;
    if (!S.data.curated[tabId]) S.data.curated[tabId]={skills:[]};
    if (!S.data.curated[tabId].skills) S.data.curated[tabId].skills=[];
    S.data.curated[tabId].skills.unshift(data.label||skill);
    S.save(); renderAll();
    input.value="";
    toast(`✅ أضيفت "${data.label||skill}" → ${tabId}`);
  } catch(e) {
    // fallback: add to current tab
    const p=S.profile(); if(!p.skills) p.skills=[];
    p.skills.unshift(skill); S.save(); renderAll(); input.value="";
    toast(`✅ أضيفت "${skill}" → ${S.tab}`);
  } finally { btn.disabled=false; btn.textContent="＋"; }
}

/* ── Extract from Drive ──────────────────────────────────────── */
async function extractFromDrive(tabId, btn) {
  const gemKey = localStorage.getItem("gemini_key")||"";
  if (!gemKey) { toast("⚠ أدخل Gemini API Key في AI Builder أولاً"); return; }

  const cfg = window.DRIVE_CONFIG||{};
  if (!cfg.api_key||!cfg.folder_id) { toast("⚠ drive_config.js ناقص"); return; }

  const origText = btn.textContent;
  btn.disabled=true; btn.textContent="⟳";
  toast(`⏳ جاري قراءة Drive لتاب ${tabId}…`, 15000);

  try {
    // List files
    const q   = encodeURIComponent(`'${cfg.folder_id}' in parents and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&key=${cfg.api_key}&fields=files(id,name,mimeType)&pageSize=50`);
    if (!res.ok) throw new Error(`Drive API ${res.status}`);
    const files = (await res.json()).files||[];
    if (!files.length) { toast("⚠ لا توجد ملفات في Drive"); return; }

    const tabMeta = S.tabs().find(t=>t.id===tabId);
    const tabLabel = tabMeta?.label||tabId;
    const fileNames = files.map(f=>f.name).join(", ");

    // Use Gemini with file names as context (no download needed for text)
    const text = await geminiCall(gemKey,
      `You are a CV expert. Based on these Drive files for a person applying to ${tabLabel} roles, extract CV data.
Files: ${fileNames}
Also use this context: ${(S.data.docs||[]).slice(0,5).map(d=>(d.highlights?.[tabId]||[]).slice(0,3).map(h=>h.text).join(" ")).join(" ")}

Return JSON only (no markdown):
{"summary":"professional summary for ${tabLabel}","experience":[{"title":"","company":"","location":"","dates":"","bullets":[""]}],"skills":[""]}`
    );
    const clean = text.replace(/```json?|```/g,"").trim();
    const extracted = JSON.parse(clean);

    if (!S.data.curated) S.data.curated={};
    if (!S.data.curated[tabId]) S.data.curated[tabId]={};
    const p = S.data.curated[tabId];
    if (extracted.summary)            p.summary    = extracted.summary;
    if (extracted.skills?.length)     p.skills     = [...(extracted.skills||[]), ...(p.skills||[])];
    if (extracted.experience?.length) {
      if (!p.experience?.length) p.experience = extracted.experience;
      else extracted.experience.forEach(ne => {
        if (!p.experience.some(e=>(e.company||"").slice(0,6)===(ne.company||"").slice(0,6)))
          p.experience.push(ne);
      });
    }
    S.save();
    if (S.tab===tabId) renderAll();
    toast(`✅ تم الاستخراج لتاب ${tabLabel}`, 4000);
  } catch(e) {
    toast(`⚠ ${e.message}`, 5000);
  } finally {
    btn.disabled=false; btn.textContent=origText;
  }
}

/* ── Gemini call ─────────────────────────────────────────────── */
async function geminiCall(key, prompt, retries=1) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      contents:[{role:"user",parts:[{text:prompt}]}],
      generationConfig:{maxOutputTokens:2000,temperature:0.2}
    })
  });
  if (!res.ok) {
    const e=await res.json().catch(()=>({}));
    if (res.status===503&&retries>0) { await new Promise(r=>setTimeout(r,3000)); return geminiCall(key,prompt,retries-1); }
    throw new Error(e?.error?.message||`HTTP ${res.status}`);
  }
  const data=await res.json();
  const text=data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

/* ═══════════════════════════════════════════════════════════════
   PRINT
═══════════════════════════════════════════════════════════════ */
function printCV() {
  // Temporarily disable edit mode for clean print
  const wasEdit = S.editMode;
  if (wasEdit) setEditMode(false);
  setTimeout(() => {
    window.print();
    if (wasEdit) setTimeout(() => setEditMode(true), 500);
  }, 100);
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
window.addEventListener("DOMContentLoaded", () => {
  // Load data
  S.data = window.CV_DATA || null;
  if (!S.data) { console.error("CV_DATA not found — make sure data.js is loaded"); return; }

  // Try to restore from localStorage
  try {
    const saved = localStorage.getItem("cv_state_data");
    if (saved) { const parsed=JSON.parse(saved); if(parsed?.curated) S.data=parsed; }
  } catch(_) {}

  // Set initial tab
  S.tab = S.data.tabs?.[0]?.id || "electrical";
  // Set default branch if tab has branching
  const initBranching = S.data?.branching?.[S.tab];
  if (initBranching?.default) S.branchId = initBranching.default;

  // Wire buttons
  $("btnEdit")?.addEventListener("click", () => setEditMode(!S.editMode));
  $("btnPrint")?.addEventListener("click", printCV);
  $("btnPrintTop")?.addEventListener("click", printCV);
  $("btnMerge")?.addEventListener("click", openMergeModal);
  $("btnExitMerge")?.addEventListener("click", exitMerge);
  $("btnMergeApply")?.addEventListener("click", applyMerge);
  $("btnMergeCancel")?.addEventListener("click", () => { $("mergeModal").style.display="none"; });
  $("mergeModal")?.addEventListener("click", e => { if(e.target===$("mergeModal")) $("mergeModal").style.display="none"; });
  $("btnMergeAutoSort")?.addEventListener("click", () => {
    const p=S.mergedProfile(); if(!p?.experience) return;
    p.experience.sort((a,b)=>parseDateEnd(b.dates)-parseDateEnd(a.dates));
    renderAll();
  });

  $("btnTailor")?.addEventListener("click", onTailor);
  $("btnClearJD")?.addEventListener("click", () => {
    if($("jdInput")) $("jdInput").value="";
    S.jdTokens=new Set(); renderAll();
  });

  $("searchInput")?.addEventListener("input", e => {
    S.searchTerm = norm(e.target.value||"");
    renderAll();
  });

  $("quickSkillBtn")?.addEventListener("click", quickAddSkill);
  $("quickSkillInput")?.addEventListener("keydown", e => { if(e.key==="Enter") quickAddSkill(); });

  document.querySelectorAll(".mgr-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mgr-tab-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".mgr-panel").forEach(p=>{p.style.display="none";});
      const panel=$(btn.dataset.panel); if(panel) panel.style.display="";
    });
  });

  // Expose for other scripts
  window.__cvApp = {
    getData:       () => S.data,
    getActiveTab:  () => S.tab,
    setTab,
    renderAll,
    renderTabs,
    renderBranches:() => {},
    save:          () => S.save(),
  };

  // Initial render
  renderAll();
});

})();
