-- Intima migration 078: held connection fees (the pay-first flow).
--
-- Until now a connection fee payment had two fates: a connection
-- was created from it, or the money sat stranded (paid, no
-- connection, no refund path) whenever the companion turned out
-- to be unavailable or the booking could not be completed after
-- the money moved. Pay-first makes the settled-but-unused fee a
-- first-class state instead: the fee is HELD against the chosen
-- companion, can be applied once to a different available
-- companion, and refunds at the platform refund_pct (85) when it
-- is never used.
--
-- The lifecycle lives on the payment row itself, so one row keeps
-- stating what the fee is for at every stage:
--   target_provider_id    the companion the client chose and paid for
--   fee_disposition       open -> applied | refund_pending |
--                         refunded | refund_failed
--   applied_provider_id   the companion the fee actually opened a
--                         connection with (differs from the target
--                         exactly when the client switched)
--   fee_held_at           when the unused fee was stamped as held
--   fee_expires_at        when an unused held fee stops being
--                         applicable and the refund path takes over
--                         (48 hours, matching the board window)
--
-- Board payments (board_request_id set) are excluded throughout:
-- the board has its own fee lifecycle on board_requests.

alter table public.card_payments
  add column if not exists fee_disposition text not null default 'open'
    check (fee_disposition in ('open', 'applied', 'refund_pending', 'refunded', 'refund_failed')),
  add column if not exists applied_provider_id uuid,
  add column if not exists fee_held_at timestamptz,
  add column if not exists fee_expires_at timestamptz;

alter table public.crypto_payments
  add column if not exists fee_disposition text not null default 'open'
    check (fee_disposition in ('open', 'applied', 'refund_pending', 'refunded', 'refund_failed')),
  add column if not exists applied_provider_id uuid,
  add column if not exists fee_held_at timestamptz,
  add column if not exists fee_expires_at timestamptz;

-- Backfill: fees a connection already consumed are applied, and
-- the connection's companion is who they were applied to.
update public.card_payments p
set fee_disposition = 'applied', applied_provider_id = c.provider_id
from public.connections c
where c.payment_ref = p.reference and p.fee_disposition = 'open';

update public.crypto_payments p
set fee_disposition = 'applied', applied_provider_id = c.provider_id
from public.connections c
where c.payment_ref = p.reference and p.fee_disposition = 'open';

-- The cron sweep scans open, board-free holds by expiry.
create index if not exists card_payments_held_idx
  on public.card_payments (fee_disposition, fee_expires_at)
  where board_request_id is null;
create index if not exists crypto_payments_held_idx
  on public.crypto_payments (fee_disposition, fee_expires_at)
  where board_request_id is null;

-- Notification types for the held-fee lifecycle.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.notifications'::regclass and contype = 'c'
      and conname = 'notifications_type_check'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'live_started', 'booking_request', 'booking_accepted',
      'booking_message', 'new_review', 'system',
      'dispute_opened', 'dispute_resolved', 'provider_hidden',
      'incoming_call',
      'new_connection', 'connection_accepted', 'connection_deFlintd',
      'connection_expired',
      'subscription_started', 'subscription_renewed',
      'subscription_lapsed', 'subscription_paused',
      'cashout_requested', 'cashout_approved', 'cashout_rejected',
      'cashout_paid',
      'verification_approved', 'verification_rejected',
      'contest_won', 'referral_reward',
      'board_request_new', 'board_response', 'board_filled',
      'board_expired',
      'contest_new', 'ticket_update',
      'comic_episode',
      'fee_held', 'fee_refunded'
    ));
end $$;
