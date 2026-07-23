# Dispatch Hub — Admin & Tool Status System

نظام كامل لإدارة تفعيل/تعطيل الأدوات في الـ Hub، مع لوحة admin مستقلة.

---

## ما اللي بيعمله

- **Admin بيقدر يعطّل أي أداة** من لوحة تحكم في `admin/index.html`
- **رسالة تعطيل اختيارية** (مثال: "Down for maintenance until 5 PM")
- **الأدوات المعطّلة بتظهر رمادية** في الـ Hub، والضغط بيعطي toast بسبب التعطيل
- **لو حدا حاول يفتح أداة معطّلة مباشرة** من URL، بيشوف صفحة "Tool Disabled" بدل المحتوى
- **إدارة الـ admins** — إضافة/حذف admins من نفس اللوحة
- **زر "Admin" في الـ Hub** بيظهر فقط للـ admins
- **Cache 30 ثانية** عشان ما يضرب الـ API كل صفحة — التغييرات بتنتشر خلال نص دقيقة بحد أقصى

---

## شجرة الملفات بعد التركيب

```
hub-root/
├── index.html                          ← (الموجود) — لازم يصير فيه data-tool-key على الـ cards
├── config.js
├── admin/
│   └── index.html                      ← جديد
├── assets/
│   ├── theme.css                       ← (موجود)
│   ├── glass.css                       ← (موجود)
│   ├── auth-config.js                  ← (موجود)
│   ├── auth-client.js                  ← (موجود)
│   ├── tool-gate.js                    ← جديد
│   └── hub-tool-status.js              ← جديد
├── flex_webapp_v8/
│   └── index.html                      ← مُحدَّث (3 أسطر زادو لتفعيل الـ gate)
├── oncall_webapp_v8/
├── canada_w2/
├── intl_suppliers/
├── contractors/
└── audit/

# على Supabase (مش جزء من المشروع المنشور):
supabase/
├── 001_admin_tool_status.sql           ← شغّله في SQL Editor
└── tool-status/
    └── index.ts                        ← Edge Function
```

---

## خطوات التركيب

### 1. تشغيل الـ SQL Migration

افتح **Supabase Dashboard → SQL Editor → New Query** والصق محتوى `supabase/001_admin_tool_status.sql` وشغّله.

هذا بينشئ جدولين (`admin_users`, `tool_status`)، function مساعدة (`is_admin`)، و RLS policies، ويزرع الأدوات الستة.

### 2. تعيين أول Admin

في نهاية ملف الـ SQL في تعليق فيه الـ statement اللازم. شيله من الـ comment وغيّر الإيميل لإيميلك ثم شغّله:

```sql
insert into public.admin_users (user_id, email)
select id, email from auth.users where lower(email) = lower('akhater@acuative.com')
on conflict (user_id) do nothing;
```

> ⚠️ المستخدم لازم يكون سجّل دخوله مرّة واحدة على الأقل (موجود في `auth.users`). لو ما سجّل بعد، هذا الـ statement ما رح يضيف شي.

### 3. نشر الـ Edge Function

في Supabase Dashboard → **Edge Functions → Deploy a new function**:

- اسم الـ function: `tool-status`
- الكود: محتوى `supabase/tool-status/index.ts`

> ⚠️ تأكد إن اسم الفنكشن ما فيه أي extension زيادة (تذكّر مشكلة `intl_suppliers_data.ts.ts` السابقة). الاسم لازم يكون `tool-status` بالضبط.

الـ function بتحتاج متغيرات بيئة جاهزة افتراضياً عند Supabase:
- `SUPABASE_URL` ✓
- `SUPABASE_ANON_KEY` ✓
- `SUPABASE_SERVICE_ROLE_KEY` ✓

ما في إعدادات إضافية مطلوبة.

### 4. نسخ ملفات الـ frontend

- `assets/tool-gate.js` → في مجلد `assets/`
- `assets/hub-tool-status.js` → في مجلد `assets/`
- `admin/index.html` → في مجلد `admin/` (مجلد جديد بمستوى الـ Hub)

