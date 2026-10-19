-- 019: Companion cash-out requests.
-- Companions convert gift-earned coins to naira via manual bank transfer.
-- Coins are deducted at request time; refunded if rejected.

CREATE TABLE IF NOT EXISTS public.cashout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coins integer NOT NULL CHECK (coins > 0),
  amount_ngn integer NOT NULL CHECK (amount_ngn > 0),
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS cashout_requests_status_idx
  ON public.cashout_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS cashout_requests_user_idx
  ON public.cashout_requests (user_id, created_at DESC);

ALTER TABLE public.cashout_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cashout_own" ON public.cashout_requests;
CREATE POLICY "cashout_own" ON public.cashout_requests
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "cashout_admin_all" ON public.cashout_requests;
CREATE POLICY "cashout_admin_all" ON public.cashout_requests
  FOR ALL USING (public.is_admin());
-- Inserts go through the server request route (service role) so coins
-- are deducted atomically with the request.

-- Minimum cash-out, adjustable in Admin → Settings.
INSERT INTO public.platform_settings (key, value, description)
VALUES ('cashout_min_coins', '500', 'Minimum coins per cash-out request (500 coins = ₦5,000)')
ON CONFLICT (key) DO NOTHING;
