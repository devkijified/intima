-- 063: Realtime publication for client-subscribed tables.
-- The live room subscribes to gift_transactions inserts (the gift FX
-- feed and the Top Gifters witness lines), chat subscribes to
-- messages, and other surfaces subscribe to notifications and
-- live_sessions. postgres_changes only emits for tables inside the
-- supabase_realtime publication; gift_transactions was never added,
-- so gift animations never fired even though sends charged and
-- credited correctly. Idempotent: safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gift_transactions') then
    alter publication supabase_realtime add table public.gift_transactions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_sessions') then
    alter publication supabase_realtime add table public.live_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_chat_deletions') then
    alter publication supabase_realtime add table public.live_chat_deletions;
  end if;
end $$;
