/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  chatbot.js — Floating CV Assistant                          ║
 * ║  Mode 1: CV Editor  — edit CV via natural language           ║
 * ║  Mode 2: Interview  — practice Q&A based on CV + JD         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
(function () {
"use strict";

/* ── Helpers ─────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const esc = s => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function getKey()  { return localStorage.getItem("gemini_key") || ""; }
function getData() { return window.__cvApp?.getData() || window.CV_DATA || null; }
function getTab()  { return window.__cvApp?.getActiveTab() || "electrical"; }
function save()    { window.__cvApp?.save?.(); window.__cvApp?.renderAll?.(); }

/* ── State ───────────────────────────────────────────────────── */
let open    = false;
let mode    = "cv";      // "cv" | "interview"
let history = [];        // [{role, text}]
let interviewQ = [];     // pending interview questions
let qIndex     = 0;
let typing     = false;

/* ── Gemini call (uses cv.js geminiCall if available) ────────── */
async function callGemini(prompt, system) {
  const key = getKey();
  if (!key) throw new Error("أدخل Gemini API Key في AI Builder أولاً");

  // Use the shared geminiCall from cv.js if available
  if (typeof geminiCall === "function") {
    const full = system ? system + "\n\n" + prompt : prompt;
    return geminiCall(key, full);
  }

  // Fallback inline
  const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: (system ? system + "\n\n" : "") + prompt }] }],
      generationConfig: { maxOutputTokens: 2000, temperature: 0.4 }
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini لم يُرجع نصاً");
  return text;
}

/* ── Build CV context string ─────────────────────────────────── */
function buildContext() {
  const data = getData(); if (!data) return "No CV data.";
  const tab  = getTab();
  const p    = data.curated?.[tab] || {};
  const person = data.person || {};

  let ctx = `المرشح: ${person.name||"Abdelrahman Khater"} | ${person.location||"Amman, Jordan"}\n`;
  ctx += `التاب النشط: ${tab}\n\n`;

  if (p.summary) ctx += `الملخص: ${p.summary}\n\n`;

  ctx += `الخبرات:\n`;
  (p.experience||[]).forEach(e => {
    ctx += `• ${e.title} @ ${e.company} (${e.dates})\n`;
    (e.bullets||[]).slice(0,3).forEach(b => ctx += `  - ${b}\n`);
  });

  if ((p.skills||[]).length)
    ctx += `\nالمهارات: ${p.skills.slice(0,15).join(", ")}\n`;

  if ((p.certs||[]).length)
    ctx += `\nالشهادات: ${p.certs.map(c=>c.title||c.name).join(", ")}\n`;

  (data.education||[]).forEach(e =>
    ctx += `التعليم: ${e.degree||e.title} — ${e.school||e.institution} (${e.year||""})\n`
  );

  // Add JD if available
  const jdEl = $("jdInput");
  if (jdEl?.value?.trim()) ctx += `\nالوصف الوظيفي:\n${jdEl.value.trim().slice(0,800)}\n`;

  return ctx;
}

/* ══════════════════════════════════════════════════════════════
   MODE 1: CV EDITOR
══════════════════════════════════════════════════════════════ */
const CV_SYSTEM = `أنت مساعد CV ذكي ومتخصص. مهمتك تعديل بيانات الـ CV بناءً على طلبات المستخدم.

عندك صلاحية:
- إضافة/حذف/تعديل المهارات
- إضافة/حذف/تعديل الخبرات وبولطاتها
- تعديل الملخص المهني
- إضافة/حذف الشهادات
- تعديل أي معلومة في الـ CV

الرد يكون بأحد شكلين:
1. إذا طلب المستخدم تعديلاً: ارجع JSON فقط بهذا الشكل:
{"action":"edit","ops":[{"type":"add_skill"|"del_skill"|"edit_summary"|"add_exp"|"del_exp"|"add_cert"|"del_cert"|"edit_bullet","data":{...}}],"message":"رسالة تأكيد للمستخدم"}

2. إذا كان سؤالاً أو نصيحة: ارجع JSON:
{"action":"chat","message":"ردك هنا"}

أنواع العمليات:
- add_skill:    {"skill": "اسم المهارة"}
- del_skill:    {"skill": "اسم المهارة الكاملة أو جزء منها"}
- edit_summary: {"summary": "النص الجديد"}
- add_exp:      {"title":"","company":"","location":"","dates":"","bullets":[""]}
- del_exp:      {"title": "جزء من عنوان الخبرة"}
- add_cert:     {"title":"","issuer":"","date":""}
- del_cert:     {"title": "جزء من اسم الشهادة"}
- edit_bullet:  {"exp_title": "جزء من عنوان الخبرة", "old": "جزء من البولطة القديمة", "new": "البولطة الجديدة"}
- add_bullet:   {"exp_title": "جزء من عنوان الخبرة", "bullet": "البولطة الجديدة"}

مهم: ارجع JSON صالح فقط بدون ماركداون.`;

