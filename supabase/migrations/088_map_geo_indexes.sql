-- 088: geographic indexes for viewport-bounded map queries.
--
-- The map now loads companions per viewport (bounding box on
-- area_lat / area_lng against the map_providers view) instead of
-- pulling the whole directory. Those columns live on
-- provider_presence; a view cannot be indexed, its base table
-- can, and the planner pushes the box filter down to it.
-- Btree pair: the box predicate is a range on both columns.
-- Idempotent: safe to re-run.
create index if not exists idx_provider_presence_area_lat
  on public.provider_presence (area_lat);
create index if not exists idx_provider_presence_area_lng
  on public.provider_presence (area_lng);
