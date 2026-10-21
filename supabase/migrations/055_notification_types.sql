-- Intima migration 055: complete the notifications type check.
--
-- Migration 044 left the check at nine types, but the codebase has
-- outgrown it: new_connection (connections route), incoming_call
-- (push notify allowlist for call signalling) and the notification
-- matrix types (subscription lifecycle, cashout decisions,
-- verification decisions, contest wins, referral rewards, and the
-- connection lifecycle names) are all written by app code and would
-- be rejected by the old constraint. Widen the check to the full
-- set, keeping every type 044 allowed so nothing is lost.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%live_started%'
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
      'contest_won', 'referral_reward'
    ));
end $$;
