-- Intima migration 012: profile video clips.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- Providers can attach short video clips to their profile gallery.
-- Videos play inline in the gallery carousel (tap to play/pause).

alter table public.profiles
  add column if not exists video_urls text[] not null default '{}';

-- Refresh the public view with the new column (keeps 007-011 columns).
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
  coalesce((select count(*) from public.connections c where c.provider_id = pp.provider_id and c.status = 'active'), 0)::integer as booking_count,
  coalesce(p.video_urls, '{}') as video_urls
from public.provider_presence pp
join public.profiles p on p.id = pp.provider_id
where pp.show_on_map = true
  -- Completeness gate (011): name, photo, city, a rate, a service.
  and nullif(coalesce(p.display_name, ''), '') is not null
  and p.avatar_url is not null
  and pp.city is not null
  and (
    p.rate_short_time_ngn is not null
    or p.rate_overnight_ngn is not null
    or p.rate_weekend_ngn is not null
  )
  and coalesce(array_length(p.services, 1), 0) > 0;

grant select on public.map_providers to anon, authenticated;
