-- UFH Free-plan team auth setup
-- Run this in Supabase SQL Editor before deploying the updated app.

create extension if not exists pgcrypto;

create table if not exists public.ufh_allowed_users (
  email text primary key,
  username text,
  role text not null default 'user',
  is_active boolean not null default true,
  can_sign_up boolean not null default true,
  note text,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ufh_device_locks (
  email text primary key references public.ufh_allowed_users(email) on delete cascade,
  user_id uuid,
  device_key text not null,
  device_name text,
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.ufh_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ufh_allowed_users_updated_at on public.ufh_allowed_users;
create trigger trg_ufh_allowed_users_updated_at
before update on public.ufh_allowed_users
for each row
execute procedure public.ufh_touch_updated_at();

drop trigger if exists trg_ufh_device_locks_updated_at on public.ufh_device_locks;
create trigger trg_ufh_device_locks_updated_at
before update on public.ufh_device_locks
for each row
execute procedure public.ufh_touch_updated_at();

alter table public.ufh_allowed_users enable row level security;
alter table public.ufh_device_locks enable row level security;

-- No public policies: the web app reaches these tables only through the service-role Edge Function.
drop policy if exists "ufh_allowed_users_no_direct_access" on public.ufh_allowed_users;
drop policy if exists "ufh_device_locks_no_direct_access" on public.ufh_device_locks;

insert into public.ufh_allowed_users (email, username, role, is_active, can_sign_up, note, approved_by)
values ('akhater@acuative.com', 'khater', 'owner', true, true, 'UFH owner', 'bootstrap')
on conflict (email) do update
set username = excluded.username,
    role = excluded.role,
    is_active = excluded.is_active,
    can_sign_up = excluded.can_sign_up,
    note = excluded.note,
    approved_by = excluded.approved_by,
    updated_at = now();

-- Signup gate: only pre-approved @acuative.com emails can create accounts.
create or replace function public.ufh_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_email text := lower(trim(coalesce(event->'user'->>'email', '')));
  v_ok boolean := false;
begin
  if v_email = '' then
    return jsonb_build_object('error', jsonb_build_object('message', 'Email is required.', 'http_code', 400));
  end if;

  if split_part(v_email, '@', 2) <> 'acuative.com' then
    return jsonb_build_object('error', jsonb_build_object('message', 'Only @acuative.com emails are allowed.', 'http_code', 403));
  end if;

  select exists(
    select 1
    from public.ufh_allowed_users u
    where lower(u.email) = v_email
      and u.is_active = true
      and u.can_sign_up = true
  ) into v_ok;

  if not v_ok then
    return jsonb_build_object('error', jsonb_build_object('message', 'Your email is not approved for signup yet.', 'http_code', 403));
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.ufh_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
revoke execute on function public.ufh_before_user_created(jsonb) from authenticated, anon, public;
