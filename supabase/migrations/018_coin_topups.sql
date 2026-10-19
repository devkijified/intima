-- 018: Coin topup ledger (Paystack purchases).
-- Idempotency: one row per Paystack reference, so a double callback
-- can never credit coins twice.

CREATE TABLE IF NOT EXISTS public.coin_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  coins integer NOT NULL CHECK (coins > 0),
  amount_ngn integer NOT NULL CHECK (amount_ngn > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coin_topups_user_idx
  ON public.coin_topups (user_id, created_at DESC);

ALTER TABLE public.coin_topups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_topups_own" ON public.coin_topups;
CREATE POLICY "coin_topups_own" ON public.coin_topups
  FOR SELECT USING (user_id = auth.uid());
-- Writes go through the server verify route (service role).
