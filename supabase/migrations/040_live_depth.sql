-- 040: Live depth. Scheduled streams, pinned chat, slow mode, blocked
-- words, appointed stream moderators, a server-side chat log (the gate
-- record for slow mode), chat deletions, PK battles, and co-hosts.
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the
-- SQL editor, paste this entire file, and run it. Safe to run more
-- than once.
--
-- Chat architecture note: live chat is LiveKit data packets sent client
-- to client. There is no server send path. Enforcement therefore lives
-- in a gate route, POST /api/live/chat/check, which the client must
-- call before publishing a packet. This migration provides the tables
-- that gate and the moderation routes rely on.

-- 1. live_sessions: scheduling + chat settings, and a wider status check.
alter table public.live_sessions
  add column if not exists scheduled_for timestamptz;
alter table public.live_sessions
  add column if not exists pinned_text text;
alter table public.live_sessions
  add column if not exists slow_mode_seconds integer not null default 0;
alter table public.live_sessions
  add column if not exists blocked_words text[] not null default '{}';

-- Widen the status check to include 'scheduled'. The check from 013 was
-- written inline, so its name is the Postgres default in most databases,
-- but look it up by definition instead of trusting the name.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.live_sessions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%suspended%'
    and pg_get_constraintdef(oid) not like '%scheduled%'
  limit 1;
  if cname is not null then
    execute format('alter table public.live_sessions drop constraint %I', cname);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.live_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%scheduled%'
  ) then
    alter table public.live_sessions
      add constraint live_sessions_status_check
      check (status in ('live', 'ended', 'suspended', 'scheduled'));
  end if;
end $$;

create index if not exists live_sessions_scheduled_idx
  on public.live_sessions (scheduled_for)
  where status = 'scheduled';

-- 2. Appointed stream moderators. The host appoints viewers who can
-- mute and delete messages through POST /api/live/moderate.
create table if not exists public.stream_moderators (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  moderator_id uuid not null references public.profiles(id) on delete cascade,
  appointed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, moderator_id)
);
alter table public.stream_moderators enable row level security;

drop policy if exists "stream_moderators_read" on public.stream_moderators;
create policy "stream_moderators_read"
  on public.stream_moderators for select
  using (true);

drop policy if exists "stream_moderators_host_write" on public.stream_moderators;
create policy "stream_moderators_host_write"
  on public.stream_moderators for insert
  with check (
    session_id in (select id from public.live_sessions where provider_id = auth.uid())
  );

drop policy if exists "stream_moderators_host_delete" on public.stream_moderators;
create policy "stream_moderators_host_delete"
  on public.stream_moderators for delete
  using (
    session_id in (select id from public.live_sessions where provider_id = auth.uid())
  );

-- 3. Chat log. Written only by the gate route with the service role.
-- It exists for slow mode checks and deletion bookkeeping; it is not a
-- public chat history, so it has no policies at all.
create table if not exists public.live_chat_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists live_chat_log_sender_idx
  on public.live_chat_log (session_id, sender_id, created_at desc);
alter table public.live_chat_log enable row level security;

-- 4. Chat deletions. A moderator deleting a data-packet message cannot
-- reach into other clients, so deletion is recorded here and clients
-- subscribed via Realtime hide the matching message id.
create table if not exists public.live_chat_deletions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  message_id text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, message_id)
);
create index if not exists live_chat_deletions_session_idx
  on public.live_chat_deletions (session_id, created_at desc);
alter table public.live_chat_deletions enable row level security;

drop policy if exists "live_chat_deletions_read" on public.live_chat_deletions;
create policy "live_chat_deletions_read"
  on public.live_chat_deletions for select
  using (true);
-- Writes go through POST /api/live/moderate with the service role.

-- 5. PK battles: two live sessions compete on gift coins in a window.
create table if not exists public.pk_battles (
  id uuid primary key default gen_random_uuid(),
  session_a uuid not null references public.live_sessions(id) on delete cascade,
  session_b uuid not null references public.live_sessions(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  winner_session_id uuid references public.live_sessions(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'finished')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (session_a <> session_b),
  check (ends_at > starts_at)
);
create index if not exists pk_battles_status_idx
  on public.pk_battles (status, ends_at);
create index if not exists pk_battles_sessions_idx
  on public.pk_battles (session_a, session_b, created_at desc);
alter table public.pk_battles enable row level security;

drop policy if exists "pk_battles_read" on public.pk_battles;
create policy "pk_battles_read"
  on public.pk_battles for select
  using (true);
-- Writes go through POST and GET /api/live/pk with the service role.

-- 6. Co-hosts: the host invites a viewer who, once accepted, may
-- publish into the same LiveKit room (see /api/live/token).
create table if not exists public.live_cohosts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  cohost_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (session_id, cohost_id)
);
alter table public.live_cohosts enable row level security;

drop policy if exists "live_cohosts_read" on public.live_cohosts;
create policy "live_cohosts_read"
  on public.live_cohosts for select
  using (
    cohost_id = auth.uid()
    or session_id in (select id from public.live_sessions where provider_id = auth.uid())
  );

drop policy if exists "live_cohosts_host_insert" on public.live_cohosts;
create policy "live_cohosts_host_insert"
  on public.live_cohosts for insert
  with check (
    session_id in (select id from public.live_sessions where provider_id = auth.uid())
  );

drop policy if exists "live_cohosts_respond" on public.live_cohosts;
create policy "live_cohosts_respond"
  on public.live_cohosts for update
  using (cohost_id = auth.uid())
  with check (cohost_id = auth.uid());

-- 7. Realtime: clients subscribe to chat deletions to hide messages.
do $$
begin
  begin
    alter publication supabase_realtime add table public.live_chat_deletions;
  exception when duplicate_object then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.stream_moderators;
  exception when duplicate_object then
    null;
  end;
end $$;
