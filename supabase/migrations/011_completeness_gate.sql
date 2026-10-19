-- Intima migration 011: profile completeness gate.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- Incomplete provider profiles stay hidden from discovery until complete.
-- A provider appears on the map/list only when she has:
--   1. A display name
--   2. A profile photo (avatar)
--   3. A city
--   4. At least one rate (short time, overnight, or weekend)
--
-- This keeps the "Rates not listed yet" profiles out of guest browsing.
-- Providers complete their profile in onboarding/settings; the moment
-- the last missing piece lands, they appear automatically.

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
where pp.show_on_map = true
  -- Completeness gate: all four must hold to be discoverable.
  and nullif(coalesce(p.display_name, ''), '') is not null
  and p.avatar_url is not null
  and pp.city is not null
  and (
    p.rate_short_time_ngn is not null
    or p.rate_overnight_ngn is not null
    or p.rate_weekend_ngn is not null
  );

grant select on public.map_providers to anon, authenticated;
