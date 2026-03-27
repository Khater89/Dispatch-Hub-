# Single Owner Admin Setup

This package is patched so the only intended admin owner is:

- Username: `khater`
- Email: `akhater@acuative.com`

## Supabase secrets
Set these before deploying the `api` edge function:

```bash
supabase secrets set ADMIN_TOKEN=CHANGE_THIS_TO_A_LONG_RANDOM_SECRET
supabase secrets set ADMIN_USERNAME=khater
supabase secrets set ADMIN_EMAILS=akhater@acuative.com
```

## Frontend admin page
Open `admin_upload.html` and use:
- Admin Username: `khater`
- Admin Email: `akhater@acuative.com`
- Admin Token: same value as `ADMIN_TOKEN`

## Important note
This patch secures the write endpoint by requiring:
1. matching admin token
2. matching owner username
3. matching owner email

If later you want a full login system with password reset and real user sessions, the next step would be Supabase Auth with an allowlist table for admins.
