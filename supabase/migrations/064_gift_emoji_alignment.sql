-- 064: Gift emoji realignment (owner, 2026-10-21: "the emoji is not
-- aligning with the sex world"). The first lineup read like a kids'
-- sticker sheet: a party balloon for Condom, a fairy wand, a bunny
-- face. Swapped to adult-coded glyphs:
--   Condom 🎈 -> 🛡️ (protection), Lube 🧴 -> 💧 (wet),
--   The Rose 🌹 -> 🌺 (hibiscus; Golden Rose keeps 🌹),
--   Magic Wand 🪄 -> ⚡ (buzz), The Rabbit 🐰 -> 🐇 (full rabbit).
-- Kept: Lipstick 💄, Vibe Ring 💍, Velvet Cuffs ⛓️, Love Egg 🥚,
-- Dildo 🍆, Toy Chest 🎁, Golden Rose 🌹.
update public.gift_catalog set emoji = '🛡️' where id = 'condom';
update public.gift_catalog set emoji = '💧' where id = 'lube';
update public.gift_catalog set emoji = '🌺' where id = 'rose';
update public.gift_catalog set emoji = '⚡' where id = 'wand';
update public.gift_catalog set emoji = '🐇' where id = 'rabbit';
