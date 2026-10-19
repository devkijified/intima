-- Intima migration 007: expose provider recency on the public map view.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- provider_presence.updated_at moves whenever a provider updates her
-- presence or availability, so it doubles as a stranger-safe "last active"
-- signal for the recency chips (Tryst-style "Active today"). No exact
-- times are shown, only coarse buckets computed client-side.

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
  pp.updated_at as last_active_at
from public.provider_presence pp
join public.profiles p on p.id = pp.provider_id
where pp.show_on_map = true;

grant select on public.map_providers to anon, authenticated;
