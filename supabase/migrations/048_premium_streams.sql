-- 048: Premium (fans only) streams.
--
-- Streams get an explicit access mode:
--   public: free for everyone (the default, unchanged behaviour).
--   paid:   a ticket price in price_ngn; fan club subscribers of the
--           host enter free (handled in POST /api/live/token).
--   fans:   PREMIUM. Only the host's active fan club subscribers may
--           enter. Non-subscribers can see the stream listed with a
--           Fans Only badge, but the token route refuses them.
--
-- Premium is earned, not given: a companion may only create or
-- schedule a fans stream when she clears the eligibility bar in
-- lib/live/premium.ts (ID verified, completed bookings, rating,
-- response rate, cancellation rate, fan club open, good standing).
-- The numeric thresholds live in platform_settings so they can be
-- tuned from the admin panel without a code change.

-- 1. Access mode on live_sessions.
alter table public.live_sessions
  add column if not exists access_mode text not null default 'public';

-- Backfill: anything carrying a ticket price was a paid stream.
update public.live_sessions
  set access_mode = 'paid'
  where price_ngn > 0 and access_mode = 'public';

alter table public.live_sessions
  drop constraint if exists live_sessions_access_mode_check;
alter table public.live_sessions
  add constraint live_sessions_access_mode_check
  check (access_mode in ('public', 'paid', 'fans'));

-- 2. Eligibility thresholds (JSON numbers, admin-tunable).
insert into public.platform_settings (key, value, description) values
  ('premium_min_bookings', '5',
   'Premium (fans only) streams: minimum completed bookings a companion needs to unlock the feature.'),
  ('premium_min_rating', '4.5',
   'Premium (fans only) streams: minimum average rating across published reviews.'),
  ('premium_min_reviews', '3',
   'Premium (fans only) streams: minimum number of published reviews the rating is measured over.'),
  ('premium_min_response_pct', '80',
   'Premium (fans only) streams: minimum response rate, percent of requests she replies to.'),
  ('premium_max_cancel_pct', '20',
   'Premium (fans only) streams: maximum cancellation rate, percent of bookings refunded.')
on conflict (key) do nothing;
