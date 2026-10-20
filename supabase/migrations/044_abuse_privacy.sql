-- 044: abuse threshold hiding plus media view privacy.
--
-- 1. profiles.is_hidden: set automatically when a provider crosses
--    the open-report threshold (see POST /api/reports). Hidden
--    providers drop off the public map view below; their profile
--    page shows a neutral unavailable state to everyone but the
--    owner, who sees a review banner instead.
-- 2. map_providers: the migration 038 definition copied exactly,
--    with one added WHERE filter so hidden providers never appear.
-- 3. media_views: one row per (message, viewer) the first time a
--    party views shared media in a thread. Drives the sender Seen
--    label and the view-once single-open rule in the thread UI.

-- ============================================================
-- 1. Hidden flag on profiles
-- ============================================================
alter table public.profiles
  add column if not exists is_hidden boolean not null default false;

-- ============================================================
-- 2. Public map view: 038 definition plus the hidden filter
-- ============================================================
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
  coalesce((select count(distinct c.client_id) from public.connections c where c.provider_id = pp.provider_id and c.status in ('active', 'refunded', 'expired')), 0)::integer as distinct_client_count
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

-- ============================================================
-- 3. Media views: who opened shared media, and when
-- ============================================================
create table if not exists public.media_views (
  message_id uuid not null references public.messages(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (message_id, viewer_id)
);

-- The notifications type check from migration 013 predates the
-- dispute flows: app code already notifies with dispute_opened and
-- dispute_resolved, and this release adds provider_hidden. Widen the
-- check to the full set the codebase uses so those inserts are not
-- rejected at runtime.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%live_started%'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'live_started', 'booking_request', 'booking_accepted',
      'booking_message', 'new_review', 'system',
      'dispute_opened', 'dispute_resolved', 'provider_hidden'
    ));
end $$;

alter table public.media_views enable row level security;

-- Record a view: only as yourself, and only for a message in a
-- connection you are a party of.
drop policy if exists media_views_insert_party on public.media_views;
create policy media_views_insert_party on public.media_views
  for insert with check (
    viewer_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      join public.connections c on c.id = m.connection_id
      where m.id = media_views.message_id
        and (c.client_id = auth.uid() or c.provider_id = auth.uid())
    )
  );

-- Read a view: the viewer themselves, the sender of the media
-- (so she can see the Seen state), or an admin.
drop policy if exists media_views_select on public.media_views;
create policy media_views_select on public.media_views
  for select using (
    viewer_id = auth.uid()
    or exists (
      select 1 from public.messages m
      where m.id = media_views.message_id
        and m.sender_id = auth.uid()
    )
    or public.is_admin()
  );
