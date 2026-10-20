-- 029: comics. House-published serialized episodes (retention funnel).
-- FENCE-SAFE: episodes are admin-published only (no companion free text),
-- so there is no contact-leak vector; viewers read free, the magnet feeds
-- the map and live surfaces where the money is.

CREATE TABLE IF NOT EXISTS public.comic_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_no integer NOT NULL UNIQUE,
  title text NOT NULL,
  synopsis text,
  cover_url text,
  panel_urls text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comic_episodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comic_episodes_public" ON public.comic_episodes;
CREATE POLICY "comic_episodes_public" ON public.comic_episodes
  FOR SELECT USING (status = 'published');

-- Viewer tracking: one row per viewer per episode.
-- user_id for signed-in readers; viewer_key (client device id) for guests.
CREATE TABLE IF NOT EXISTS public.comic_reads (
  episode_id uuid NOT NULL REFERENCES public.comic_episodes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_key text,
  first_read_at timestamptz NOT NULL DEFAULT now(),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  PRIMARY KEY (episode_id, coalesce(user_id::text, viewer_key))
);
ALTER TABLE public.comic_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comic_reads_public" ON public.comic_reads;
CREATE POLICY "comic_reads_own" ON public.comic_reads
  FOR SELECT USING (user_id = auth.uid());
-- Atomic unique-view increment (one per viewer, server-side only).
CREATE OR REPLACE FUNCTION public.increment_comic_views(ep uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.comic_episodes
  SET view_count = view_count + 1
  WHERE id = ep;
END; $$;
