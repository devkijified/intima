-- Intima migration 013: live sessions + notifications.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- Live sessions: TikTok-style. The companion decides free or paid.
--   price_ngn = 0 means free to join; > 0 means pay-to-join.
-- Platform admins can feature, suspend, or end any stream.
--
-- Notifications: bell + center. Triggered by go-live, bookings, reviews.

-- 1. Live sessions.
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Live',
  is_public boolean not null default true,
  price_ngn integer not null default 0 check (price_ngn >= 0),
  status text not null default 'live'
    check (status in ('live', 'ended', 'suspended')),
  viewer_count integer not null default 0 check (viewer_count >= 0),
  featured boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.live_sessions enable row level security;

-- Repair: if live_sessions pre-existed with the old shape (model_id),
-- add the new columns instead of failing.
alter table public.live_sessions add column if not exists provider_id uuid;
alter table public.live_sessions add column if not exists title text not null default 'Live';
alter table public.live_sessions add column if not exists is_public boolean not null default true;
alter table public.live_sessions add column if not exists price_ngn integer not null default 0;
alter table public.live_sessions add column if not exists status text not null default 'live';
alter table public.live_sessions add column if not exists viewer_count integer not null default 0;
alter table public.live_sessions add column if not exists featured boolean not null default false;
alter table public.live_sessions add column if not exists started_at timestamptz not null default now();
alter table public.live_sessions add column if not exists ended_at timestamptz;
alter table public.live_sessions add column if not exists created_at timestamptz not null default now();

drop policy if exists "Live sessions are publicly readable" on public.live_sessions;
create policy "Live sessions are publicly readable"
  on public.live_sessions for select
  using (true);

drop policy if exists "Providers manage their own streams" on public.live_sessions;
create policy "Providers manage their own streams"
  on public.live_sessions for all
  using (auth.uid() = provider_id)
  with check (auth.uid() = provider_id);

-- 2. Notifications.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null
    check (type in ('live_started', 'booking_request', 'booking_accepted', 'booking_message', 'new_review', 'system')),
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;

drop policy if exists "Users read their own notifications" on public.notifications;
create policy "Users read their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users update their own notifications" on public.notifications;
create policy "Users update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

-- Service role (backend triggers) can insert notifications for anyone.
drop policy if exists "Service role inserts notifications" on public.notifications;
create policy "Service role inserts notifications"
  on public.notifications for insert
  with check (true);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id, created_at desc);
create index if not exists live_sessions_status_idx
  on public.live_sessions (status) where status = 'live';