### 5. تعديل صفحة الـ Hub الرئيسية (`index.html`)

بدّك تعمل تعديلين:

**أ) أضف الـ script في آخر الـ body:**

```html
<script defer src="assets/hub-tool-status.js"></script>
```

**ب) أضف `data-tool-key` لكل tool card، وزر admin محصور:**

شوف تفاصيل التعديلات الكاملة في `HUB_INTEGRATION.md`.

### 6. تحديث الأدوات الستة

كل أداة لازم تضيف 3 أسطر في الـ `<head>`. شوف `flex_webapp_v8_updated/index.html` للنسخة الكاملة المُعدَّلة، أو طبّق التعديل يدوياً على باقي الأدوات بنفس النمط:

```html
<!-- Tool gate — must come BEFORE other scripts -->
<script>window.__toolGateKey = 'TOOL_KEY_HERE';</script>
<style id="tool-gate-hide">body{visibility:hidden}</style>
<script defer src="../assets/tool-gate.js"></script>
```

استبدل `TOOL_KEY_HERE` بـ:

| الأداة | tool_key |
|---|---|
| On-Call Lookup | `oncall` |
| Flex Tech Finder (Tier 2) | `flex_tier2` |
| Canada Dispatch W2 | `canada_w2` |
| International Suppliers | `intl_suppliers` |
| Contractors | `contractors` |
| Audit & Validation | `audit` |

> هذي الـ keys هي نفسها اللي زرعناها في الـ SQL. لو غيّرتها هناك، لازم تتطابق هون.

---

## كيف بتجرّب الـ system

1. افتح `admin/index.html` بعد ما تكون أضفت نفسك كأول admin
2. عطّل أي أداة (مثلاً Flex)
3. حاول تفتح الأداة من URL مباشرة → بتشوف صفحة "Disabled"
4. ارجع للـ Hub → الـ card الخاصة بالأداة رمادية مع badge "DISABLED"
5. اضغط الـ card → بتطلع toast بسبب التعطيل
6. فعّلها من جديد → كل شي يرجع طبيعي

---

## أمان

- **RLS policies** ما بتسمح إلا للـ admins بتعديل `tool_status` أو `admin_users`
- **الـ Edge Function** بتفحص الـ admin status من الـ DB (مش من user metadata الممكن يتزوّر)
- **`is_admin()` function** معرّفة `security definer` عشان ما تدور في RLS recursion
- **fail-open للـ gate** عمداً: لو ما قدر يتواصل مع الـ API، الأداة بتفتح طبيعي (ما بنحبس المستخدمين بسبب network blip)

---

## استكشاف الأخطاء

**Q: عطّلت أداة بس لسا بتفتح**
A: الـ cache مدّته 30 ثانية. انتظر، أو افتح Console واكتب `sessionStorage.clear()` ثم reload.

**Q: ضغطت "Add admin" بس طلعلي "user_not_found"**
A: الشخص لازم يسجّل دخول مرة واحدة على الأقل قبل ما تقدر تعطيه صلاحية admin.

**Q: بشوف "Access Denied" في `admin/index.html` بس أنا أضفت نفسي**
A: تأكد إن الـ `user_id` في `admin_users` يطابق `auth.uid()` تبعك. الاستعلام في SQL لازم يلاقي حسابك في `auth.users` أولاً.

**Q: زر "Admin" ما ظاهر في الـ Hub**
A: الزر مخفي افتراضياً بـ `[data-admin-only]`. الـ `hub-tool-status.js` بيظهره فقط للـ admins. تأكد إن الزر فيه `data-admin-only` وإن الـ script محمّل.

**Q: شيلت نفسي بالغلط من `admin_users` ومحدش admin هلأ**
A: ارجع للـ Supabase SQL Editor وشغّل الـ insert من جديد. الـ Dashboard بيتجاوز RLS.
