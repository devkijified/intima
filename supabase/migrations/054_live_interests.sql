-- 054: "Notify me" interest for scheduled live streams.
-- A signed-in member taps Notify me on an Upcoming card; the row is
-- created here. When the host goes live, POST /api/live/go-live fans
-- a live_started notification out to everyone in this table for the
-- session (deduped against connections and followers). Counts are
-- readable by any signed-in user so cards can show "N interested";
-- a user can only add or remove their own rows.

create table if not exists public.live_interests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists live_interests_session_idx on public.live_interests (session_id);
create index if not exists live_interests_user_idx on public.live_interests (user_id);

alter table public.live_interests enable row level security;

drop policy if exists "live_interests_read" on public.live_interests;
create policy "live_interests_read" on public.live_interests
  for select to authenticated
  using (true);

drop policy if exists "live_interests_insert_own" on public.live_interests;
create policy "live_interests_insert_own" on public.live_interests
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "live_interests_delete_own" on public.live_interests;
create policy "live_interests_delete_own" on public.live_interests
  for delete to authenticated
  using (user_id = auth.uid());
