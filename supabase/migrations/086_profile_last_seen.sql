-- 086: last-active presence for chat.
--
-- Every signed-in user's profile carries the last time the app
-- saw them (a throttled heartbeat from the dashboard shell
-- stamps it). The chat thread header reads the other person's
-- stamp and shows "Active now" or "Last active ..." under
-- their name, the way WhatsApp does. Column only; profiles
-- already has its grants and RLS (a user updates only their
-- own row, which is all the heartbeat ever writes).
alter table public.profiles
  add column if not exists last_seen_at timestamptz;
