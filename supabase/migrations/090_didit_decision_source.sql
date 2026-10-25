-- 090: allow Didit as a verification decision source.
--
-- Migration 084 constrained verifications.decision_source to the
-- Dojah-era values ('admin', 'dojah', 'dojah_webhook'). The Didit
-- adapter writes 'didit' when a hosted session starts and
-- 'didit_webhook' when a verdict lands, so the old check rejected
-- those updates: the session was created at Didit but never anchored
-- to its verifications row (provider / provider_reference stayed
-- null). Widen the check to include both Didit values. No new
-- tables, so no grants change.

ALTER TABLE public.verifications
  DROP CONSTRAINT IF EXISTS verifications_decision_source_check;

ALTER TABLE public.verifications
  ADD CONSTRAINT verifications_decision_source_check
  CHECK (decision_source IS NULL OR decision_source IN (
    'admin', 'dojah', 'dojah_webhook', 'didit', 'didit_webhook'
  ));
