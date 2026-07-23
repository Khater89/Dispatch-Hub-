# Dynamic CV — دليل الاستخدام الكامل

## 📋 فهرس المحتوى
1. [الإعداد الأولي](#الإعداد-الأولي)
2. [واجهة التطبيق](#واجهة-التطبيق)
3. [التابات والتخصصات](#التابات-والتخصصات)
4. [تعديل الـ CV](#تعديل-الـ-cv)
5. [AI CV Builder](#ai-cv-builder)
6. [الـ Merge](#الـ-merge)
7. [إضافة مهارات وشهادات](#إضافة-مهارات-وشهادات)
8. [Google Drive Sync](#google-drive-sync)
9. [الاستخراج من Drive](#الاستخراج-من-drive)
10. [اختصارات لوحة المفاتيح](#اختصارات-لوحة-المفاتيح)

---

## 1. الإعداد الأولي

### رفع على GitHub Pages
```
1. github.com/new → أنشئ repo باسم "dynamic-cv"
2. Upload files → ارفع كل محتوى الـ ZIP
3. Settings → Pages → Branch: main → Save
4. رابطك: https://USERNAME.github.io/dynamic-cv
```

### Anthropic API Key (للـ AI Builder)
```
1. console.anthropic.com/settings/keys
2. Create Key
3. الصقه في حقل API Key داخل AI Builder
```

### Google Drive Sync (اختياري)
```
1. console.cloud.google.com → مشروع جديد
2. Enable Google Drive API
3. Create OAuth 2.0 Client ID (Web app)
4. Authorized origins: https://USERNAME.github.io
5. افتح google_config.js وضع Client ID
6. ارفع مجدداً على GitHub
7. اضغط "Sign in with Google" في الـ app
```

---

## 2. واجهة التطبيق

```
┌─ TOPBAR ──────────────────────────────────────────────────┐
│  [K] Abdelrahman Khater    [⊕ Merge]  [✕ Exit Merge]      │
└───────────────────────────────────────────────────────────┘
┌─ SIDEBAR ─────┬─ MAIN CONTENT ─────────────────────────────┐
│               │                                             │
│ Focus Area    │  Name / Contact / Headline                  │
│ [Electrical]  │                                             │
│ [Network]     │  Professional Summary                       │
│ [Software]    │  Key Highlights                             │
│ [PM]          │  Relevant Experience                        │
│               │  Projects                                   │
│ JD Tailoring  │  Skills                                     │
│               │  Certifications                             │
│ Search        │  Education                                   │
│               │                                             │
│ Quick Add     │                                             │
│ [Skills/Certs]│                                             │
│               │                                             │
│ [✏️ Edit Mode]│                                             │
│ [⬇ Export]   │                                             │
│               │                                             │
│ ☁ Drive       │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

---

## 3. التابات والتخصصات

### التابات الافتراضية
| التاب | يشمل |
|-------|-------|
| **Electrical Engineering** | QC • Power Cables • IEC/BS • Labs |
| **Network Engineering** | NOC • Tickets • SLA • Troubleshooting |
| **Software Engineering** | Data Engineering • Web Dev • Full-stack |
| **Project Management** | Coordination • Maintenance • Dispatch |

### عمليات التاب
عند hover على أي تاب تظهر زرّان:
- **↺ Reset** — يمسح كل محتوى هذا التاب (مع تأكيد)
- **⬇ Extract** — يستخرج تلقائياً من ملفات Drive

### إضافة تاب جديد
```
Sidebar → Quick Add → [＋ Tab]
→ اكتب اسم التاب والـ Subtitle
→ ＋ Add Tab
→ استخدم Extract أو Edit Mode لملء المحتوى
```

### الـ Branches
بعض التابات (مثل Software) فيها branches:
- **Data Engineering** — SQL • ETL • Spark
- **Web Development** — Full-stack • APIs

---

## 4. تعديل الـ CV

### تفعيل وضع التعديل
```
Sidebar → ✏️ Edit Mode  (يتحول لـ "Editing ON")
```

شريط أحمر يظهر في الأعلى يؤكد تفعيل الوضع.

### ما يمكن تعديله

| العنصر | كيفية التعديل | كيفية الحذف |
|--------|--------------|-------------|
| الاسم | Double-click | — |
| الموقع | Double-click | — |
| الملخص | Double-click | — |
| عنوان الخبرة | Double-click | زر ✕ (hover) |
| الشركة والتواريخ | Double-click على السطر الرمادي | — |
| Bullet point | Double-click | زر ✕ صغير |
| مهارة | Double-click لتعديل | زر ✕ صغير |
| شهادة | Double-click | زر ✕ |
| اسم مشروع | Double-click | زر ✕ (hover) |
| وصف مشروع | Double-click | — |

### إضافة عناصر جديدة
في وضع التعديل تظهر أزرار ＋ في أسفل كل قسم:
- **＋ إضافة خبرة جديدة** — نموذج كامل
- **＋ إضافة نقطة** — داخل كل خبرة
- **＋ مهارة** — تضاف للتاب الحالي
- **＋ إضافة مشروع** — نموذج جديد
- **＋ إضافة شهادة** — مع تاريخ وجهة

---

## 5. AI CV Builder

يولّد CV كامل ATS-optimized يُطبَّق على حقول الـ app.

### الخطوات
```
Sidebar → ✨ AI Builder
↓
① أدخل Anthropic API Key (مرة واحدة، يُحفظ)
② الصق الوصف الوظيفي الكامل
③ اضغط ✨ توليد السيرة الذاتية (15-30 ثانية)
```

### ما يتم توليده
- **تحليل** (اليسار): متطلبات الـ JD + نسبة التطابق + نصائح
- **CV كامل** (اليمين): HTML جاهز للطباعة

### تطبيق على الـ CV
```
بعد التوليد → اضغط ✅ تطبيق على الـ CV
```
يُحدَّث تلقائياً:
- Summary
- Experience (bullets مكتوبة بلغة الـ JD)
- Skills (الأكثر صلة أولاً)
- يتحول للتاب المناسب تلقائياً (electrical/network/data/pm)

### تعديل الـ CV المُولَّد (Chat)
```
في نفس النافذة — حقل في الأسفل:
"اجعل الملخص أقصر"
"ركز على خبرة NOC"
"أضف مهارة Fortinet"
"اجعله أكثر احترافية"
```
Claude يعدّل بدون إعادة توليد كامل.

### Export PDF
```
⬇ Export PDF  → يفتح نافذة طباعة A4
```

---

## 6. الـ Merge

يدمج خبرات من تابات متعددة في CV واحد.

### كيفية الاستخدام
```
Topbar → ⊕ Merge
↓
① اختر التابات المطلوبة (Electrical + Network مثلاً)
② اضغط "Build Merged CV"
```

### بعد الـ Merge
يظهر قسم **Merged CV Controls** في الأعلى:
- **↕ Auto sort by date** — يرتّب الخبرات حسب التاريخ
- **↺ Reset** — يعيد بناء الـ Merge من التابات
- **↑ ↓** على كل خبرة — لتغيير الترتيب يدوياً
- **حقل التاريخ** — لتعديل التواريخ مباشرة

### تعديل الـ Merged CV
```
✏️ Edit Mode  (بعد Merge)
→ كل شيء قابل للتعديل بحرية كاملة
→ لا يؤثر على التابات الأصلية
→ يمكن إضافة/حذف خبرات ومشاريع ومهارات
```

---

## 7. إضافة مهارات وشهادات

### إضافة مهارة (AI Classification)
```
Quick Add → ⚡ Skills
→ اكتب اسم المهارة (بالإنجليزية)
→ اضغط ＋
→ Claude يصنّفها للتاب المناسب ويخبرك لماذا
```
مثال: "Fortinet NSE4" → يضعها في Network tab

### إضافة شهادة + ملف
```
Quick Add → 🎓 Certs
→ اسم الشهادة (مطلوب)
→ الجهة المانحة
→ التاريخ
→ ارفع ملف PDF أو صورة (اختياري)
   - إذا مسجّل بـ Google: يرفع لـ Drive تلقائياً
   - إذا لا: يحفظ محلياً
→ ＋ Add Certificate
```

---

## 8. Google Drive Sync

### كيف يعمل
```
فتح الـ App
  ├── يقرأ من localStorage فوراً (بدون إنترنت)
  └── في الخلفية: يجيب آخر نسخة من Drive

أي تعديل (skill/cert/experience...)
  ├── يحفظ في localStorage فوراً
  └── بعد 3 ثواني: يرفع cv_data.json لـ Drive
```

### حالات الـ Status
| الأيقونة | المعنى |
|---------|--------|
| ✓ Drive محدَّث | كل شيء محفوظ |
| ● تغييرات غير محفوظة | سيُحفظ بعد 3 ثواني |
| ⬆ جاري الحفظ | يرفع الآن |
| ⚡ offline | لا إنترنت — محفوظ محلياً |
| 🔑 غير مسجّل | اضغط Sign in |

### حفظ يدوي
```
⬆ Save Now
```

---

## 9. الاستخراج من Drive (Extract)

يقرأ كل ملفات Drive (PDFs + صور) ويستخرج منها بيانات الـ CV.

### كيف يعمل
```
Hover على تاب → ⬇ Extract
↓
Claude يقرأ كل ملفات Drive:
  • PDFs: يستخرج خبرات ومهارات وشهادات
  • صور الشهادات: يتعرف على اسم الشهادة والجهة
  
يُحدَّث التاب بـ:
  ✅ Summary جديد
  ✅ Experience مع bullets مُحسَّنة
  ✅ Skills مستخرجة من الـ PDFs
  ✅ شهادات مكتشفة من الصور
```

### متطلبات Extract
- ✅ Anthropic API Key مُدخَّل في AI Builder
- ✅ drive_config.js فيه folder_id و api_key
- ✅ المجلد مشارك (Anyone with link → Viewer)

---

## 10. اختصارات لوحة المفاتيح

| الاختصار | الوظيفة |
|---------|---------|
| `Ctrl + Enter` | توليد الـ CV في AI Builder |
| `Enter` | إرسال رسالة Chat في AI Builder |
| `Shift + Enter` | سطر جديد في Chat |
| `Escape` | إغلاق أي modal |
| Double-click | تعديل أي نص (Edit Mode) |

---

## 🗂️ هيكل الملفات

```
DyCV-pro/
├── index.html          — الواجهة الرئيسية
├── styles.css          — التصميم
├── data.js             — بيانات الـ CV الأصلية
├── app.js              — منطق التطبيق الأساسي
├── ai_tailor.js        — AI CV Builder (Claude)
├── cv_editor.js        — وضع التعديل inline
├── cv_manager.js       — Quick Add (Skills/Certs/Tabs)
├── drive_db.js         — Google Drive sync (OAuth)
├── drive_manager.js    — عرض مجلدات Drive
├── drive_config.js     — folder_id و api_key
└── google_config.js    — Google OAuth Client ID
```

---

## ❓ حل المشاكل الشائعة

| المشكلة | الحل |
|---------|------|
| AI Builder لا يعمل | تحقق من API Key في console.anthropic.com/settings/keys |
| Extract يفشل | تأكد من drive_config.js و API Key |
| Drive لا يتزامن | تأكد من google_config.js + رابط GitHub Pages |
| الـ CV لا يتحدث بعد Apply | أغلق الـ modal وانتظر ثانية |
| وضع التعديل لا يظهر | اضغط ✏️ Edit Mode في الـ sidebar |