async function handleCVMessage(userText) {
  const ctx = buildContext();
  const messages = history.slice(-6).map(h => `[${h.role}]: ${h.text}`).join("\n");

  const prompt = `سياق الـ CV الحالي:\n${ctx}\n\nمحادثة سابقة:\n${messages}\n\nطلب المستخدم: ${userText}`;

  const raw   = await callGemini(prompt, CV_SYSTEM);
  const clean = raw.replace(/^```json?\n?/i,"").replace(/\n?```$/m,"").trim();

  let parsed;
  try { parsed = JSON.parse(clean); }
  catch(_) { return { action:"chat", message: raw }; }

  if (parsed.action === "edit" && parsed.ops?.length) {
    applyOps(parsed.ops);
  }

  return parsed;
}

function applyOps(ops) {
  const data = getData(); if (!data) return;
  const tab  = getTab();
  if (!data.curated) data.curated = {};
  if (!data.curated[tab]) data.curated[tab] = {};
  const p = data.curated[tab];

  ops.forEach(op => {
    const d = op.data || {};

    switch(op.type) {

      case "add_skill":
        if (!p.skills) p.skills = [];
        if (!p.skills.some(s => s.toLowerCase() === (d.skill||"").toLowerCase()))
          p.skills.unshift(d.skill);
        break;

      case "del_skill":
        if (p.skills) {
          const q = (d.skill||"").toLowerCase();
          p.skills = p.skills.filter(s => !s.toLowerCase().includes(q));
        }
        break;

      case "edit_summary":
        if (d.summary) p.summary = d.summary;
        break;

      case "add_exp":
        if (!p.experience) p.experience = [];
        p.experience.unshift({
          title:   d.title   || "",
          company: d.company || "",
          location:d.location|| "",
          dates:   d.dates   || "",
          bullets: d.bullets || []
        });
        break;

      case "del_exp":
        if (p.experience) {
          const q = (d.title||"").toLowerCase();
          p.experience = p.experience.filter(e => !e.title.toLowerCase().includes(q));
        }
        break;

      case "add_cert":
        if (!p.certs) p.certs = [];
        p.certs.push({ title:d.title||"", name:d.title||"", issuer:d.issuer||"", date:d.date||"" });
        break;

      case "del_cert":
        if (p.certs) {
          const q = (d.title||"").toLowerCase();
          p.certs = p.certs.filter(c => !(c.title||c.name||"").toLowerCase().includes(q));
        }
        break;

      case "add_bullet":
        if (p.experience) {
          const q = (d.exp_title||"").toLowerCase();
          const exp = p.experience.find(e => e.title.toLowerCase().includes(q));
          if (exp) { if (!exp.bullets) exp.bullets=[]; exp.bullets.push(d.bullet||""); }
        }
        break;

      case "edit_bullet":
        if (p.experience) {
          const q = (d.exp_title||"").toLowerCase();
          const exp = p.experience.find(e => e.title.toLowerCase().includes(q));
          if (exp && exp.bullets) {
            const old = (d.old||"").toLowerCase();
            const idx = exp.bullets.findIndex(b => b.toLowerCase().includes(old));
            if (idx !== -1) exp.bullets[idx] = d.new || exp.bullets[idx];
          }
        }
        break;
    }
  });

  save();
}

/* ══════════════════════════════════════════════════════════════
   MODE 2: INTERVIEW PREP
══════════════════════════════════════════════════════════════ */
const INTERVIEW_SYSTEM = `أنت محاور HR خبير. بناءً على الـ CV والوصف الوظيفي، سوّل أسئلة مقابلة واقعية وقيّم الإجابات.

عند طلب أسئلة: ارجع JSON فقط:
{"action":"questions","questions":["السؤال 1","السؤال 2","السؤال 3","السؤال 4","السؤال 5"]}

عند تقييم إجابة: ارجع JSON فقط:
{"action":"feedback","score":1-10,"feedback":"تقييمك التفصيلي","tip":"نصيحة لتحسين الإجابة","model_answer":"الإجابة المثالية بناءً على الـ CV"}

مهم: JSON صالح فقط بدون ماركداون.`;

