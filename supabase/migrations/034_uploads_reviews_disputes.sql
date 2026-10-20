-- 034: photo uploads, double-blind reviews, fee dispute window.
--
-- 1. A public storage bucket for profile photos, so companions and
--    clients upload pictures from their phones instead of pasting
--    links. Files live under <user-id>/ and only the owner writes.
-- 2. Reviews become two-way and double-blind: a review is tied to a
--    connection, has a reviewer and a reviewee, and stays pending
--    (invisible to everyone but the writer) until both sides have
--    reviewed or 72 hours pass. Aggregates count published only.
-- 3. Connections gain a 24 hour dispute window on the fee: while
--    fee_state is 'held' either side can open a dispute; admins
--    resolve to 'released' or 'refunded'.

-- ============================================================
-- 1. Profile photos bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

drop policy if exists "Profile photos are public" on storage.objects;
create policy "Profile photos are public" on storage.objects
  for select using (bucket_id = 'profile-photos');

drop policy if exists "Users upload own profile photos" on storage.objects;
create policy "Users upload own profile photos" on storage.objects
  for insert with check (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own profile photos" on storage.objects;
create policy "Users update own profile photos" on storage.objects
  for update using (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own profile photos" on storage.objects;
create policy "Users delete own profile photos" on storage.objects
  for delete using (
    bucket_id = 'profile-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 2. Reviews: two-way, double-blind
-- ============================================================
alter table public.reviews add column if not exists connection_id uuid references public.connections(id) on delete set null;
alter table public.reviews add column if not exists reviewer_id uuid references auth.users(id) on delete cascade;
alter table public.reviews add column if not exists reviewee_id uuid references auth.users(id) on delete cascade;
alter table public.reviews add column if not exists status text not null default 'published';
alter table public.reviews add column if not exists published_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_status_check') then
    alter table public.reviews add constraint reviews_status_check
      check (status in ('pending', 'published'));
  end if;
end $$;

update public.reviews set reviewer_id = client_id where reviewer_id is null;
update public.reviews set reviewee_id = provider_id where reviewee_id is null;
update public.reviews set published_at = created_at where published_at is null;

-- The old one-review-per-pair rule blocks the second direction and
-- repeat connections; per-connection uniqueness replaces it.
do $$ declare c record; begin
  for c in select conname from pg_constraint
           where conrelid = 'public.reviews'::regclass and contype = 'u' loop
    execute format('alter table public.reviews drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists reviews_one_per_connection_reviewer
  on public.reviews (connection_id, reviewer_id)
  where connection_id is not null;

drop policy if exists "Reviews are publicly readable" on public.reviews;
drop policy if exists "Clients write their own reviews" on public.reviews;
drop policy if exists "Clients update their own reviews" on public.reviews;
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select using (
    status = 'published'
    or auth.uid() = reviewer_id
    or auth.uid() = reviewee_id
    or public.is_admin()
  );
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert with check (auth.uid() = reviewer_id);
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews
  for update using (auth.uid() = reviewer_id and status = 'pending');

create or replace function public.publish_due_reviews() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.reviews r
    set status = 'published', published_at = now()
    where r.status = 'pending'
      and r.connection_id is not null
      and (
        exists (
          select 1 from public.reviews r2
          where r2.connection_id = r.connection_id
            and r2.reviewer_id <> r.reviewer_id
        )
        or r.created_at < now() - interval '72 hours'
      );
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.publish_due_reviews() to authenticated;

-- ============================================================
-- 3. Connections: fee dispute window
-- ============================================================
alter table public.connections add column if not exists paid_at timestamptz;
alter table public.connections add column if not exists dispute_deadline timestamptz;
alter table public.connections add column if not exists fee_state text not null default 'held';
alter table public.connections add column if not exists dispute_reason text;
alter table public.connections add column if not exists dispute_by uuid references auth.users(id) on delete set null;
alter table public.connections add column if not exists dispute_opened_at timestamptz;
alter table public.connections add column if not exists dispute_resolved_at timestamptz;
alter table public.connections add column if not exists dispute_outcome text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'connections_fee_state_check') then
    alter table public.connections add constraint connections_fee_state_check
      check (fee_state in ('held', 'released', 'disputed', 'refunded'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'connections_dispute_outcome_check') then
    alter table public.connections add constraint connections_dispute_outcome_check
      check (dispute_outcome is null or dispute_outcome in ('refunded', 'released'));
  end if;
end $$;

-- Backfill: existing connections are long past any window.
update public.connections set paid_at = created_at where paid_at is null;
update public.connections set dispute_deadline = created_at + interval '24 hours' where dispute_deadline is null;
update public.connections set fee_state = 'released' where status <> 'active';
update public.connections set fee_state = 'released'
  where status = 'active' and created_at < now() - interval '24 hours';

create or replace function public.stamp_connection_dispute() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' then
    if new.paid_at is null then new.paid_at := now(); end if;
    if new.dispute_deadline is null then
      new.dispute_deadline := new.paid_at + interval '24 hours';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists connections_stamp_dispute on public.connections;
create trigger connections_stamp_dispute
  before insert on public.connections
  for each row execute function public.stamp_connection_dispute();

-- ============================================================
-- 4. Aggregates count published client reviews only
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
