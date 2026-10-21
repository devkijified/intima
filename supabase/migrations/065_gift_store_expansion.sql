-- 065: Wire the full 50-type gift model set into the store.
-- Owner approved the sheet (2026-10-21) and ruled: wire all 45 new
-- types with the proposed ladder. The 5 types already live (wand,
-- lipstick, rabbit, dildo, ring) keep their 061 rows untouched.
-- Bands follow the 061 convention: float/basic for the cheapest,
-- burst/premium under 1,000, stage/luxury at 1,000 and up (those
-- animate under the premium-only rule). No new takeover: the top
-- new gift is 4,000, under Toy Chest at 5,000. Emoji stays as the
-- legacy fallback only; the UI renders the modeled objects.
-- Idempotent: ON CONFLICT re-asserts every field exactly.

INSERT INTO public.gift_catalog (id, name, emoji, coin_cost, tier, is_active, sort_order, anim_tier)
VALUES
  ('bullet',           'Bullet Vibrator',      '🔹', 80,   'basic',   true, 13, 'float'),
  ('masturbator-egg',  'Masturbator Egg',      '🥚', 120,  'premium', true, 14, 'burst'),
  ('bondage-tape',     'Bondage Tape',         '🎗️', 150,  'premium', true, 15, 'burst'),
  ('cock-ring',        'Cock Ring',            '⭕', 180,  'premium', true, 16, 'burst'),
  ('finger-vibe',      'Finger Vibrator',      '👆', 200,  'premium', true, 17, 'burst'),
  ('pinwheel',         'Pinwheel',             '🎡', 240,  'premium', true, 18, 'burst'),
  ('butt-plug',        'Butt Plug',            '🔌', 250,  'premium', true, 19, 'burst'),
  ('blindfold',        'Blindfold',            '🎭', 260,  'premium', true, 20, 'burst'),
  ('nipple-clamps',    'Nipple Clamps',        '📎', 280,  'premium', true, 21, 'burst'),
  ('anal-beads',       'Anal Beads',           '📿', 300,  'premium', true, 22, 'burst'),
  ('ruler',            'Spanking Ruler',       '📏', 300,  'premium', true, 23, 'burst'),
  ('triple-ring',      'Triple Cock Ring',     '🔗', 320,  'premium', true, 24, 'burst'),
  ('butterfly',        'Butterfly Vibrator',   '🦋', 350,  'premium', true, 25, 'burst'),
  ('sleeve',           'Pocket Sleeve',        '🧦', 380,  'premium', true, 26, 'burst'),
  ('nipple-suckers',   'Nipple Suckers',       '🍼', 380,  'premium', true, 27, 'burst'),
  ('paddle',           'Leather Paddle',       '🏓', 420,  'premium', true, 28, 'burst'),
  ('panty-vibe',       'Panty Vibrator',       '🌸', 450,  'premium', true, 29, 'burst'),
  ('flogger',          'Flogger',              '🧹', 480,  'premium', true, 30, 'burst'),
  ('vibe-nipple-clamps','Vibrating Nipple Clamps','📎', 520, 'premium', true, 31, 'burst'),
  ('vibe-plug',        'Vibrating Butt Plug',  '📳', 550,  'premium', true, 32, 'burst'),
  ('suction',          'Suction Toy',          '🌀', 600,  'premium', true, 33, 'burst'),
  ('tongue',           'Tongue Stimulator',    '👅', 650,  'premium', true, 34, 'burst'),
  ('ball-stretcher',   'Ball Stretcher',       '🏋️', 680,  'premium', true, 35, 'burst'),
  ('gspot',            'G-Spot Vibrator',      '🎯', 700,  'premium', true, 36, 'burst'),
  ('wrist-cuffs',      'Wrist Cuffs',          '⛓️', 720,  'premium', true, 37, 'burst'),
  ('ring-plug',        'Anal Ring Plug',       '💍', 750,  'premium', true, 38, 'burst'),
  ('air-pulse',        'Air-Pulse Stimulator', '💨', 800,  'premium', true, 39, 'burst'),
  ('inflatable-plug',  'Inflatable Butt Plug', '🎈', 850,  'premium', true, 40, 'burst'),
  ('egg-remote',       'Egg with Remote',      '🥚', 900,  'premium', true, 41, 'burst'),
  ('anal-hook',        'Anal Hook',            '🪝', 900,  'premium', true, 42, 'burst'),
  ('glass-plug',       'Glass Butt Plug',      '💎', 950,  'premium', true, 43, 'burst'),
  ('prostate-wand',    'Prostate Wand',        '🪄', 1050, 'luxury',  true, 44, 'stage'),
  ('prostate',         'Prostate Massager',    '🍑', 1100, 'luxury',  true, 45, 'stage'),
  ('glass-dildo',      'Glass Dildo',          '🧊', 1200, 'luxury',  true, 46, 'stage'),
  ('weighted-plug',    'Weighted Butt Plug',   '⚓', 1300, 'luxury',  true, 47, 'stage'),
  ('remote-plug',      'Remote-Control Plug',  '📡', 1400, 'luxury',  true, 48, 'stage'),
  ('suction-cup-dildo','Suction-Cup Dildo',    '🍆', 1500, 'luxury',  true, 49, 'stage'),
  ('inflatable-dildo', 'Inflatable Dildo',     '🎈', 1600, 'luxury',  true, 50, 'stage'),
  ('stroker-case',     'Stroker Case',         '🛢️', 1750, 'luxury',  true, 51, 'stage'),
  ('metal-dildo',      'Metal Dildo',          '🔩', 1800, 'luxury',  true, 52, 'stage'),
  ('fleshlight',       'Fleshlight',           '🔦', 1900, 'luxury',  true, 53, 'stage'),
  ('double-dildo',     'Double-Ended Dildo',   '🥒', 2000, 'luxury',  true, 54, 'stage'),
  ('strap-on',         'Strap-On Set',         '🩲', 2200, 'luxury',  true, 55, 'stage'),
  ('stroker-machine',  'Stroker Machine',      '🤖', 3500, 'luxury',  true, 56, 'stage'),
  ('thrusting-dildo',  'Thrusting Dildo',      '🚀', 4000, 'luxury',  true, 57, 'stage')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  coin_cost = EXCLUDED.coin_cost,
  tier = EXCLUDED.tier,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  anim_tier = EXCLUDED.anim_tier;
