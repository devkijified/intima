-- 022: usernames for shareable profile URLs (/companion/adaeze).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Backfill for existing models: slug from display_name + id fragment for uniqueness.
UPDATE profiles
SET username = lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '', 'g')) || substr(replace(id::text, '-', ''), 1, 4)
WHERE role = 'model' AND username IS NULL AND display_name IS NOT NULL;

-- Enforce uniqueness going forward (allows NULL for clients who never set one).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON profiles (username) WHERE username IS NOT NULL;

-- Expose username on the public map view.
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
  coalesce(p.video_urls, '{}') as video_urls,
  p.username
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
  and coalesce(cardinality(p.services), 0) > 0;

grant select on public.map_providers to anon, authenticated;
