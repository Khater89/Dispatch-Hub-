-- ═══════════════════════════════════════════════════════════════════
-- Dispatch Hub — Admin & Tool Status Schema
-- ═══════════════════════════════════════════════════════════════════
-- Run this once in the Supabase SQL Editor.
-- This creates:
--   1. admin_users   — who can manage tools
--   2. tool_status   — which tools are enabled/disabled
--   3. is_admin()    — helper used by RLS and Edge Functions
--   4. RLS policies
--   5. Seed rows for the 6 known tools

-- ─── 1. admin_users ─────────────────────────────────────────────────
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  added_at   timestamptz not null default now(),
  added_by   uuid references auth.users(id) on delete set null
);

create index if not exists admin_users_email_idx on public.admin_users (lower(email));

-- ─── 2. tool_status ─────────────────────────────────────────────────
create table if not exists public.tool_status (
  tool_key         text primary key,
  tool_name        text not null,
  enabled          boolean not null default true,
  disabled_message text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);

-- ─── 3. is_admin() helper ───────────────────────────────────────────
-- SECURITY DEFINER lets RLS policies call this without recursing into
-- admin_users' own policies.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = uid);
$$;

grant execute on function public.is_admin(uuid) to authenticated, anon;

-- ─── 4. RLS policies ────────────────────────────────────────────────
alter table public.tool_status enable row level security;
alter table public.admin_users enable row level security;

-- tool_status: any authenticated user can READ
drop policy if exists "tool_status_read" on public.tool_status;
create policy "tool_status_read"
  on public.tool_status for select
  to authenticated
  using (true);

-- tool_status: only admins can INSERT/UPDATE/DELETE
drop policy if exists "tool_status_insert" on public.tool_status;
create policy "tool_status_insert"
  on public.tool_status for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "tool_status_update" on public.tool_status;
create policy "tool_status_update"
  on public.tool_status for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "tool_status_delete" on public.tool_status;
create policy "tool_status_delete"
  on public.tool_status for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- admin_users: only admins can read the list
drop policy if exists "admin_users_read" on public.admin_users;
create policy "admin_users_read"
  on public.admin_users for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- admin_users: only admins can add/remove other admins
drop policy if exists "admin_users_write" on public.admin_users;
create policy "admin_users_write"
  on public.admin_users for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ─── 5. Seed the 6 known tools ──────────────────────────────────────
-- These tool_keys must match the data-tool-key attributes on the Hub
-- landing page cards and the data-tool-key on each tool's <script src="tool-gate.js">.
insert into public.tool_status (tool_key, tool_name, enabled) values
  ('oncall',         'On-Call Lookup',            true),
  ('flex_tier2',     'Flex Tech Finder (Tier 2)', true),
  ('canada_w2',      'Canada Dispatch W2',        true),
  ('intl_suppliers', 'International Suppliers',   true),
  ('contractors',    'Contractors',               true),
  ('audit',          'Audit & Validation',        true)
on conflict (tool_key) do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- BOOTSTRAP: add the first admin
-- ═══════════════════════════════════════════════════════════════════
-- After running everything above, run this ONE more statement to seed
-- yourself as the first admin. Replace the email below.
-- This works because the policy checks public.is_admin(auth.uid()), and
-- when you run SQL from the Dashboard you are NOT auth.uid() — you are
-- the postgres superuser, which bypasses RLS.
--
-- insert into public.admin_users (user_id, email)
-- select id, email from auth.users where lower(email) = lower('akhater@acuative.com')
-- on conflict (user_id) do nothing;
