# LOGIN_AUTH_SETUP.md

This project now starts with **Supabase Auth login** and is locked to the owner email:

- **Username label:** `khater`
- **Owner email:** `akhater@acuative.com`

## What changed

- Added real login/session handling to:
  - `index.html`
  - `admin_upload.html`
  - `oncall_webapp_v8/index.html`
  - `flex_webapp_v8/index.html`
  - `canada_dispatch_w2/index.html`
  - `_intl_suppliers_decoded.html`
- Protected backend API routes with **Bearer JWT** from Supabase Auth.
- Removed bundled local tech lists from public JS files so sensitive data loads from the protected cloud API instead.
- Moved International Suppliers data to a protected API response.

## 1) Put your Supabase anon key in the frontend

Open:

- `assets/auth-config.js`

Replace:

- `REPLACE_WITH_SUPABASE_ANON_KEY`

with your real Supabase **anon public key**.

> The Supabase URL is already set to:
> `https://whocxxcqnjhvqmsldbkz.supabase.co`

## 2) Create the owner account

Use **one** of these methods:

### Option A — easiest
Enable Email/Password signups temporarily in Supabase Auth, open the site, and click:

- **Create owner account**

using:

- Email: `akhater@acuative.com`
- Password: your chosen password

Then disable public signups again if you want tighter control.

### Option B — dashboard
Create the user directly in **Supabase Dashboard → Authentication → Users** with:

- Email: `akhater@acuative.com`

After creating the user, sign in from the app.

## 3) Deploy the Edge Function

Deploy the updated function code:

```bash
supabase functions deploy api
```

## 4) Optional secrets

No manual admin token is required anymore for the app flow.

You may still keep these env vars if you want a backup policy, but the current app uses Supabase login:

```bash
supabase secrets set ADMIN_EMAILS=akhater@acuative.com
supabase secrets set ADMIN_USERNAME=khater
```

## 5) Important security note

This version is much safer because:
- protected API routes now require a logged-in owner session
- bundled tech lists were removed from public JS
- old nested zip copies and source xlsx files were removed from the package

If later you want **invite-only staff users** or **role-based access**, the next step would be:
- allowlist table in Supabase
- roles such as `owner`, `admin`, `viewer`
- Row Level Security policies
