-- Intima migration 008: rates negotiability.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- Providers choose whether their rates are negotiable (inDrive-style) or
-- fixed. Clients see the badge on the sheet; the request flow offers a
-- propose-your-rate input only when negotiable.

alter table public.profiles
  add column if not exists rates_negotiable boolean not null default true;

-- The client's proposed rate when the provider is open to offers
-- (inDrive-style). Null = client accepts her listed rates.
alter table public.connections
  add column if not exists proposed_rate_ngn integer check (proposed_rate_ngn is null or proposed_rate_ngn >= 0);

-- Refresh the public view with the new column (keeps all prior columns).
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
  coalesce(p.rates_negotiable, true) as rates_negotiable
from public.provider_presence pp
join public.profiles p on p.id = pp.provider_id
where pp.show_on_map = true;

grant select on public.map_providers to anon, authenticated;
