-- 032: crypto payments via NOWPayments (no-KYC crypto gateway).
-- One row per crypto checkout; the IPN webhook flips status and the
-- crediting happens exactly once (status guard in the webhook route).

CREATE TABLE IF NOT EXISTS public.crypto_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('coins', 'connection_fee')),
  reference text NOT NULL UNIQUE,
  provider_payment_id text,
  invoice_url text,
  amount_ngn integer NOT NULL,
  coins integer,
  target_provider_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'finished', 'failed', 'expired', 'partial')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crypto_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crypto_payments_select_own ON public.crypto_payments;
CREATE POLICY crypto_payments_select_own ON public.crypto_payments
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- NGN/USD rate used to price crypto invoices in USD (admin-settable).
INSERT INTO public.platform_settings (key, value)
VALUES ('usd_ngn_rate', '1550')
ON CONFLICT (key) DO NOTHING;
