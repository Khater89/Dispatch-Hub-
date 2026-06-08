# Hub Integration Guide

دليل التعديلات اللي لازم تنطبق على `index.html` الرئيسي للـ Hub.

ما عندي نسخة الـ Hub الحالية تبعك، فالـ snippets أدناه عامة. الفكرة بسيطة: كل tool card لازم يصير عندها `data-tool-key`، وزر admin لازم يصير عنده `data-admin-only`.

---

## 1. أضف الـ script في آخر `<body>`

قبل `</body>` مباشرة:

```html
<script src="config.js"></script>  <!-- لو مش موجود؛ بيوفّر window.API_BASE -->
<script defer src="assets/hub-tool-status.js"></script>
```

> الترتيب مهم: `config.js` يجي قبل `hub-tool-status.js`.

---

## 2. أضف `data-tool-key` لكل tool card

افترض هلق عندك شي زي هذا في الـ Hub:

```html
<a href="flex_webapp_v8/index.html" class="tool-card">
  <h3>Flex Tech Finder</h3>
  <p>Find the closest Tier 2 tech by ZIP</p>
</a>
```

عدّله ليصير:

```html
<a href="flex_webapp_v8/index.html" class="tool-card" data-tool-key="flex_tier2">
  <h3>Flex Tech Finder</h3>
  <p>Find the closest Tier 2 tech by ZIP</p>
</a>
```

طبّق نفس الشي لكل الأدوات الستة. الـ keys اللي زرعناها في الـ DB:

| href (تقريباً) | data-tool-key |
|---|---|
| `oncall_webapp_v8/...` | `oncall` |
| `flex_webapp_v8/...` | `flex_tier2` |
| `canada_w2/...` | `canada_w2` |
| `intl_suppliers/...` | `intl_suppliers` |
| `contractors/...` | `contractors` |
| `audit/...` | `audit` |

> 💡 لو الـ card عبارة عن `<div>` بدل `<a>`، نفس الشي ينطبق — `hub-tool-status.js` بيدوّر على أي عنصر فيه `data-tool-key`.

---

## 3. أضف زر Admin (بيظهر فقط للـ admins)

أي مكان مناسب في الـ Hub (مثلاً في الـ header أو الـ navigation bar):

```html
<a href="admin/index.html" class="hub-nav-btn" data-admin-only style="display:none">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
  Admin
</a>
```

**نقاط مهمة:**

- `data-admin-only` هو السحر — الـ script بيشيل الـ `display:none` تلقائياً للـ admins
- `style="display:none"` فيه عمداً لتجنّب flash لما الصفحة بتحمّل (الـ script بيضيف class `is-admin-visible` لو المستخدم admin)
- ممكن تغيّر شكل الزر — الـ `data-admin-only` هو اللي بيهم

---

## 4. (اختياري) تخصيص شكل الـ disabled cards

الـ `hub-tool-status.js` بيضيف class `tg-card-disabled` للـ disabled cards، مع badge "DISABLED" تلقائياً.

لو بدك تخصّص الـ overlay بشكل مختلف، تجاوز الـ CSS:

```html
<style>
  [data-tool-key].tg-card-disabled {
    opacity: 0.4;          /* أكتر تعتيم */
    filter: grayscale(1);  /* رمادي بالكامل */
  }
  [data-tool-key].tg-card-disabled::after {
    /* خصّص الـ badge كما تشاء */
    background: #ef4444 !important;
    color: white !important;
  }
</style>
```

---

## 5. اختبار سريع

1. بعد كل التعديلات، افتح الـ Hub
2. لو إنت admin، الزر "Admin" لازم يظهر بعد ثانية تقريباً (delay بسبب fetch)
3. روح لـ `admin/index.html` وعطّل أي أداة
4. ارجع للـ Hub → الـ card تبعها لازم تكون رمادية مع badge "DISABLED"
5. اضغط عليها → toast بيطلع، ما يتم redirect

---

## مخطّط الـ Data Flow

```
┌──────────────────────┐         ┌─────────────────────┐
│  admin/index.html    │         │ hub index.html      │
│                      │         │                     │
│  POST /tool-status   │         │ GET /tool-status    │
│  POST /admins        │         │  (greys cards)      │
│  DELETE /admins      │         │                     │
└──────────┬───────────┘         └──────────┬──────────┘
           │                                │
           │                                │
           ▼                                ▼
    ┌─────────────────────────────────────────────┐
    │ Supabase Edge Function: /tool-status        │
    │  - validates JWT                            │
    │  - checks admin_users for write ops         │
    │  - reads/writes tool_status table           │
    └──────────┬──────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────┐
    │ Postgres (RLS-protected)                    │
    │   tool_status    [admin write, all read]    │
    │   admin_users    [admin write, admin read]  │
    └─────────────────────────────────────────────┘

    Each tool's index.html includes tool-gate.js,
    which fetches /tool-status on load and blocks
    the page if the tool is disabled.
```
