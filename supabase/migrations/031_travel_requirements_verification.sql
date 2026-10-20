-- 031: travel availability, Bybit-style client requirements, and the
-- verification submission flow (both sides).
--
-- Travel model (Tryst pattern + standing setting):
--   travel_mode 'none'      = based in home city only
--   travel_mode 'selected'  = also travels to travel_cities[]
--   travel_mode 'nationwide'= travels anywhere (fly-me-to-you)
-- Scheduled tours stay in tour_dates (027); the map matches a filtered
-- city against home city OR travel_cities OR nationwide OR an active
-- tour in that city.
--
-- Client requirements (Bybit "Requirements for the Counterparty"):
-- a companion may require verified clients, a minimum number of
-- completed connections, and a minimum client account age.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS travel_mode text NOT NULL DEFAULT 'none'
    CHECK (travel_mode IN ('none', 'selected', 'nationwide')),
  ADD COLUMN IF NOT EXISTS travel_cities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS req_verified_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS req_min_connections integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS req_min_account_days integer NOT NULL DEFAULT 0;

-- Verification submissions: handwritten-sign selfie (Tryst photo check)
-- plus the ID type used. Existing columns id_document_url / selfie_url
-- hold the ID photo and the selfie holding the ID.
ALTER TABLE public.verifications
  ADD COLUMN IF NOT EXISTS sign_selfie_url text,
  ADD COLUMN IF NOT EXISTS id_type text;

-- Private storage for verification documents. Paths are <user_id>/<file>;
-- users manage only their own folder, admins can read all.
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-docs', 'verification-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vdocs_insert_own" ON storage.objects;
CREATE POLICY "vdocs_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "vdocs_select_own_or_admin" ON storage.objects;
CREATE POLICY "vdocs_select_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

DROP POLICY IF EXISTS "vdocs_update_own" ON storage.objects;
CREATE POLICY "vdocs_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "vdocs_delete_own" ON storage.objects;
CREATE POLICY "vdocs_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text);

-- Recreate the public map view from the 022 definition, appending the
-- columns the client already selects (trust_tier) plus the travel
-- fields. Column order for existing columns is unchanged; new columns
-- go at the END (CREATE OR REPLACE VIEW requirement).
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
  p.username,
  p.trust_tier,
  coalesce(p.travel_mode, 'none') as travel_mode,
  coalesce(p.travel_cities, '{}') as travel_cities
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
