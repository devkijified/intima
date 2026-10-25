-- 089: WhatsApp mechanics for chat (owner order 2026-10-25, "build
-- all of it in one pass"): per-message ticks need a delivered
-- stamp; reply quotes need a target plus a snapshot; edits and
-- delete-for-everyone need their stamps; voice notes carry a
-- duration; reactions get their own table.
--
-- Policy notes: migration 085 already lets a party update read_at
-- on messages sent to them (messages_mark_read). The two UPDATE
-- policies below sit beside it (permissive policies OR together):
-- the recipient stamps delivered_at; the sender manages their own
-- row inside a 48 hour outer window (the 15 minute edit window is
-- enforced in the client; delete uses the full window, matching
-- WhatsApp's roughly two days). Column grants stay narrow.

alter table public.messages
  add column if not exists delivered_at timestamptz,
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists reply_snapshot jsonb,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists media_duration_seconds integer;

grant update (delivered_at) on public.messages to authenticated;
grant update (body, edited_at, deleted_at) on public.messages to authenticated;

drop policy if exists messages_mark_delivered on public.messages;
create policy messages_mark_delivered on public.messages
  for update to authenticated
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.connections c
      where c.id = messages.connection_id
        and (c.client_id = auth.uid() or c.provider_id = auth.uid())
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.connections c
      where c.id = messages.connection_id
        and (c.client_id = auth.uid() or c.provider_id = auth.uid())
    )
  );

drop policy if exists messages_sender_manage on public.messages;
create policy messages_sender_manage on public.messages
  for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid() and created_at > now() - interval '48 hours');

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_reactions_connection_idx
  on public.message_reactions (connection_id);

alter table public.message_reactions enable row level security;

grant select, insert, update, delete on public.message_reactions to authenticated;
grant select, insert, update, delete on public.message_reactions to service_role;

drop policy if exists reactions_party_read on public.message_reactions;
create policy reactions_party_read on public.message_reactions
  for select to authenticated
  using (exists (
    select 1 from public.connections c
    where c.id = message_reactions.connection_id
      and (c.client_id = auth.uid() or c.provider_id = auth.uid())
  ));

drop policy if exists reactions_own_insert on public.message_reactions;
create policy reactions_own_insert on public.message_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.connections c
    where c.id = message_reactions.connection_id
      and (c.client_id = auth.uid() or c.provider_id = auth.uid())
  ));

drop policy if exists reactions_own_update on public.message_reactions;
create policy reactions_own_update on public.message_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists reactions_own_delete on public.message_reactions;
create policy reactions_own_delete on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.message_reactions;
