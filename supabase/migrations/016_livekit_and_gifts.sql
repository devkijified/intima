-- 016: LiveKit rooms + gift economy.
--
-- LiveKit: each live session gets a room name. Tokens are minted
-- server-side via /api/live/token (never expose the API secret).
-- Gifts: naira-coin catalog, balances, transactions. Platform takes
-- a cut defined in platform_settings (gift_platform_cut_pct).

-- 1. LiveKit room on live sessions.
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS livekit_room text;

-- 2. Coin balances (1 coin = ₦10, NegoEmpire-proven local model).
CREATE TABLE IF NOT EXISTS public.coin_balances (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coin_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_balances_own" ON public.coin_balances;
CREATE POLICY "coin_balances_own" ON public.coin_balances
  FOR SELECT USING (user_id = auth.uid());

-- 3. Gift catalog (admin-managed).
CREATE TABLE IF NOT EXISTS public.gift_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL,
  coin_cost integer NOT NULL CHECK (coin_cost > 0),
  tier text NOT NULL DEFAULT 'basic'
    CHECK (tier IN ('basic', 'premium', 'luxury', 'mega')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.gift_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gift_catalog_public" ON public.gift_catalog;
CREATE POLICY "gift_catalog_public" ON public.gift_catalog
  FOR SELECT USING (is_active = true);

-- Seed the catalog (TikTok-style tiers, naira-native pricing).
INSERT INTO public.gift_catalog (id, name, emoji, coin_cost, tier, sort_order)
VALUES
  ('rose', 'Rose', '🌹', 10, 'basic', 1),
  ('heart', 'Heart', '❤️', 25, 'basic', 2),
  ('coffee', 'Coffee', '☕', 50, 'basic', 3),
  ('perfume', 'Perfume', '🌸', 100, 'premium', 4),
  ('crown', 'Crown', '👑', 500, 'premium', 5),
  ('diamond', 'Diamond', '💎', 1000, 'luxury', 6),
  ('lion', 'Lion', '🦁', 5000, 'luxury', 7),
  ('universe', 'Universe', '🌌', 10000, 'mega', 8)
ON CONFLICT (id) DO NOTHING;

-- 4. Gift transactions (immutable ledger).
CREATE TABLE IF NOT EXISTS public.gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  host_id uuid NOT NULL REFERENCES public.profiles(id),
  gift_id text NOT NULL REFERENCES public.gift_catalog(id),
  coin_cost integer NOT NULL CHECK (coin_cost > 0),
  host_earnings_coins integer NOT NULL CHECK (host_earnings_coins >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_tx_session_idx
  ON public.gift_transactions (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_tx_host_idx
  ON public.gift_transactions (host_id, created_at DESC);
ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gift_tx_read_room" ON public.gift_transactions;
CREATE POLICY "gift_tx_read_room" ON public.gift_transactions
  FOR SELECT USING (true);
-- Writes go through the server API (service role) so balances stay consistent.

-- 5. Platform cut for gifts (default 50%, TikTok-style).
INSERT INTO public.platform_settings (key, value, description)
VALUES ('gift_platform_cut_pct', '50', 'Platform cut % on live stream gifts; host keeps the rest.')
ON CONFLICT (key) DO NOTHING;
