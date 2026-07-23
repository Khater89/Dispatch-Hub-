/**
 * Google OAuth2 Configuration
 *
 * كيف تحصل على Client ID:
 * 1. روح console.cloud.google.com
 * 2. APIs & Services → Credentials
 * 3. + Create Credentials → OAuth 2.0 Client ID
 * 4. Application type: Web application
 * 5. Authorized JavaScript origins: أضف
 *    - http://localhost (للاختبار المحلي)
 *    - file:// (إذا تشغّل من ملف مباشرة — لن يعمل OAuth من file://)
 *    - أو رابط موقعك إذا رفعته
 * 6. انسخ Client ID والصقه هنا
 *
 * ملاحظة: OAuth2 لا يعمل من file:// — يحتاج http:// أو https://
 * للاختبار المحلي: python3 -m http.server 8080 ثم افتح localhost:8080
 */
window.GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com";
