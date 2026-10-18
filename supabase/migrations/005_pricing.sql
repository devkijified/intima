-- Intima migration 005: provider rate cards.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- Why: clients were paying the ₦5,000 connection fee blind, then learning
-- the provider's own rates were out of reach. Rates are now listed on the map
-- pin sheet and the profile BEFORE the fee CTA, and the map has a budget
-- filter so clients only browse who they can afford.

alter table public.profiles
  add column if not exists rate_short_time_ngn integer,
  add column if not exists rate_overnight_ngn integer,
  add column if not exists rate_weekend_ngn integer;

-- Recreate the public map view with the rate columns. Stranger-safe: rates
-- are exactly what the founder wants shown before any fee is paid.
-- (CREATE OR REPLACE keeps the existing grants; the grant below is
-- re-issued anyway so a fresh database ends up identical.)
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
  p.rate_weekend_ngn
from public.provider_presence pp
join public.profiles p on p.id = pp.provider_id
where pp.show_on_map = true;

grant select on public.map_providers to anon, authenticated;
