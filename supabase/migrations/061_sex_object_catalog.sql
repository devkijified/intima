-- 061: Sex object catalog.
--
-- Owner correction to 060 (2026-10-21): the gift store is sex
-- objects end to end. The 060 lineup still carried TikTok prestige
-- gifts (Lion, Universe) and innuendo items (Kiss, Cherries, Peach);
-- the owner is explicit that when he said "Rose" he meant the rose
-- vibrator, and the catalog should be objects like dildo and condom
-- all the way up the ladder, not lion and all.
--
-- Every price, animation tier, and sort slot from 060 is kept; only
-- the items change:
--   1  Condom 🎈 10c float        (new row)
--   2  Lube 🧴 25c float          (new row)
--   3  The Rose 🌹 50c float      (unchanged: the rose vibrator)
--   4  Lipstick Vibe 💄 100c burst (renamed, repriced 150c to 100c)
--   5  Vibe Ring 💍 150c burst    (new row)
--   6  Magic Wand 🪄 250c burst   (unchanged)
--   7  The Rabbit 🐰 500c burst   (unchanged)
--   8  Velvet Cuffs ⛓️ 750c burst (renamed from Velvet Chains)
--   9  Love Egg 🥚 1,000c stage   (unchanged)
--  10  Dildo 🍆 2,500c stage      (new row)
--  11  Toy Chest 🎁 5,000c takeover    (new row)
--  12  Golden Rose 🌹 10,000c takeover (new row: the luxury edition
--      of the icon, gold-styled in the room)
--
-- Retired (DEACTIVATED, never deleted): kiss, cherries, peach,
-- eggplant, lion, universe. Lion and Universe carry real gift
-- history in gift_transactions; the rows stay so names and emoji
-- keep resolving in history and leaderboards. Sending stays gated
-- by is_active in /api/live/gift (service role); store reads filter
-- is_active = true in the query, so the retired items vanish from
-- the panel the moment this runs.

-- 1. The full active lineup, upserted in one statement so every
--    row's name, price, tier, and sort slot is re-asserted exactly.
--    Legacy tier vocabulary matches the tier's animation level:
--    basic for float, premium for burst, luxury for stage and the
--    Toy Chest, mega for the Golden Rose.
INSERT INTO public.gift_catalog (id, name, emoji, coin_cost, tier, is_active, sort_order, anim_tier)
VALUES
  ('condom',      'Condom',       '🎈', 10,    'basic',   true, 1,  'float'),
  ('lube',        'Lube',         '🧴', 25,    'basic',   true, 2,  'float'),
  ('rose',        'The Rose',     '🌹', 50,    'basic',   true, 3,  'float'),
  ('lipstick',    'Lipstick Vibe','💄', 100,   'premium', true, 4,  'burst'),
  ('ring',        'Vibe Ring',    '💍', 150,   'premium', true, 5,  'burst'),
  ('wand',        'Magic Wand',   '🪄', 250,   'premium', true, 6,  'burst'),
  ('rabbit',      'The Rabbit',   '🐰', 500,   'premium', true, 7,  'burst'),
  ('chains',      'Velvet Cuffs', '⛓️', 750,   'premium', true, 8,  'burst'),
  ('egg',         'Love Egg',     '🥚', 1000,  'luxury',  true, 9,  'stage'),
  ('dildo',       'Dildo',        '🍆', 2500,  'luxury',  true, 10, 'stage'),
  ('chest',       'Toy Chest',    '🎁', 5000,  'luxury',  true, 11, 'takeover'),
  ('golden-rose', 'Golden Rose',  '🌹', 10000, 'mega',    true, 12, 'takeover')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  coin_cost = EXCLUDED.coin_cost,
  tier = EXCLUDED.tier,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  anim_tier = EXCLUDED.anim_tier;

-- 2. Retire the TikTok prestige and innuendo items from 060 (rows
--    stay for history; their anim_tier is left as set by 060 so a
--    historical event, if ever replayed, still animates sensibly).
UPDATE public.gift_catalog SET is_active = false
  WHERE id IN ('kiss', 'cherries', 'peach', 'eggplant', 'lion', 'universe');
