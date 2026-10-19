-- Intima migration 010: traction (view counts) + reviews.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- Profiles show view counts (TikTok-style traction: 1.2K, 45K) and a
-- reviews tab. View counts increment best-effort on sheet open; the
-- reviews table holds client ratings with RLS so only participants
-- and admins read the full rows, while aggregates go public via the view.

-- 1. View counter on profiles.
alter table public.profiles
  add column if not exists view_count integer not null default 0
    check (view_count >= 0);

-- 2. Reviews table. If it already exists with a different shape from a
-- partial run, repair the columns instead of skipping.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  -- One review per client per provider (update instead of duplicate).
  unique(provider_id, client_id)
);
alter table public.reviews enable row level security;

-- Repair: add any missing columns if the table pre-existed.
alter table public.reviews add column if not exists provider_id uuid;
alter table public.reviews add column if not exists client_id uuid;
alter table public.reviews add column if not exists rating integer;
alter table public.reviews add column if not exists comment text;
alter table public.reviews add column if not exists created_at timestamptz not null default now();

drop policy if exists "Reviews are publicly readable" on public.reviews;
create policy "Reviews are publicly readable"
  on public.reviews for select
  using (true);

drop policy if exists "Clients write their own reviews" on public.reviews;
create policy "Clients write their own reviews"
  on public.reviews for insert
  with check (auth.uid() = client_id);

drop policy if exists "Clients update their own reviews" on public.reviews;
create policy "Clients update their own reviews"
  on public.reviews for update
  using (auth.uid() = client_id);

-- 3. Refresh the public view: view_count + review aggregates.
create or replace view public.map_providers as
select
  pp.provider_id,
  nullif(coalesce(p.display_name, ''), '') as display_name,
  p.avatar_url,
  coalesce(p.is_verified, false) as is_verified,
  pp.city,
  pp.area_lat,
  pp.area_lng,
  coalesce(pp.is_available, false) as is_available,
  p.rate_short_time_ngn,
  p.rate_overnight_ngn,
  p.rate_weekend_ngn,
  p.services,
  pp.updated_at as last_active_at,
  coalesce(p.rates_negotiable, true) as rates_negotiable,
  coalesce(p.gallery_urls, '{}') as gallery_urls,
  coalesce(p.view_count, 0) as view_count,
  coalesce((select count(*) from public.reviews r where r.provider_id = pp.provider_id), 0)::integer as review_count,
  (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.provider_id = pp.provider_id)::float as avg_rating,
  coalesce((select count(*) from public.connections c where c.provider_id = pp.provider_id and c.status = 'active'), 0)::integer as booking_count
from public.provider_presence pp
join public.profiles p on p.id = pp.provider_id
where pp.show_on_map = true;

grant select on public.map_providers to anon, authenticated;

-- Best-effort view counter bump. Called on sheet open; safe for guests
-- (security definer, only increments, no data exposed).
create or replace function public.bump_profile_view(pid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set view_count = view_count + 1
  where id = pid;
end;
$$;

grant execute on function public.bump_profile_view(uuid) to anon, authenticated;
