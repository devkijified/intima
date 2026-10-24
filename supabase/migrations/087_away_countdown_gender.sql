-- 087: host-away countdown + profile gender for pronouns.
--
-- live_sessions.away_since: the server-side stamp of when the
-- host was first noticed gone. Viewer clients start it, the
-- room counts down the grace from it, and /api/live/away ends
-- the session when the grace runs out. One clock (the
-- server's) so every viewer sees the same countdown.
--
-- profiles.gender: how the app refers to the person ('She',
-- 'He'); null means the copy uses their name instead. Set in
-- Profile. Before this, the host-away copy hardcoded 'She'
-- for every host, including the owner.
alter table public.live_sessions
  add column if not exists away_since timestamptz;

alter table public.profiles
  add column if not exists gender text;
