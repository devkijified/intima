-- 027: billion-dollar social layer. Gifter levels, PPV, disappearing
-- messages, stream moderation, broadcast channels, touring, trust tiers,
-- boost placements.

-- Gifter levels: lifetime gift spend per user, drives badges + leaderboard.
CREATE TABLE IF NOT EXISTS public.gifter_stats (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lifetime_coins integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gifter_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gifter_stats_public" ON public.gifter_stats;
CREATE POLICY "gifter_stats_public" ON public.gifter_stats FOR SELECT USING (true);

-- PPV messages: locked media in chat, unlocked with coins.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ppv_price_coins integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS unlocked_by uuid[] NOT NULL DEFAULT '{}';

-- Disappearing messages.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS view_once boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS messages_expires_idx ON public.messages (expires_at) WHERE expires_at IS NOT NULL;

-- Stream moderation: muted/blocked viewers per session + host mod list.
CREATE TABLE IF NOT EXISTS public.stream_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('mute', 'block')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
ALTER TABLE public.stream_moderation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stream_mod_host" ON public.stream_moderation;
CREATE POLICY "stream_mod_host" ON public.stream_moderation FOR ALL USING (
  session_id IN (SELECT id FROM public.live_sessions WHERE provider_id = auth.uid())
);

-- Broadcast channels: companion -> followers one-to-many.
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.broadcast_follows (
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, follower_id)
);
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "broadcasts_public" ON public.broadcasts;
CREATE POLICY "broadcasts_public" ON public.broadcasts FOR SELECT USING (true);
DROP POLICY IF EXISTS "broadcast_follow_own" ON public.broadcast_follows;
CREATE POLICY "broadcast_follow_own" ON public.broadcast_follows FOR ALL USING (follower_id = auth.uid());

-- Touring calendar: companions announce city visits.
CREATE TABLE IF NOT EXISTS public.tour_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  city text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
ALTER TABLE public.tour_dates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tour_dates_public" ON public.tour_dates;
CREATE POLICY "tour_dates_public" ON public.tour_dates FOR SELECT USING (true);

-- Trust tiers: earned badges beyond basic verification.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_tier text NOT NULL DEFAULT 'verified'
  CHECK (trust_tier IN ('verified', 'video_verified', 'elite'));

-- Boost: paid map placement.
CREATE TABLE IF NOT EXISTS public.boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coins_spent integer NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.boosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boosts_public" ON public.boosts;
CREATE POLICY "boosts_public" ON public.boosts FOR SELECT USING (true);

-- Keep gifter levels fresh: bump lifetime spend + recompute level on each gift.
CREATE OR REPLACE FUNCTION public.bump_gifter_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total integer; v_level integer;
BEGIN
  INSERT INTO public.gifter_stats (user_id, lifetime_coins)
  VALUES (NEW.sender_id, NEW.coin_cost)
  ON CONFLICT (user_id) DO UPDATE SET
    lifetime_coins = public.gifter_stats.lifetime_coins + EXCLUDED.lifetime_coins,
    updated_at = now()
  RETURNING lifetime_coins INTO v_total;
  -- Level curve: roughly sqrt-scaled, L50 at ~2.5M coins lifetime.
  v_level := LEAST(50, 1 + floor(sqrt(v_total / 1000.0)));
  UPDATE public.gifter_stats SET level = v_level WHERE user_id = NEW.sender_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_bump_gifter_stats ON public.gift_transactions;
CREATE TRIGGER trg_bump_gifter_stats
  AFTER INSERT ON public.gift_transactions
  FOR EACH ROW EXECUTE FUNCTION public.bump_gifter_stats();
