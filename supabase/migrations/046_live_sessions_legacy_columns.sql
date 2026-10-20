-- 046: live_sessions legacy fixes, found by the 2026-10-20 QA walk.
--
-- 1. stream_url and stream_key are NOT NULL leftovers from the old
--    RTMP era. LiveKit sessions never set them, so every insert that
--    does not invent values fails, including POST /api/live/schedule
--    (the walk's "Could not schedule stream"). Drop the NOT NULLs;
--    existing rows keep their values.
-- 2. The production status check is ('scheduled','live','ended',
--    'cancelled'), but the admin live page sets status 'suspended',
--    which that check rejects. Widen the check to the union of every
--    status the code uses: scheduled, live, ended, suspended,
--    cancelled.

alter table public.live_sessions alter column stream_url drop not null;
alter table public.live_sessions alter column stream_key drop not null;

alter table public.live_sessions drop constraint if exists live_sessions_status_check;
alter table public.live_sessions
  add constraint live_sessions_status_check
  check (status in ('scheduled', 'live', 'ended', 'suspended', 'cancelled'));
