-- 041: Fan club subscriptions.
--
-- Providers set a monthly price in coins on their profile
-- (profiles.sub_price_coins; null or 0 means the fan club is off).
-- Fans subscribe in coins: the subscriber is charged through
-- spend_coins (kind 'subscription_charge') and the provider is
-- credited her share through credit_coins (kind
-- 'subscription_earning'), split by the platform_settings key
-- 'subscription_platform_cut_pct'. Both ledger kinds already exist
-- in the coin_ledger check constraint (migration 036).
-- Renewals run from /api/cron/subscriptions every period (30 days).

-- 1. Platform cut for subscriptions (default 50%).
INSERT INTO public.platform_settings (key, value, description)
VALUES ('subscription_platform_cut_pct', '50', 'Platform cut % on fan club subscriptions; the provider keeps the rest.')
ON CONFLICT (key) DO NOTHING;

-- 2. Provider fan club price (coins per month; null or 0 = off).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sub_price_coins integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_sub_price_coins_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_sub_price_coins_check
      CHECK (sub_price_coins IS NULL OR sub_price_coins >= 0);
  END IF;
END $$;

-- 3. Subscriptions.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_coins integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lapsed', 'cancelled')),
  current_period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one live subscription per fan and provider pair. Cancelled
-- rows whose period has ended and lapsed rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_active_pair_uidx
  ON public.subscriptions (subscriber_id, provider_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS subscriptions_provider_status_idx
  ON public.subscriptions (provider_id, status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Either party (and admins) can read a subscription. Writes happen
-- only through the server API (service role), so there are no
-- insert or update policies on purpose.
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT USING (
    subscriber_id = auth.uid()
    OR provider_id = auth.uid()
    OR public.is_admin()
  );

-- 4. Subscribers-only stories (fan club perk).
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS is_subscribers_only boolean NOT NULL DEFAULT false;
