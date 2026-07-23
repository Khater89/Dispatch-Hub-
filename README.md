# Dynamic CV — GitHub Pages Setup

## 🚀 الرفع على GitHub Pages

### الخطوة ١ — أنشئ Repository
1. روح [github.com/new](https://github.com/new)
2. اسم الـ repo: `dynamic-cv` (أو أي اسم)
3. اضغط **Create repository**

### الخطوة ٢ — ارفع الملفات
```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/USERNAME/dynamic-cv.git
git push -u origin main
```
أو من GitHub.com: **Upload files** → اسحب كل الملفات

### الخطوة ٣ — فعّل GitHub Pages
1. Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)**
4. Save

رابطك سيكون: `https://USERNAME.github.io/dynamic-cv`

---

## ⚙️ إعداد Google OAuth2

### ١. Google Cloud Console
1. روح [console.cloud.google.com](https://console.cloud.google.com)
2. أنشئ مشروع جديد
3. **APIs & Services** → **Enable APIs** → فعّل **Google Drive API**
4. **Credentials** → **Create OAuth 2.0 Client ID**
5. النوع: **Web application**
6. Authorized JavaScript origins:
   ```
   https://USERNAME.github.io
   ```
7. انسخ الـ Client ID

### ٢. ضع الـ Client ID في google_config.js
```js
window.GOOGLE_CLIENT_ID = "الصق_هنا.apps.googleusercontent.com";
```

### ٣. ارفع التغيير
```bash
git add google_config.js
git commit -m "add Google Client ID"
git push
```

---

## 🔑 مفاتيح أخرى

**drive_config.js** — folder_id و api_key للقراءة من Drive:
```js
const DRIVE_CONFIG = {
  folder_id: "ID_المجلد_من_رابط_Drive",
  api_key:   "AIza...",
};
```

**AI CV Builder** — Anthropic API Key:
- احصل عليه من [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- أدخله مباشرة في الـ app (يُحفظ في المتصفح)
