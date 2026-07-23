/**
 * ══════════════════════════════════════════════════════════════
 *  AI CV BUILDER v3
 *  1. ATS-optimized CV generation
 *  2. Reads ALL Drive folders for context
 *  3. Properly fills CV fields (summary, experience bullets, skills)
 *  4. Chat refinement loop
 * ══════════════════════════════════════════════════════════════
 */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  // ── Conversation history for chat refinement ──────────────
  let chatHistory   = [];   // [{role, content}]
  let lastCVHtml    = "";   // last generated HTML
  let lastData      = null; // last structured JSON
  let isGenerating  = false;

  // ── API key ────────────────────────────────────────────────
  function loadKey() { try { return localStorage.getItem("gemini_key") || ""; } catch(_) { return ""; } }
  function saveKey(k){ try { localStorage.setItem("gemini_key", k); } catch(_) {} }

  // ── Get all Drive folder names (for context) ───────────────
  function getDriveFoldersContext() {
    try {
      const folders = JSON.parse(localStorage.getItem("cv_drive_folders") || "null");
      if (!Array.isArray(folders) || !folders.length) return "";
      return "\nAVAILABLE DRIVE FOLDERS:\n" +
        folders.map((f, i) => `  ${i+1}. "${f.name}" (id: ${f.id})`).join("\n") + "\n";
    } catch(_) { return ""; }
  }

  // ── Build full CV context from ALL data ────────────────────
  function buildCVContext() {
    if (typeof CV_DATA === "undefined") return "No CV data available.";
    const d = CV_DATA, p = d.person || {};
    let ctx = `CANDIDATE: ${p.name || "Abdelrahman Khater"}\n`;
    ctx += `Location: ${p.location || "Amman, Jordan"}\n`;
    if (p.email) ctx += `Email: ${p.email}\n`;
    if (p.phone) ctx += `Phone: ${p.phone}\n\n`;

    const app    = window.__cvApp;
    const active = app?.getActiveTab() || "";
    const tabs   = Object.keys(d.curated || {}).filter(t => t !== "__merged__");
    const order  = [active, ...tabs.filter(t => t !== active)];

    for (const tid of order.slice(0, 5)) {
      const tab = d.curated[tid];
      if (!tab) continue;
      ctx += `\n=== ${tid.toUpperCase()} ===\n`;
      if (tab.summary) ctx += `Summary: ${tab.summary}\n\n`;
      (tab.experience || []).forEach(e => {
        ctx += `Position: ${e.title} at ${e.company}, ${e.location} | ${e.dates}\n`;
        (e.bullets || []).forEach(b => ctx += `  • ${b}\n`);
        ctx += "\n";
      });
      if ((tab.skills || []).length)
        ctx += `Skills: ${tab.skills.join(", ")}\n`;
      if ((tab.certs || []).length) {
        ctx += `Certifications:\n`;
        tab.certs.forEach(c => ctx += `  • ${c.title || c.name}${c.issuer ? " — " + c.issuer : ""}${c.date ? " (" + c.date + ")" : ""}\n`);
      }
    }

    if ((d.education || []).length) {
      ctx += `\n=== EDUCATION ===\n`;
      d.education.forEach(e => ctx += `• ${e.degree || e.title} — ${e.institution || e.school} (${e.year || e.dates || ""})\n`);
    }

    if ((d.projects || []).length) {
      ctx += `\n=== PROJECTS ===\n`;
      d.projects.slice(0, 5).forEach(proj =>
        ctx += `• ${proj.title}: ${(proj.description || proj.summary || "").slice(0, 200)}\n`
      );
    }

    return ctx;
  }

  // ── ATS-optimized system prompt ────────────────────────────
  const SYSTEM_PROMPT = `You are an expert CV writer. Create ATS-optimized tailored CVs. Always return exactly: ---ANALYSIS--- then ---DATA--- then ---CV---`

  // ── Build prompt ──────────────────────────────────────────────
  function buildGeneratePrompt(jd, cvCtx) {
    return `You are a senior HR consultant and expert CV writer with 15+ years experience.
Your task: analyze the job description deeply, extract ALL requirements, then craft a highly tailored ATS-optimized CV.

═══ JOB DESCRIPTION ═══
${jd}

═══ CANDIDATE CV DATA ═══
${cvCtx}

═══ INSTRUCTIONS ═══
Step 1: Deep analysis — identify:
- Required technical skills (hard skills)
- Soft skills and behavioral requirements  
- Years of experience needed
- Industry-specific keywords that ATS will scan for
- Nice-to-have qualifications
- Seniority level

Step 2: Match analysis — for each JD requirement, find the BEST matching experience/skill from the CV data

Step 3: Generate output in EXACTLY this format:

---ANALYSIS---
🎯 المتطلبات الرئيسية:
• [list each key requirement]

✅ ما يتوفر عند المرشح:
• [specific matching items with evidence]

⚠️ الفجوات:
• [missing skills or experience gaps]

⭐ نسبة التطابق: [X]%

💡 نصائح للتقديم:
• [3 specific actionable tips]

---DATA---
{
  "tab": "electrical|network|data|pm",
  "headline": "exact job title from JD",
  "summary": "4-5 sentences: opens with years of experience + specialization, includes 3+ JD keywords, quantifies impact, ends with value proposition",
  "experience": [
    {
      "title": "exact title from CV",
      "company": "exact company from CV",
      "location": "location",
      "dates": "dates",
      "bullets": [
        "Strong action verb + specific achievement + quantified result + JD keyword",
        "Another achievement rewritten to mirror JD language exactly"
      ]
    }
  ],
  "skills": ["skill matching JD exactly as written in JD"]
}
Rules for DATA:
- tab: electrical=power/solar/QC/cables, network=NOC/Cisco/LAN/WAN, data=Python/SQL/ETL/cloud, pm=coordination/logistics
- Select the 3-4 MOST relevant experience entries only
- Every bullet: action verb + achievement + number/% + JD keyword
- Skills: exact strings, top 15 most relevant to JD, no duplicates

---CV---
Write a COMPLETE, PROFESSIONAL, ATS-OPTIMIZED CV in clean HTML.

HTML Requirements:
- Inline styles ONLY (no <style> tags, no classes)
- Single column layout — NO multi-column, NO tables for layout
- font-family: Arial, Helvetica, sans-serif throughout
- background: #ffffff
- max-width: 800px, margin: 0 auto, padding: 40px

Header section:
- Name: font-size:26px; font-weight:900; color:#1a1a2e; margin:0
- Job title (tailored to JD): font-size:14px; color:#c0392b; font-weight:700; margin:4px 0
- Contact info: font-size:12px; color:#555; margin:4px 0

Section headings:
- font-size:11px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; color:#1a1a2e
- border-bottom:2px solid #c0392b; padding-bottom:4px; margin:20px 0 10px

Experience entries:
- Job title: font-size:13px; font-weight:700; color:#1a1a2e
- Company + dates: font-size:12px; color:#555
- Bullets: <ul style="margin:6px 0 0 16px;padding:0"> <li style="font-size:12px;color:#333;line-height:1.7;margin-bottom:3px">

Sections to include (in this order):
1. Professional Summary (3-4 sentences with JD keywords)
2. Work Experience (chronological, most recent first)
3. Core Skills (comma-separated or chips style)
4. Certifications & Training
5. Education

Content rules:
- Every bullet point starts with a STRONG action verb (Led, Developed, Reduced, Managed, Implemented...)
- Include at least 5 keywords from the JD
- Quantify EVERY achievement (percentages, numbers, team sizes, timeframes)
- NO placeholder text, NO [brackets], NO generic statements
- Make it complete and ready to submit`;
  }

  // ── Build chat refinement prompt ────────────────────────────
  function buildChatPrompt(userRequest) {
    return `The user wants to refine the CV you just generated. Here is their request:

"${userRequest}"

Current CV HTML (the one to modify):
${lastCVHtml}

Instructions:
1. Apply the requested changes to the CV
2. Keep all ATS optimization rules
3. Return ONLY the updated CV in this format:

---CV---
[updated complete HTML CV with all changes applied]

Also return brief confirmation:
---DONE---
[1-2 sentences in Arabic confirming what you changed]`;
  }

  // ── Gemini 2.0 Flash API ──────────────────────────────────────
  const GEMINI_MODELS = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"];
  const GEMINI_BASE   = "https://generativelanguage.googleapis.com/v1/models";

  function buildGeminiParts(messages, systemPrompt) {
    const parts = [];
    // Prepend system prompt as first user turn text
    if (systemPrompt) parts.push({ text: "INSTRUCTIONS: " + systemPrompt + "\n\n" });
    for (const msg of (messages || [])) {
      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b.type === "text")     parts.push({ text: b.text });
          if (b.type === "image")    parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
          if (b.type === "document") parts.push({ inlineData: { mimeType: "application/pdf", data: b.source.data } });
        }
      }
    }
    return parts;
  }

  async function geminiFetch(apiKey, parts, modelIdx = 0) {
    const model = GEMINI_MODELS[modelIdx] || GEMINI_MODELS[0];

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 60000);

    let res;
    try {
      res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.3 }
        }),
        signal: controller.signal
      });
    } catch(fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError")
        throw new Error("⏱️ انتهى الوقت (60 ثانية) — أعد المحاولة");
      throw new Error("🌐 فشل الاتصال: " + fetchErr.message);
    }
    clearTimeout(timeoutId);
    if (!res.ok) {
      const e   = await res.json().catch(() => ({}));
      const msg = e?.error?.message || `HTTP ${res.status}`;
      console.error("[Gemini] Error:", res.status, JSON.stringify(e));
      if ((res.status === 429 || res.status === 503) && modelIdx < GEMINI_MODELS.length - 1) {
        const next = GEMINI_MODELS[modelIdx + 1];
        setStatus(`⏳ ${model} مزدحم — أجرّب ${next}…`, true, "#fbbf24");
        await new Promise(r => setTimeout(r, 2000));
        return geminiFetch(apiKey, parts, modelIdx + 1);
      }
      if (res.status === 429 || res.status === 503) {
        setStatus("⏳ الخوادم مزدحمة — إعادة بعد 30 ثانية…", true, "#fbbf24");
        await new Promise(r => setTimeout(r, 30000));
        return geminiFetch(apiKey, parts, 0);
      }
      if (res.status === 400 && (msg.toLowerCase().includes("api_key") || msg.toLowerCase().includes("invalid")))
        throw new Error("🔑 API Key غير صحيح أو غير مفعّل — تأكد من aistudio.google.com/apikey");
      if (res.status === 403)
        throw new Error("🚫 ممنوع الوصول — تأكد من تفعيل Gemini API في مشروعك على Google Cloud");
      if (msg.toLowerCase().includes("expired"))
        throw new Error("⏰ API Key منتهية الصلاحية — أنشئ key جديد من aistudio.google.com/apikey");
      throw new Error(`${res.status}: ${msg}`);
    }
    const data = await res.json();
    console.log("[Gemini] Response:", JSON.stringify(data).slice(0, 500));
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const reason   = data.candidates?.[0]?.finishReason || "UNKNOWN";
      const promptFB = data.promptFeedback?.blockReason || "";
      console.warn("[Gemini] No text. reason:", reason, "blockReason:", promptFB);
      if (reason === "SAFETY" || promptFB)
        throw new Error("⚠️ Gemini رفض الطلب لأسباب أمنية — بسّط الوصف الوظيفي وأعد المحاولة");
      if (reason === "MAX_TOKENS")
        throw new Error("⚠️ الرد طويل جداً — جرّب وصفاً وظيفياً أقصر");
      // Try to get text from all parts
      const allText = (data.candidates?.[0]?.content?.parts || [])
        .map(p => p.text || "").join("");
      if (allText.trim()) return allText;
      throw new Error(`Gemini لم يُرجع نصاً (${reason || "no candidates"}) — افتح F12 للتفاصيل`);
    }
    return text;
  }

  async function callClaude(apiKey, messages, systemPrompt) {
    if (!apiKey) throw new Error("🔑 أدخل Gemini API Key من aistudio.google.com/apikey");
    return geminiFetch(apiKey, buildGeminiParts(messages, systemPrompt));
  }

  // ── Parse initial response ─────────────────────────────────
  function parseGenerateResponse(text) {
    console.log("[Parse] Response length:", text.length, "preview:", text.slice(0, 200));

    const aIdx = text.indexOf("---ANALYSIS---");
    const dIdx = text.indexOf("---DATA---");
    const cIdx = text.indexOf("---CV---");

    const analysis = (aIdx !== -1 && dIdx !== -1) ? text.slice(aIdx + 14, dIdx).trim()
                   : (aIdx !== -1 && cIdx !== -1)  ? text.slice(aIdx + 14, cIdx).trim()
                   : "";

    let data = null;
    if (dIdx !== -1) {
      const raw = (cIdx !== -1) ? text.slice(dIdx + 10, cIdx) : text.slice(dIdx + 10);
      const clean = raw.trim().replace(/^```json?\n?/i, "").replace(/\n?```$/m, "").trim();
      try { data = JSON.parse(clean); } catch(e) {
        console.warn("[Parse] JSON failed:", clean.slice(0, 300));
        // Try to extract JSON with regex
        const jsonMatch = clean.match(/\{[\s\S]+\}/);
        if (jsonMatch) {
          try { data = JSON.parse(jsonMatch[0]); } catch(_) {}
        }
      }
    }

    let cvHtml = "";
    if (cIdx !== -1) {
      cvHtml = text.slice(cIdx + 8).trim()
        .replace(/^```html?\n?/i, "").replace(/\n?```$/m, "").trim();
    }

    // Fallback: if no ---CV--- marker but response has HTML, use entire response
    if (!cvHtml && text.includes("<html") || (!cvHtml && text.includes("<div") && text.includes("</div>"))) {
      cvHtml = text.replace(/^```html?\n?/i, "").replace(/\n?```$/m, "").trim();
      console.warn("[Parse] Used fallback HTML extraction");
    }

    console.log("[Parse] analysis:", !!analysis, "data:", !!data, "cvHtml:", cvHtml.length);
    return { analysis, data, cvHtml };
  }

  // ── Parse chat response ────────────────────────────────────
  function parseChatResponse(text) {
    const cIdx   = text.indexOf("---CV---");
    const dIdx   = text.indexOf("---DONE---");
    const cvHtml = cIdx !== -1
      ? text.slice(cIdx + 8, dIdx !== -1 ? dIdx : undefined).trim().replace(/^```html?\n?/i,"").replace(/\n?```$/m,"").trim()
      : "";
    const confirmation = dIdx !== -1 ? text.slice(dIdx + 10).trim() : "";
    return { cvHtml, confirmation };
  }

  // ── Render analysis ────────────────────────────────────────
  function renderAnalysis(text) {
    const panel = $("aiAnalysisPanel");
    if (!panel || !text) return;
    const html = text.split("\n").map(line => {
      line = line.trim();
      if (!line) return "<br>";
      if (line.startsWith("•") || line.startsWith("-"))
        return `<div style="display:flex;gap:5px;margin:2px 0;"><span style="color:#a855f7;flex-shrink:0;">▸</span><span>${line.slice(1).trim()}</span></div>`;
      if (/^[🎯✅⭐💡]/.test(line))
        return `<div style="font-weight:800;color:#c084fc;margin:10px 0 3px;">${line}</div>`;
      return `<div style="margin:2px 0;color:rgba(255,255,255,0.7);">${line}</div>`;
    }).join("");
    panel.innerHTML = `<div style="font-size:11px;line-height:1.7;">${html}</div>`;
  }

  // ── Render CV in output ────────────────────────────────────
  function renderCVOutput(cvHtml) {
    const wrap = $("aiCVOutputWrap");
    const out  = $("aiCVOutput");
    if (!out) return;
    out.innerHTML = `<div style="max-width:760px;margin:0 auto;padding:36px 44px;font-family:Arial,sans-serif;">${cvHtml}</div>`;
    if (wrap) wrap.scrollTop = 0;

    // Show action buttons
    [$("aiCVApply"), $("aiCVPrint")].forEach(b => { if (b) b.style.display = "inline-flex"; });
  }

  // ══════════════════════════════════════════════════════════
  //  AUTO-FILL CV FIELDS
  //  Uses window.__cvApp exposed by app.js
  // ══════════════════════════════════════════════════════════
  function applyToCVFields(data) {
    if (!data) { console.warn("[AI] no data"); return null; }

    const app = window.__cvApp;
    if (!app) { console.error("[AI] window.__cvApp missing"); return null; }

    const DATA  = app.getData();
    const tabId = data.tab || detectBestTab(data);
    console.log("[AI] applying to tab:", tabId);

    if (!DATA.curated)        DATA.curated = {};
    if (!DATA.curated[tabId]) DATA.curated[tabId] = {};
    const profile = DATA.curated[tabId];

    // 1. Summary
    if (data.summary) {
      profile.summary = data.summary;
      console.log("[AI] summary set");
    }

    // 2. Headline
    if (data.headline) {
      if (!DATA.header) DATA.header = {};
      DATA.header.headline = data.headline;
    }

    // 3. Skills — plain strings always
    if (Array.isArray(data.skills) && data.skills.length) {
      const toStr  = s => typeof s === "string" ? s : (s?.name || String(s));
      const newS   = data.skills.map(toStr).filter(Boolean);
      const oldS   = (profile.skills || []).map(toStr);
      const oldLow = oldS.map(s => s.toLowerCase());
      // AI skills first, then old skills not already included
      profile.skills = [
        ...newS,
        ...oldS.filter(s => !newS.map(x => x.toLowerCase()).includes(s.toLowerCase()))
      ];
      console.log("[AI] skills:", profile.skills.length);
    }

    // 4. Experience — write/merge
    if (Array.isArray(data.experience) && data.experience.length) {
      const aiExp = data.experience.map(e => ({
        title:    e.title    || "",
        company:  e.company  || "",
        location: e.location || "",
        dates:    e.dates    || "",
        bullets:  Array.isArray(e.bullets) ? e.bullets : [],
        keywords: []
      }));

      const old = profile.experience || [];
      if (!old.length) {
        profile.experience = aiExp;
        console.log("[AI] experience created:", aiExp.length);
      } else {
        let matched = 0;
        aiExp.forEach(ne => {
          const nc = (ne.company || "").toLowerCase().slice(0, 7);
          const nt = (ne.title   || "").toLowerCase().slice(0, 7);
          const m  = old.find(e =>
            (e.company || "").toLowerCase().includes(nc) ||
            (e.title   || "").toLowerCase().includes(nt)
          );
          if (m && ne.bullets.length) { m.bullets = ne.bullets; matched++; }
        });
        if (!matched) profile.experience = [...aiExp, ...old];
        console.log("[AI] experience matched:", matched);
      }
    }

    // 5. Switch tab + re-render
    try {
      app.setTab(tabId);
      if (typeof app.renderTabs     === "function") app.renderTabs();
      if (typeof app.renderBranches === "function") app.renderBranches();
      if (typeof app.renderAll      === "function") app.renderAll();
      console.log("[AI] renderAll done on:", tabId);
    } catch(e) { console.error("[AI] render err:", e); }

    return tabId;
  }


  function detectBestTab(data) {
    const t = JSON.stringify(data).toLowerCase();
    if (t.includes("electrical") || t.includes("power") || t.includes("solar") || t.includes("pv") || t.includes("qc") || t.includes("cable")) return "electrical";
    if (t.includes("network") || t.includes("noc") || t.includes("cisco") || t.includes("wan") || t.includes("lan") || t.includes("firewall")) return "network";
    if (t.includes("data") || t.includes("python") || t.includes("sql") || t.includes("spark") || t.includes("etl") || t.includes("machine learning")) return "data";
    return "pm";
  }

  // ── Handle Apply ───────────────────────────────────────────
  function handleApply() {
    if (!lastData) return;
    const btn = $("aiCVApply");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ جاري التطبيق…"; }

    try {
      const tabId = applyToCVFields(lastData);

      // Success notification inside CV output
      const out = $("aiCVOutput");
      if (out) {
        const banner = document.createElement("div");
        banner.style.cssText = "position:sticky;top:0;z-index:20;background:#ecfdf5;border-bottom:2px solid #6ee7b7;padding:10px 20px;font-size:13px;font-weight:700;color:#065f46;display:flex;align-items:center;gap:8px;";
        banner.innerHTML = `<span>✅</span> تم تحديث الـ CV في قسم <strong>${tabId}</strong> — Summary · Experience · Skills`;
        out.prepend(banner);
        setTimeout(() => banner.remove(), 4000);
      }

      if (btn) {
        btn.textContent = "✅ تم!";
        setTimeout(() => { btn.disabled = false; btn.textContent = "✅ تطبيق على الـ CV"; }, 2500);
      }

      setTimeout(() => closeModal(), 2000);
    } catch(e) {
      console.error(e);
      if (btn) { btn.disabled = false; btn.textContent = "⚠️ فشل"; }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  MAIN GENERATE
  // ══════════════════════════════════════════════════════════
  async function handleGenerate() {
    if (isGenerating) return;
    const jd     = ($("aiJdInput")?.value  || "").trim();
    const apiKey = ($("aiKeyInput")?.value || "").trim();

    if (!jd) {
      highlight($("aiJdInput")); return;
    }
    if (!apiKey) {
      const ki = $("aiKeyInput");
      highlight(ki);
      if (ki) ki.placeholder = "⚠️ أدخل Gemini API Key أولاً";
      setTimeout(() => { if (ki) ki.placeholder = "sk-ant-…"; }, 3000);
      return;
    }

    saveKey(apiKey);
    isGenerating = true;
    chatHistory  = [];
    lastData     = null;
    lastCVHtml   = "";

    setBtnState("aiGenerateBtn", true, "⟳ يتم التوليد…");
    setStatus("⏳ يحلل Claude الوصف الوظيفي…", true);
    [$("aiCVApply"), $("aiCVPrint")].forEach(b => { if (b) b.style.display = "none"; });
    hideChatHistory();

    showLoadingInOutput();
    clearAnalysis();

    try {
      const cvCtx  = buildCVContext();
      const prompt = buildGeneratePrompt(jd, cvCtx);

      // Start conversation
      chatHistory = [{ role: "user", content: prompt }];

      const text = await callClaude(apiKey, chatHistory, SYSTEM_PROMPT);
      chatHistory.push({ role: "assistant", content: text });

      const { analysis, data, cvHtml } = parseGenerateResponse(text);

      if (analysis) renderAnalysis(analysis);

      if (cvHtml) {
        lastCVHtml = cvHtml;
        lastData   = data;
        renderCVOutput(cvHtml);

        if (data) {
          const applyBtn = $("aiCVApply");
          if (applyBtn) { applyBtn.style.display = "inline-flex"; applyBtn.style.animation = "glowGreen 1.8s ease-in-out 3"; }
        }

        // Enable chat
        enableChatInput();
        setStatus("✅ تم التوليد — اضغط 'تطبيق' أو استخدم Chat للتعديل", false, "#4ade80");
      } else {
        throw new Error("لم يتم توليد محتوى — حاول مرة أخرى");
      }
    } catch(e) {
      showError(e.message || "خطأ غير معروف");
    } finally {
      isGenerating = false;
      setBtnState("aiGenerateBtn", false, "✨ توليد السيرة الذاتية");
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CHAT REFINEMENT
  // ══════════════════════════════════════════════════════════
  async function handleChat() {
    if (isGenerating) return;
    const input  = $("aiChatInput");
    const apiKey = ($("aiKeyInput")?.value || "").trim();
    const msg    = (input?.value || "").trim();

    if (!msg)     { highlight(input); return; }
    if (!lastCVHtml) {
      showChatMessage("assistant", "⚠️ يجب توليد CV أولاً ثم طلب التعديل");
      return;
    }
    if (!apiKey)  {
      showChatMessage("assistant", "⚠️ أدخل API Key أولاً");
      return;
    }

    if (input) input.value = "";
    isGenerating = true;
    setBtnState("aiChatSend", true, "⟳");
    setStatus("💬 Claude يعدّل الـ CV…", true);
    showChatMessage("user", msg);

    try {
      // Add user message to history
      chatHistory.push({ role: "user", content: buildChatPrompt(msg) });

      const text = await callClaude(apiKey, chatHistory, SYSTEM_PROMPT);
      chatHistory.push({ role: "assistant", content: text });

      const { cvHtml, confirmation } = parseChatResponse(text);

      if (cvHtml) {
        lastCVHtml = cvHtml;
        renderCVOutput(cvHtml);
        if (confirmation) showChatMessage("assistant", "✅ " + confirmation);
        setStatus("✅ تم التعديل", false, "#4ade80");
      } else {
        // Maybe Claude just replied without ---CV--- — show the reply
        const replyText = text.replace(/---[A-Z]+---/g, "").trim().slice(0, 300);
        showChatMessage("assistant", replyText || "⚠️ لم يتم تحديث الـ CV — حاول مرة أخرى");
        setStatus("⚠️ لم يتم التحديث", false, "#fbbf24");
      }
    } catch(e) {
      showChatMessage("assistant", "⚠️ " + (e.message || "خطأ"));
      setStatus("⚠️ فشل", false, "#f87171");
    } finally {
      isGenerating = false;
      setBtnState("aiChatSend", false, "إرسال ↵");
    }
  }

  // ── Chat UI helpers ────────────────────────────────────────
  function showChatMessage(role, text) {
    const hist = $("aiChatHistory");
    if (!hist) return;
    hist.style.display = "block";
    const isUser = role === "user";
    const div = document.createElement("div");
    div.style.cssText = `margin:4px 0;padding:6px 10px;border-radius:8px;font-size:11px;line-height:1.5;
      background:${isUser ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)"};
      color:${isUser ? "#c7d2fe" : "rgba(255,255,255,0.7)"};
      text-align:${isUser ? "right" : "left"};`;
    div.innerHTML = `<span style="font-weight:700;opacity:0.6;">${isUser ? "أنت" : "Claude"}:</span> ${text}`;
    hist.appendChild(div);
    hist.scrollTop = hist.scrollHeight;
  }

  function enableChatInput() {
    const input = $("aiChatInput"), btn = $("aiChatSend");
    if (input) { input.disabled = false; input.style.opacity = "1"; input.placeholder = "اكتب طلبك للتعديل… (مثال: اجعل الملخص أقصر، ركز على مهارات الشبكات…)"; }
    if (btn)   { btn.disabled = false; btn.style.opacity = "1"; }
  }

  function hideChatHistory() {
    const h = $("aiChatHistory");
    if (h) { h.style.display = "none"; h.innerHTML = ""; }
  }

  // ── UI helpers ─────────────────────────────────────────────
  function highlight(el) {
    if (!el) return;
    el.style.borderColor = "#f87171";
    el.focus();
    setTimeout(() => { el.style.borderColor = ""; }, 2000);
  }

  function setBtnState(id, loading, label) {
    const btn = $(id);
    if (!btn) return;
    btn.disabled = loading;
    btn.style.opacity = loading ? "0.65" : "1";
    btn.innerHTML = loading ? `<span style="display:inline-block;animation:spin 0.9s linear infinite;">${label}</span>` : label;
  }

  function setStatus(text, pulsing, color) {
    const dot = $("aiStatusDot"), span = $("aiStatusText");
    if (span) span.textContent = text;
    if (dot) {
      dot.style.background = color || (pulsing ? "#a855f7" : "#3f3f50");
      dot.style.boxShadow  = pulsing ? `0 0 8px ${color || "#a855f7"}` : "none";
    }
  }

  function showLoadingInOutput() {
    const out = $("aiCVOutput");
    if (out) out.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:380px;gap:14px;color:#bbb;">
        <div style="font-size:52px;animation:spin 2s linear infinite;">✨</div>
        <div style="font-size:14px;font-weight:700;">Gemini يكتب سيرتك الذاتية…</div>
        <div style="font-size:12px;color:#999;">ATS-Optimized · 15-30 ثانية</div>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
  }

  function clearAnalysis() {
    const p = $("aiAnalysisPanel");
    if (p) p.innerHTML = `<div style="color:rgba(255,255,255,0.2);text-align:center;padding:20px;">⏳ جاري التحليل…</div>`;
  }

  function showError(msg) {
    const out = $("aiCVOutput");
    if (out) out.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:380px;gap:12px;text-align:center;padding:24px;">
        <div style="font-size:44px;">⚠️</div>
        <div style="font-size:14px;font-weight:700;color:#f87171;">حدث خطأ</div>
        <div style="font-size:12px;color:#999;max-width:380px;">${msg}</div>
      </div>`;
    setStatus("⚠️ خطأ", false, "#f87171");
  }

  // ── Print ──────────────────────────────────────────────────
  function handlePrint() {
    if (!lastCVHtml) return;
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CV - Abdelrahman Khater</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif}
      @page{size:A4;margin:15mm}@media print{body{-webkit-print-color-adjust:exact}}</style>
      </head><body><div style="max-width:760px;margin:0 auto;padding:20px;">${lastCVHtml}</div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // ── Open / Close modal ─────────────────────────────────────
  function openModal() {
    const modal = $("aiCVModal");
    if (!modal) return;
    // Pre-fill JD from main textarea
    const jdMain = $("jd"), aiJd = $("aiJdInput");
    if (jdMain?.value.trim() && aiJd && !aiJd.value) aiJd.value = jdMain.value.trim();
    // Restore key
    const ki = $("aiKeyInput");
    if (ki && !ki.value) ki.value = loadKey();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const m = $("aiCVModal");
    if (m) m.style.display = "none";
    document.body.style.overflow = "";
  }

  // ── Init ───────────────────────────────────────────────────
  window.addEventListener("DOMContentLoaded", () => {
    // Inject global CSS animations
    const s = document.createElement("style");
    s.textContent = `
      @keyframes spin      { to { transform: rotate(360deg); } }
      @keyframes glowGreen { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 0 8px rgba(74,222,128,0.35)} }
      #aiGenerateBtn:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.12); }
      #aiChatSend:hover:not(:disabled)    { filter:brightness(1.15); }
      #btnAITailor:hover  { transform:translateY(-1px); filter:brightness(1.15); }
      #aiCVApply:hover    { filter:brightness(1.12); }
    `;
    document.head.appendChild(s);

    // Disable chat until CV is generated
    const chatInput = $("aiChatInput"), chatSend = $("aiChatSend");
    if (chatInput) { chatInput.disabled = true; chatInput.style.opacity = "0.4"; chatInput.placeholder = "اضغط توليد أولاً…"; }
    if (chatSend)  { chatSend.disabled  = true; chatSend.style.opacity  = "0.4"; }

    // Wire events
    $("btnAITailor") ?.addEventListener("click",  openModal);
    $("aiCVClose")   ?.addEventListener("click",  closeModal);
    $("aiCVPrint")   ?.addEventListener("click",  handlePrint);
    $("aiCVApply")   ?.addEventListener("click",  handleApply);
    $("aiGenerateBtn")?.addEventListener("click", handleGenerate);
    $("aiChatSend")  ?.addEventListener("click",  handleChat);
    $("aiCVModal")   ?.addEventListener("click",  e => { if (e.target === $("aiCVModal")) closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

    // Ctrl+Enter to generate
    $("aiJdInput")?.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleGenerate();
    });
    // Enter to send chat (Shift+Enter = newline)
    $("aiChatInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); }
    });
    // Auto-resize chat textarea
    $("aiChatInput")?.addEventListener("input", function() {
      this.style.height = "52px";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });

    // Key toggle
    $("aiKeyToggle")?.addEventListener("click", () => {
      const ki = $("aiKeyInput");
      if (!ki) return;
      ki.type = ki.type === "password" ? "text" : "password";
      $("aiKeyToggle").textContent = ki.type === "password" ? "👁" : "🙈";
    });
  });

})();
