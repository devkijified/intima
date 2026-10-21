-- 060: Adult gift store.
--
-- Replaces the generic launch catalog (016) with the adult lineup:
-- toy-class gifts (Kiss, Cherries, The Rose, Peach, Lipstick, Magic
-- Wand, The Rabbit, Velvet Chains, Love Egg, Eggplant) under the two
-- kept whale anchors (Lion 5,000c, Universe 10,000c). Prices for Lion
-- and Universe do not move, so gifter stats and leaderboard history
-- carry over untouched.
--
-- Changes:
-- 1. gift_catalog gains anim_tier ('float' | 'burst' | 'stage' |
--    'takeover'): the live room's animation engine keys off it. The
--    legacy tier column keeps its 016 vocabulary (basic / premium /
--    luxury / mega) for glyph styling and economics grouping.
-- 2. The 12-gift lineup is upserted. The Rose keeps its 'rose' slug
--    and is repriced in place (10c -> 50c): the signature toy is not
--    the cheapest item in the store; Kiss takes the 10c floor slot.
-- 3. Retired generics (heart, coffee, perfume, crown, diamond) are
--    DEACTIVATED, never deleted: gift_transactions rows reference
--    them and history must keep resolving name/emoji.
-- 4. The catalog read policy opens to all rows so clients can
--    resolve RETIRED gifts in history and leaderboards. Store reads
--    filter is_active = true in the query (the room page does; the
--    send API enforces it server-side with the service role), so
--    retired gifts can be displayed in history but never sent.
-- 5. profiles gains gift_menu (jsonb slug -> reaction line): the
--    companion's pinned "what this gift gets from me" menu, written
--    only through POST /api/live/gift-menu (leak-scanned server-side).

-- 1. Animation tier column.
ALTER TABLE public.gift_catalog
  ADD COLUMN IF NOT EXISTS anim_tier text NOT NULL DEFAULT 'float';

DO $$
BEGIN
  ALTER TABLE public.gift_catalog
    ADD CONSTRAINT gift_catalog_anim_tier_check
    CHECK (anim_tier IN ('float', 'burst', 'stage', 'takeover'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. The lineup. Prices in coins (1 coin = ₦10); ladder steps never
--    exceed 2.5x. sort_order is the panel order, price ascending.
INSERT INTO public.gift_catalog (id, name, emoji, coin_cost, tier, is_active, sort_order, anim_tier)
VALUES
  ('kiss',     'Kiss',         '💋', 10,    'basic',   true, 1,  'float'),
  ('cherries', 'Cherries',     '🍒', 25,    'basic',   true, 2,  'float'),
  ('rose',     'The Rose',     '🌹', 50,    'basic',   true, 3,  'float'),
  ('peach',    'Peach',        '🍑', 100,   'premium', true, 4,  'burst'),
  ('lipstick', 'Lipstick',     '💄', 150,   'premium', true, 5,  'burst'),
  ('wand',     'Magic Wand',   '🪄', 250,   'premium', true, 6,  'burst'),
  ('rabbit',   'The Rabbit',   '🐰', 500,   'premium', true, 7,  'burst'),
  ('chains',   'Velvet Chains','⛓️', 750,   'premium', true, 8,  'burst'),
  ('egg',      'Love Egg',     '🥚', 1000,  'luxury',  true, 9,  'stage'),
  ('eggplant', 'Eggplant',     '🍆', 2500,  'luxury',  true, 10, 'stage'),
  ('lion',     'Lion',         '🦁', 5000,  'luxury',  true, 11, 'takeover'),
  ('universe', 'Universe',     '🌌', 10000, 'mega',    true, 12, 'takeover')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  coin_cost = EXCLUDED.coin_cost,
  tier = EXCLUDED.tier,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  anim_tier = EXCLUDED.anim_tier;

-- 3. Retire the generic launch gifts (rows stay for history). Their
--    anim_tier is still set so a historical event, if ever replayed,
--    animates at a sensible level.
UPDATE public.gift_catalog SET is_active = false, anim_tier = 'float'
  WHERE id IN ('heart', 'coffee');
UPDATE public.gift_catalog SET is_active = false, anim_tier = 'burst'
  WHERE id IN ('perfume', 'crown');
UPDATE public.gift_catalog SET is_active = false, anim_tier = 'stage'
  WHERE id = 'diamond';

-- 4. History must resolve retired gifts: open catalog reads. Sending
--    stays gated by is_active in /api/live/gift (service role).
DROP POLICY IF EXISTS "gift_catalog_public" ON public.gift_catalog;
CREATE POLICY "gift_catalog_public" ON public.gift_catalog
  FOR SELECT USING (true);

-- 5. Companion gift menu: slug -> short reaction line she promises
--    on camera. Display copy only; it never implies a gift activates
--    a real device (interactive hardware is a later phase).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gift_menu jsonb NOT NULL DEFAULT '{}'::jsonb;
