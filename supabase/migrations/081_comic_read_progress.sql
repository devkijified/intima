-- 081: per-episode read strength.
-- The furthest scroll fraction (0 to 100) a reader reached in an
-- episode, so the series page can draw a progress bar per episode
-- like a streaming series page. Written by /api/comics/track
-- (greatest value wins, it never moves backwards); completed reads
-- sit at 100. Nullable: rows from before this migration simply
-- have no fraction yet.
ALTER TABLE public.comic_reads
  ADD COLUMN IF NOT EXISTS progress_pct smallint;
