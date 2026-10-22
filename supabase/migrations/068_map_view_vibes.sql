-- 068: The map view learns vibes, so a companion's vibe tags can
-- ride along to her map card. Same view as migration 044 with one
-- column appended (CREATE OR REPLACE VIEW only allows new columns
-- at the end).

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
  coalesce((select count(*) from public.reviews r where r.provider_id = pp.provider_id and r.status = 'published' and r.reviewer_id = r.client_id), 0)::integer as review_count,
  (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.provider_id = pp.provider_id and r.status = 'published' and r.reviewer_id = r.client_id)::float as avg_rating,
  coalesce((select count(*) from public.connections c where c.provider_id = pp.provider_id and c.status = 'active'), 0)::integer as booking_count,
  coalesce(p.video_urls, '{}') as video_urls,
  p.username,
  p.trust_tier,
  coalesce(p.travel_mode, 'none') as travel_mode,
  coalesce(p.travel_cities, '{}') as travel_cities,
  (select case
     when count(*) = 0 then null
     else (count(*) filter (where exists (
       select 1 from public.messages m
       where m.connection_id = c.id and m.sender_id = pp.provider_id
     )))::float / count(*)::float
   end
   from public.connections c
   where c.provider_id = pp.provider_id
     and c.status in ('active', 'refunded', 'expired'))::float as response_rate,
  (select avg(
     extract(epoch from (
       (select min(m.created_at) from public.messages m
        where m.connection_id = c.id and m.sender_id = pp.provider_id)
       - c.created_at
     )) / 60.0
   )
   from public.connections c
   where c.provider_id = pp.provider_id
     and c.status in ('active', 'refunded', 'expired')
     and exists (
       select 1 from public.messages m2
       where m2.connection_id = c.id and m2.sender_id = pp.provider_id
     ))::float as avg_first_response_minutes,
  (select case
     when count(*) = 0 then null
     else (count(*) filter (where c.status = 'refunded'))::float / count(*)::float
   end
   from public.connections c
   where c.provider_id = pp.provider_id
     and c.status in ('active', 'refunded', 'expired'))::float as cancellation_rate,
  (select case
     when count(distinct c.client_id) = 0 then null
     else count(distinct case when exists (
       select 1 from public.connections c2
       where c2.provider_id = pp.provider_id
         and c2.client_id = c.client_id
         and c2.id <> c.id
         and c2.status in ('active', 'refunded', 'expired')
     ) then c.client_id end)::float / count(distinct c.client_id)::float
   end
   from public.connections c
   where c.provider_id = pp.provider_id
     and c.status in ('active', 'refunded', 'expired'))::float as repeat_client_rate,
  coalesce((select count(*) from public.connections c where c.provider_id = pp.provider_id and c.status in ('active', 'refunded', 'expired')), 0)::integer as eligible_connection_count,
  coalesce((select count(*) from public.connections c where c.provider_id = pp.provider_id and c.status in ('active', 'refunded', 'expired') and exists (select 1 from public.messages m where m.connection_id = c.id and m.sender_id = pp.provider_id)), 0)::integer as responded_connection_count,
  coalesce((select count(distinct c.client_id) from public.connections c where c.provider_id = pp.provider_id and c.status in ('active', 'refunded', 'expired')), 0)::integer as distinct_client_count,
  coalesce(p.vibes, '{}') as vibes
from public.provider_presence pp
join public.profiles p on p.id = pp.provider_id
where pp.show_on_map = true
  and nullif(coalesce(p.display_name, ''), '') is not null
  and p.avatar_url is not null
  and pp.city is not null
  and (
    p.rate_short_time_ngn is not null
    or p.rate_overnight_ngn is not null
    or p.rate_weekend_ngn is not null
  )
  and coalesce(cardinality(p.services), 0) > 0
  and not coalesce(p.is_hidden, false);

grant select on public.map_providers to anon, authenticated;
