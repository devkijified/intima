-- Intima migration 006: provider service offerings.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- Why: what a provider offers is a top decision factor (video calls, dinner
-- dates, threesomes and the rest are not offered by everyone). Services are
-- stored as catalog ids (see lib/services.ts SERVICE_CATALOG) so the map can
-- filter on them and sheets can render them as chips. Stranger-safe: a
-- provider's own advertised offerings, exactly what the founder wants shown
-- before any fee is paid.

alter table public.profiles
  add column if not exists services text[];

-- Recreate the public map view with the services column, keeping every
-- existing stranger-safe column. (CREATE OR REPLACE keeps the existing
-- grants; the grant below is re-issued anyway so a fresh database ends up
-- identical.)
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
  p.services
from public.provider_presence pp
join public.profiles p on p.id = pp.provider_id
where pp.show_on_map = true;

grant select on public.map_providers to anon, authenticated;
