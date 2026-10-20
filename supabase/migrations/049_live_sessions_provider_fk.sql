-- 049: live_sessions.provider_id had no foreign key to profiles (only
-- a legacy FK from model_id to the legacy model_profiles table), so
-- every PostgREST query embedding provider:profiles failed with
-- PGRST200 and the /live page silently rendered empty.
-- Applied to production 2026-10-20 via the SQL editor (0 orphans);
-- this file records what ran.

delete from public.live_sessions ls
where not exists (select 1 from public.profiles p where p.id = ls.provider_id);

alter table public.live_sessions
  drop constraint if exists live_sessions_provider_id_fkey;

alter table public.live_sessions
  add constraint live_sessions_provider_id_fkey
  foreign key (provider_id) references public.profiles(id) on delete cascade;

notify pgrst, 'reload schema';
