-- Intima migration 004: public-safe map provider projection.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.
--
-- The public landing page is the map, and it must work fully logged out.
-- provider_presence is already RLS-public for show_on_map = true rows, but
-- public.profiles is restricted to owners and admins. This view is the
-- controlled public doorway: it exposes ONLY the columns a stranger may see
-- (display name, avatar, verified flag, city and approximate coordinates).
-- Plain views run with the owner's privileges, so granting SELECT on the
-- view to anon is deliberate and safe. No exact addresses, no contact
-- details, no verification documents.

create or replace view public.map_providers as
select
  pp.provider_id,
  nullif(coalesce(p.display_name, ''), '') as display_name,
  p.avatar_url,
  coalesce(p.is_verified, false) as is_verified,
  pp.city,
  pp.area_lat,
  pp.area_lng,
  coalesce(pp.is_available, false) as is_available
from public.provider_presence pp
join public.profiles p on p.id = pp.provider_id
where pp.show_on_map = true;

grant select on public.map_providers to anon, authenticated;
