# UFH Free-plan team login setup

This package now supports:
- email/password login for each user
- only pre-approved `@acuative.com` users can sign up
- email verification on first signup
- one locked browser/device per user on the Free plan
- owner-only admin page to approve users and reset device locks

## 1) Run the SQL file
Run this file in Supabase SQL Editor:

- `supabase/sql/ufh_free_team_auth_setup.sql`

It creates:
- `public.ufh_allowed_users`
- `public.ufh_device_locks`
- `public.ufh_before_user_created(event jsonb)`

## 2) Configure the Auth hook
In Supabase:
- Authentication -> Auth Hooks
- Before User Created
- Choose **Postgres function**
- Select `public.ufh_before_user_created`

This blocks signup unless the email is already in `ufh_allowed_users` and belongs to `@acuative.com`.

## 3) Turn on email confirmation
In Supabase:
- Authentication -> Email
- Confirm sign up -> ON

That makes first-time signup send a verification email before sign-in works.

## 4) Add secrets for the Edge Function
Set these Supabase secrets:

```bash
supabase secrets set ADMIN_USERNAME=khater
supabase secrets set ADMIN_EMAILS=akhater@acuative.com
supabase secrets set COMPANY_DOMAIN=acuative.com
supabase secrets set ALLOWED_USERS_TABLE=ufh_allowed_users
supabase secrets set DEVICE_LOCKS_TABLE=ufh_device_locks
```

## 5) Deploy the `api` function again
Deploy whichever `api/index.ts` copy you use for your project.

## 6) Approve staff from the admin page
Open:
- `admin_upload.html`

Use the **Approve or update a user** section to add:
- work email
- username
- role
- active / blocked
- can self-sign up

## How device lock works on the Free plan
On the first successful login, the app binds that email to one browser/device key in `ufh_device_locks`.
If the same user tries another browser/device, the app blocks access until the owner clicks **Reset device**.

This is strong at the app level, but it is not a hardware-grade device fingerprint. If a browser is wiped or storage is cleared, the owner may need to reset the device lock.
