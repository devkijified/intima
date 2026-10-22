-- 069: A public follower count. broadcast_follows rows are only
-- visible to their owner (and the companion), so a plain count
-- from the browser would always read 0 or 1. This security-definer
-- function returns just the number, nothing about who follows.

create or replace function public.follower_count(pid uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.broadcast_follows
  where provider_id = pid
$$;

grant execute on function public.follower_count(uuid) to anon, authenticated;