async function startInterview() {
  const ctx = buildContext();
  const prompt = `بناءً على هذا الـ CV والوصف الوظيفي، اعطني 5 أسئلة مقابلة واقعية ومتنوعة:\n\n${ctx}`;

  showTyping("جاري تجهيز أسئلة المقابلة…");

  try {
    const raw   = await callGemini(prompt, INTERVIEW_SYSTEM);
    const clean = raw.replace(/^```json?\n?/i,"").replace(/\n?```$/m,"").trim();
    const parsed = JSON.parse(clean);

    interviewQ = parsed.questions || [];
    qIndex = 0;

    if (!interviewQ.length) throw new Error("لم يُنشئ أسئلة");

    addBotMsg(`✅ جاهز! ${interviewQ.length} أسئلة مقابلة جاهزة.\n\n**السؤال 1/${interviewQ.length}:**\n\n${interviewQ[0]}`);
  } catch(e) {
    addBotMsg(`⚠️ ${e.message}`);
  }
}

async function handleInterviewAnswer(userAnswer) {
  if (!interviewQ.length) {
    await startInterview();
    return;
  }

  const currentQ = interviewQ[qIndex];
  const ctx = buildContext();

  const prompt = `السؤال: ${currentQ}\n\nإجابة المرشح: ${userAnswer}\n\nبيانات الـ CV:\n${ctx}`;

  const raw   = await callGemini(prompt, INTERVIEW_SYSTEM);
  const clean = raw.replace(/^```json?\n?/i,"").replace(/\n?```$/m,"").trim();

  let parsed;
  try { parsed = JSON.parse(clean); } catch(_) { return raw; }

  const scoreBar = "⭐".repeat(Math.min(parsed.score||5,10));
  let reply = `**تقييمك: ${parsed.score}/10** ${scoreBar}\n\n${parsed.feedback}`;
  if (parsed.tip)          reply += `\n\n💡 **نصيحة:** ${parsed.tip}`;
  if (parsed.model_answer) reply += `\n\n✨ **إجابة مثالية:**\n${parsed.model_answer}`;

  qIndex++;
  if (qIndex < interviewQ.length) {
    reply += `\n\n---\n**السؤال ${qIndex+1}/${interviewQ.length}:**\n\n${interviewQ[qIndex]}`;
  } else {
    reply += `\n\n🎉 **انتهت المقابلة!** أجبت على ${interviewQ.length} أسئلة.\nاكتب "ابدأ" لجولة جديدة.`;
    interviewQ = []; qIndex = 0;
  }

  return reply;
}

