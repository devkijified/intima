-- 085: Message read receipts actually work.
--
-- Migration 026 added messages.read_at and the thread has marked
-- messages read on open ever since, but the messages table only
-- ever had SELECT and INSERT policies (015). With RLS on and no
-- UPDATE policy, every mark-read update was silently denied, so
-- read_at stayed null forever and the unread badges (thread list
-- and the messages float) never cleared.
--
-- The fix: a party may UPDATE only messages sent TO them inside
-- their own connection (sender is the other party), and the
-- column-level grant limits what can be written to read_at alone.

drop policy if exists "messages_mark_read" on public.messages;
create policy "messages_mark_read" on public.messages
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

grant update (read_at) on public.messages to authenticated;
