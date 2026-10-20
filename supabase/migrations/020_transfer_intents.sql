-- 020: Bank transfer intents for no-KYC coin purchases.
-- User creates an intent, transfers to the platform's bank account with the
-- reference in the narration, and the email poller matches the UBA credit
-- alert to credit coins automatically.

CREATE TABLE IF NOT EXISTS public.transfer_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  amount_ngn integer NOT NULL CHECK (amount_ngn > 0),
  coins integer NOT NULL CHECK (coins > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'credited', 'expired', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '45 minutes',
  credited_at timestamptz
);

CREATE INDEX IF NOT EXISTS transfer_intents_ref_idx
  ON public.transfer_intents (reference);
CREATE INDEX IF NOT EXISTS transfer_intents_user_idx
  ON public.transfer_intents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transfer_intents_pending_idx
  ON public.transfer_intents (status, expires_at)
  WHERE status = 'pending';

ALTER TABLE public.transfer_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transfer_own" ON public.transfer_intents;
CREATE POLICY "transfer_own" ON public.transfer_intents
  FOR SELECT USING (user_id = auth.uid());
-- Inserts/updates go through server routes (service role).

-- Platform bank details, set in Admin → Settings. Never hardcoded.
-- NOTE: platform_settings.value is a json column, so string values must
-- be JSON string literals ('""' is an empty string). Plain '' is invalid
-- JSON and fails the whole script (found when this migration was first
-- run for real on 2026-10-20; the transfer_intents table above rolled
-- back with it, so this file is the corrected, complete version).
INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('bank_name', '""', 'Platform bank name for transfer top-ups (e.g. UBA)'),
  ('bank_account_number', '""', 'Platform account number for transfer top-ups'),
  ('bank_account_name', '""', 'Platform account name for transfer top-ups')
ON CONFLICT (key) DO NOTHING;