/* ══════════════════════════════════════════════════════════════
   MESSAGE HANDLING
══════════════════════════════════════════════════════════════ */
async function sendMessage(text) {
  if (typing || !text.trim()) return;
  text = text.trim();

  addUserMsg(text);
  history.push({ role:"user", text });
  setInput("");
  typing = true;

  showTyping();

  try {
    let reply = "";

    if (mode === "interview") {
      if (/^(ابدأ|start|بدء|من البداية)/i.test(text)) {
        interviewQ=[]; qIndex=0;
        await startInterview();
        typing=false; return;
      }
      reply = await handleInterviewAnswer(text) || "";
    } else {
      const result = await handleCVMessage(text);
      reply = result?.message || "تم!";
      if (result?.action === "edit") reply = "✅ " + reply;
    }

    removeTyping();
    addBotMsg(reply);
    history.push({ role:"assistant", text: reply });

  } catch(e) {
    removeTyping();
    addBotMsg(`⚠️ ${e.message}`);
  } finally {
    typing = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   UI
══════════════════════════════════════════════════════════════ */
function addUserMsg(text) {
  const wrap = $("chatMsgs"); if (!wrap) return;
  const div = document.createElement("div");
  div.className = "chat-msg chat-msg-user";
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function addBotMsg(text) {
  const wrap = $("chatMsgs"); if (!wrap) return;
  const div = document.createElement("div");
  div.className = "chat-msg chat-msg-bot";
  // Simple markdown: **bold**
  div.innerHTML = esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function showTyping(msg) {
  removeTyping();
  const wrap = $("chatMsgs"); if (!wrap) return;
  const div = document.createElement("div");
  div.id = "chatTyping";
  div.className = "chat-msg chat-msg-bot chat-typing";
  div.innerHTML = `<span></span><span></span><span></span>${msg ? ` <small>${esc(msg)}</small>` : ""}`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function removeTyping() { $("chatTyping")?.remove(); }

function setInput(val) {
  const inp = $("chatInputEl"); if (inp) inp.value = val;
}

function switchMode(m) {
  mode = m;
  document.querySelectorAll(".chat-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode===m));
  const msgs = $("chatMsgs"); if (!msgs) return;
  msgs.innerHTML = "";
  history = [];

  if (m === "cv") {
    addBotMsg(`مرحباً! أنا مساعد الـ CV الخاص بك.\n\nيمكنك أن تقول مثلاً:\n• أضف مهارة Python\n• احذف خبرة الشركة X\n• عدّل الملخص ليكون أكثر تركيزاً على NOC\n• أضف شهادة CCNA من Cisco\n• أضف نقطة جديدة لخبرة Acuative`);
  } else {
    interviewQ=[]; qIndex=0;
    addBotMsg(`مرحباً! أنا سأجهّزك للمقابلة.\n\nسأسألك أسئلة مبنية على الـ CV والوصف الوظيفي وأقيّم إجاباتك.\n\nاكتب "ابدأ" لنبدأ! 🎯`);
  }
}

function toggleChat() {
  open = !open;
  const panel = $("chatPanel");
  const bubble = $("chatBubble");
  if (panel) panel.style.display = open ? "flex" : "none";
  if (bubble) {
    bubble.innerHTML = open ? "✕" : "💬";
    bubble.title = open ? "إغلاق" : "المساعد الذكي";
  }
}

/* ══════════════════════════════════════════════════════════════
   INJECT UI
══════════════════════════════════════════════════════════════ */
function injectUI() {
  const css = document.createElement("style");
  css.textContent = `
    #chatBubble {
      position:fixed; bottom:24px; right:24px; z-index:9000;
      width:54px; height:54px; border-radius:50%;
      background:linear-gradient(135deg,#c0392b,#8e1a10);
      color:#fff; font-size:22px; border:none; cursor:pointer;
      box-shadow:0 6px 24px rgba(192,57,43,.5);
      display:flex; align-items:center; justify-content:center;
      transition:transform .2s, box-shadow .2s;
    }
    #chatBubble:hover { transform:scale(1.08); box-shadow:0 8px 28px rgba(192,57,43,.65); }
    #chatBubble .badge {
      position:absolute; top:-4px; right:-4px;
      width:18px; height:18px; border-radius:50%;
      background:#10b981; border:2px solid #fff;
      font-size:9px; font-weight:900; display:flex;
      align-items:center; justify-content:center;
    }

    #chatPanel {
      position:fixed; bottom:90px; right:24px; z-index:8999;
      width:380px; height:580px; max-height:80vh;
      background:#fff; border-radius:20px;
      box-shadow:0 24px 80px rgba(0,0,0,.22);
      border:1px solid rgba(0,0,0,.08);
      display:flex; flex-direction:column; overflow:hidden;
    }

    .chat-header {
      background:linear-gradient(135deg,#1a1a2e,#2d1a3e);
      padding:14px 16px; flex-shrink:0;
      display:flex; align-items:center; gap:10px;
    }
    .chat-header-icon { font-size:22px; }
    .chat-header-title { font-weight:800; font-size:14px; color:#fff; }
    .chat-header-sub   { font-size:11px; color:rgba(255,255,255,.45); }

    .chat-mode-bar {
      display:flex; border-bottom:1px solid #eee; flex-shrink:0;
    }
    .chat-mode-btn {
      flex:1; padding:9px; border:none; background:#fafafa;
      font-size:12px; font-weight:700; cursor:pointer;
      color:#888; transition:all .15s;
    }
    .chat-mode-btn + .chat-mode-btn { border-left:1px solid #eee; }
    .chat-mode-btn.active { background:#fff; color:#c0392b; border-bottom:2px solid #c0392b; }

    #chatMsgs {
      flex:1; overflow-y:auto; padding:14px;
      display:flex; flex-direction:column; gap:10px;
      scroll-behavior:smooth;
    }

    .chat-msg {
      max-width:85%; padding:10px 13px;
      border-radius:14px; font-size:13px; line-height:1.6;
      word-break:break-word;
    }
    .chat-msg-user {
      align-self:flex-end; background:#c0392b;
      color:#fff; border-bottom-right-radius:4px;
    }
    .chat-msg-bot {
      align-self:flex-start; background:#f4f4f4;
      color:#1a1a2e; border-bottom-left-radius:4px;
    }
    .chat-typing {
      display:flex; align-items:center; gap:5px; padding:10px 14px;
    }
    .chat-typing span {
      width:7px; height:7px; border-radius:50%;
      background:#c0392b; animation:chatDot 1.2s infinite;
      display:inline-block;
    }
    .chat-typing span:nth-child(2) { animation-delay:.2s; }
    .chat-typing span:nth-child(3) { animation-delay:.4s; }
    .chat-typing small { font-size:11px; color:#888; margin-right:4px; }
    @keyframes chatDot {
      0%,80%,100% { transform:scale(.8); opacity:.5; }
      40%          { transform:scale(1.2); opacity:1; }
    }

    .chat-input-bar {
      padding:10px 12px; border-top:1px solid #eee;
      display:flex; gap:8px; flex-shrink:0; background:#fff;
    }
    #chatInputEl {
      flex:1; padding:9px 12px;
      border:1.5px solid #eee; border-radius:12px;
      font-size:13px; font-family:inherit; outline:none;
      resize:none; max-height:80px; overflow-y:auto;
      transition:border-color .15s;
    }
    #chatInputEl:focus { border-color:#c0392b; }
    #chatSendBtn {
      width:38px; height:38px; border-radius:12px;
      border:none; background:#c0392b; color:#fff;
      font-size:17px; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0; transition:background .15s;
    }
    #chatSendBtn:hover { background:#a93226; }
    #chatSendBtn:disabled { background:#ddd; cursor:default; }

    .chat-suggestions {
      display:flex; gap:6px; flex-wrap:wrap;
      padding:0 12px 10px; flex-shrink:0;
    }
    .chat-sug {
      padding:5px 10px; border-radius:99px;
      border:1.5px solid rgba(192,57,43,.3);
      background:#fff; color:#c0392b;
      font-size:11px; font-weight:600; cursor:pointer;
      white-space:nowrap; transition:all .15s;
    }
    .chat-sug:hover { background:#c0392b; color:#fff; }

    @media(max-width:600px){
      #chatPanel{ width:calc(100vw - 32px); right:16px; left:16px; }
    }

    @media print { #chatBubble, #chatPanel { display:none !important; } }
  `;
  document.head.appendChild(css);

  // Bubble
  const bubble = document.createElement("button");
  bubble.id = "chatBubble";
  bubble.title = "المساعد الذكي";
  bubble.innerHTML = `💬<div class="badge">AI</div>`;
  bubble.onclick = toggleChat;

  // Panel
  const panel = document.createElement("div");
  panel.id = "chatPanel";
  panel.style.display = "none";
  panel.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-icon">🤖</div>
      <div>
        <div class="chat-header-title">المساعد الذكي</div>
        <div class="chat-header-sub">مدعوم بـ Gemini · يعدّل CV ويحضّرك للمقابلة</div>
      </div>
    </div>
    <div class="chat-mode-bar">
      <button class="chat-mode-btn active" data-mode="cv"        onclick="window.__chatbot.switchMode('cv')">✏️ تعديل CV</button>
      <button class="chat-mode-btn"        data-mode="interview" onclick="window.__chatbot.switchMode('interview')">🎯 مقابلة</button>
    </div>
    <div id="chatMsgs"></div>
    <div class="chat-suggestions" id="chatSuggestions">
      <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">أضف مهارة Python</button>
      <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">حسّن الملخص</button>
      <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">شو نقاط ضعفي؟</button>
    </div>
    <div class="chat-input-bar">
      <textarea id="chatInputEl" placeholder="اكتب طلبك…" rows="1"></textarea>
      <button id="chatSendBtn" onclick="window.__chatbot.send()">↑</button>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  // Wire textarea
  $("chatInputEl")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); window.__chatbot.send(); }
  });

  // Initial welcome in CV mode
  switchMode("cv");

  // Update suggestions on mode change
  function updateSuggestions() {
    const sug = $("chatSuggestions"); if (!sug) return;
    if (mode === "interview") {
      sug.innerHTML = `
        <button class="chat-sug" onclick="window.__chatbot.suggest('ابدأ')">▶ ابدأ المقابلة</button>
        <button class="chat-sug" onclick="window.__chatbot.suggest('أعد السؤال')">↺ أعد السؤال</button>
      `;
    } else {
      sug.innerHTML = `
        <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">أضف مهارة Python</button>
        <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">حسّن الملخص</button>
        <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">شو نقاط ضعفي؟</button>
      `;
    }
  }

  const origSwitch = switchMode;
  window.__chatbot.switchMode = m => { origSwitch(m); updateSuggestions(); };
}

/* ══════════════════════════════════════════════════════════════
   EXPOSE PUBLIC API
══════════════════════════════════════════════════════════════ */
window.__chatbot = {
  send:       () => sendMessage($("chatInputEl")?.value || ""),
  suggest:    text => { setInput(text); sendMessage(text); },
  switchMode: m => switchMode(m),
  toggle:     toggleChat,
};

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectUI);
} else {
  injectUI();
}

})();
