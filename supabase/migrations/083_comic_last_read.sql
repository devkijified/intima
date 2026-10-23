-- comic_reads.last_read_at: when this reader last touched the
-- episode (open, progress ping, or completion). first_read_at alone
-- cannot answer "what is she reading right now" for the dashboard
-- Continue Reading card; the track route stamps this on activity.
ALTER TABLE public.comic_reads
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

UPDATE public.comic_reads
SET last_read_at = GREATEST(first_read_at, COALESCE(completed_at, first_read_at))
WHERE last_read_at IS NULL;
