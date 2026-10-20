-- 037: dispute evidence and the dispute timeline.
--
-- Builds on the fee dispute window from 034. The dispute is only ever
-- about the platform connection fee; no companion funds are held,
-- routed, or moved by this (or any) migration. Resolution money
-- movement stays manual through the original payment rail.
--
-- 1. A private storage bucket, dispute-evidence, for images either
--    party adds to an open dispute. Paths are <user_id>/<file>; users
--    insert and read only their own folder, admins can read all.
-- 2. A timeline table, public.dispute_events: opened, evidence, note,
--    resolved, auto_released. Append only (no update, no delete).
-- 3. connections.dispute_outcome learns 'auto_released', used by the
--    7 day auto-release cron. fee_state needs no change: auto-release
--    sets fee_state 'released', which the 034 check already allows.

-- ============================================================
-- 1. Dispute evidence bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('dispute-evidence', 'dispute-evidence', false)
on conflict (id) do nothing;

drop policy if exists "devidence_insert_own" on storage.objects;
create policy "devidence_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dispute-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "devidence_select_own_or_admin" on storage.objects;
create policy "devidence_select_own_or_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'dispute-evidence'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============================================================
-- 2. Dispute timeline
-- ============================================================
create table if not exists public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('opened', 'evidence', 'note', 'resolved', 'auto_released')),
  note text,
  evidence_path text,
  created_at timestamptz not null default now()
);

create index if not exists dispute_events_connection_created_idx
  on public.dispute_events (connection_id, created_at);

alter table public.dispute_events enable row level security;

-- Participants of the connection (and admins) can read its timeline.
-- The service role bypasses RLS, which covers server and cron inserts
-- (including auto_released rows, whose actor is null).
drop policy if exists dispute_events_select on public.dispute_events;
create policy dispute_events_select on public.dispute_events
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.connections c
      where c.id = dispute_events.connection_id
        and (c.client_id = auth.uid() or c.provider_id = auth.uid())
    )
  );

-- A participant can append events only as themselves.
drop policy if exists dispute_events_insert on public.dispute_events;
create policy dispute_events_insert on public.dispute_events
  for insert with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.connections c
      where c.id = dispute_events.connection_id
        and (c.client_id = auth.uid() or c.provider_id = auth.uid())
    )
  );

-- No update or delete policies: the timeline is append only.

-- ============================================================
-- 3. Widen the dispute outcome check
-- ============================================================
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'connections_dispute_outcome_check') then
    alter table public.connections drop constraint connections_dispute_outcome_check;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'connections_dispute_outcome_check') then
    alter table public.connections add constraint connections_dispute_outcome_check
      check (dispute_outcome is null or dispute_outcome in ('refunded', 'released', 'auto_released'));
  end if;
end $$;

-- ============================================================
-- 4. Backfill an opened event for disputes already open
-- ============================================================
insert into public.dispute_events (connection_id, actor_id, kind, note, created_at)
select c.id, c.dispute_by, 'opened', c.dispute_reason, c.dispute_opened_at
from public.connections c
where c.fee_state = 'disputed'
  and c.dispute_opened_at is not null
  and not exists (
    select 1 from public.dispute_events de
    where de.connection_id = c.id and de.kind = 'opened'
  );
