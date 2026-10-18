-- 003_platform.sql
-- Phase 2: platform settings, admin control, verification queue, reports,
-- connections (client-paid connection fee), and a minimal profiles table.
--
-- HOW TO APPLY: run this whole file in the Supabase SQL editor
-- (Dashboard > SQL Editor > New query > paste > Run).
--
-- MANUAL STEPS AFTER RUNNING (see build notes):
--   1. Insert your own user id into admin_users to become the first admin:
--        insert into public.admin_users (user_id) values ('<your-auth-user-id>');
--   2. Create the private storage bucket "verification-docs" in
--      Dashboard > Storage (see commented block at the end of this file).

-- ============================================================
-- Helper: admin check. Security definer so it bypasses RLS and
-- avoids recursive policy lookups.
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ============================================================
-- admin_users: who may use the admin panel and write settings.
-- No INSERT policy on purpose: the first row is added by hand
-- in the SQL editor (service role bypasses RLS).
-- ============================================================
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
drop policy if exists admin_users_select on public.admin_users;
create policy admin_users_select on public.admin_users
  for select using (public.is_admin());

-- ============================================================
-- profiles: minimal table. The app already reads this table
-- (role, display_name, full_name, avatar_url, phone, is_verified),
-- so the columns below match what the UI queries.
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client'
    check (role in ('client', 'model', 'admin', 'super_admin')),
  display_name text,
  full_name text,
  avatar_url text,
  phone text,
  is_verified boolean not null default false,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_admin());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- ============================================================
-- platform_settings: every important tunable lives here, never
-- hardcoded in the app. value is jsonb so numbers, booleans,
-- strings and null are all representable.
-- ============================================================
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select on public.platform_settings
  for select using (auth.role() = 'authenticated');
drop policy if exists platform_settings_admin_write on public.platform_settings;
create policy platform_settings_admin_write on public.platform_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists platform_settings_touch on public.platform_settings;
create trigger platform_settings_touch
  before update on public.platform_settings
  for each row execute function public.touch_updated_at();

insert into public.platform_settings (key, value, description) values
  ('connection_fee_ngn', '5000',
   'Fee in naira charged to the client for each connection request. Editable anytime.'),
  ('featured_slot_fee_ngn', 'null',
   'Reserved for future paid featured placement. Not in use, do not build against it yet.'),
  ('verification_sla_hours', '72',
   'Target turnaround for verification reviews, in hours. Shown to providers on the verification screen.'),
  ('max_photos_per_profile', '10',
   'Maximum gallery photos allowed per provider profile.'),
  ('maintenance_mode', 'false',
   'When true, the app shows a maintenance notice instead of normal content.')
on conflict (key) do nothing;

-- ============================================================
-- verifications: provider identity review queue.
-- ============================================================
create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  id_document_url text,
  selfie_url text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text
);
alter table public.verifications enable row level security;
drop policy if exists verifications_insert_own on public.verifications;
create policy verifications_insert_own on public.verifications
  for insert with check (auth.uid() = provider_id);
drop policy if exists verifications_select on public.verifications;
create policy verifications_select on public.verifications
  for select using (auth.uid() = provider_id or public.is_admin());
drop policy if exists verifications_admin_update on public.verifications;
create policy verifications_admin_update on public.verifications
  for update using (public.is_admin());

-- ============================================================
-- admin_audit_logs: every admin action is recorded. Admins only.
-- ============================================================
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
drop policy if exists audit_admin_all on public.admin_audit_logs;
create policy audit_admin_all on public.admin_audit_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- reports: users report providers; admins triage.
-- ============================================================
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_provider_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert with check (auth.uid() = reporter_id);
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select using (auth.uid() = reporter_id or public.is_admin());
drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update using (public.is_admin());

-- ============================================================
-- connections: a client pays the connection fee to unlock contact
-- with a provider. The provider keeps 100 percent of her own rates;
-- this table only records the platform fee transaction.
-- ============================================================
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  fee_ngn integer not null check (fee_ngn >= 0),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'active', 'refunded', 'expired')),
  payment_ref text,
  created_at timestamptz not null default now()
);
alter table public.connections enable row level security;
drop policy if exists connections_select on public.connections;
create policy connections_select on public.connections
  for select using (
    auth.uid() = client_id or auth.uid() = provider_id or public.is_admin()
  );
drop policy if exists connections_insert on public.connections;
create policy connections_insert on public.connections
  for insert with check (auth.uid() = client_id);
drop policy if exists connections_update on public.connections;
create policy connections_update on public.connections
  for update using (auth.uid() = client_id or public.is_admin());

-- One active connection per client/provider pair.
drop index if exists connections_one_active_per_pair;
create unique index connections_one_active_per_pair
  on public.connections (client_id, provider_id)
  where status = 'active';

-- ============================================================
-- STORAGE (manual dashboard step; bucket creation needs the
-- dashboard or service role, so this stays commented).
--
-- Dashboard > Storage > New bucket:
--   name: verification-docs, Public: OFF
--
-- Then run:
--
--   insert into storage.buckets (id, name, public)
--   values ('verification-docs', 'verification-docs', false)
--   on conflict (id) do nothing;
--
--   create policy "Providers upload own verification docs"
--     on storage.objects for insert
--     with check (bucket_id = 'verification-docs'
--       and auth.uid()::text = (storage.foldername(name))[1]);
--
--   create policy "Providers read own verification docs"
--     on storage.objects for select
--     using (bucket_id = 'verification-docs'
--       and (auth.uid()::text = (storage.foldername(name))[1]
--         or public.is_admin()));
-- ============================================================
