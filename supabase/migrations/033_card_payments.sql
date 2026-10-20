-- 033: card payments via Paystack (plug-the-keys rail).
-- One row per card checkout for the connection fee; the verify route
-- and the webhook both settle from this table, idempotently.
-- Coin top-ups keep using coin_topups as their ledger (existing flow).

CREATE TABLE IF NOT EXISTS public.card_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('connection_fee')),
  reference text NOT NULL UNIQUE,
  amount_ngn integer NOT NULL,
  target_provider_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.card_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_payments_select_own ON public.card_payments;
CREATE POLICY card_payments_select_own ON public.card_payments
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
