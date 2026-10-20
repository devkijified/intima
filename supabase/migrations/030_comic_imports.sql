-- 030: import provenance for auto-published comic episodes.
-- Episodes imported from licensed/owned feeds carry their source + guid
-- so the poller never imports the same episode twice and the reader can
-- credit the source.

ALTER TABLE public.comic_episodes
  ADD COLUMN IF NOT EXISTS import_guid text,
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS source_link text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comic_episodes_import
  ON public.comic_episodes (import_source, import_guid)
  WHERE import_guid IS NOT NULL;

INSERT INTO public.platform_settings (key, value)
VALUES ('comic_feeds', '[]')
ON CONFLICT (key) DO NOTHING;
