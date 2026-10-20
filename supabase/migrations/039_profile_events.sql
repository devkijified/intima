-- 039: profile view events for provider analytics.
--
-- One row per provider, per viewer, per Lagos day for a profile
-- view. The unique index on (provider_id, viewer_key, day) is what
-- makes repeat visits on the same day count once: the tracker
-- inserts fire and forget and ignores the unique violation.
--
-- viewer_key is the signed in user id when there is one, otherwise
-- a stable per browser id the client stores in localStorage under
-- 'intima_viewer_key'. Viewers may be anonymous, so inserts are
-- open, but only for kind 'view'. Reads are private: only the
-- provider herself or an admin can read her events.

create table if not exists public.profile_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'view',
  viewer_key text not null,
  created_at timestamptz not null default now(),
  day date generated always as ((created_at at time zone 'Africa/Lagos')::date) stored
);

create unique index if not exists profile_events_provider_viewer_day_uidx
  on public.profile_events (provider_id, viewer_key, day);

create index if not exists profile_events_provider_created_idx
  on public.profile_events (provider_id, created_at desc);

alter table public.profile_events enable row level security;

drop policy if exists profile_events_insert_view on public.profile_events;
create policy profile_events_insert_view on public.profile_events
  for insert with check (kind = 'view');

drop policy if exists profile_events_select_own on public.profile_events;
create policy profile_events_select_own on public.profile_events
  for select using (auth.uid() = provider_id or public.is_admin());
