-- 017: Companion stories (WhatsApp Status style).
--
-- Companions post ephemeral 24h stories: photos/videos with captions.
-- Viewers tap through fullscreen; stories expire automatically.
-- This pulls the WhatsApp Status habit in-platform.

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo', 'video')),
  caption text CHECK (char_length(caption) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS stories_provider_idx
  ON public.stories (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_expiry_idx
  ON public.stories (expires_at);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Anyone can view unexpired stories (they're public marketing).
DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
CREATE POLICY "stories_public_read" ON public.stories
  FOR SELECT USING (expires_at > now());

-- Providers post their own.
DROP POLICY IF EXISTS "stories_own_insert" ON public.stories;
CREATE POLICY "stories_own_insert" ON public.stories
  FOR INSERT WITH CHECK (provider_id = auth.uid());

-- Providers delete their own.
DROP POLICY IF EXISTS "stories_own_delete" ON public.stories;
CREATE POLICY "stories_own_delete" ON public.stories
  FOR DELETE USING (provider_id = auth.uid());

-- Story views (for "seen by" counts, WhatsApp-style).
CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "story_views_own" ON public.story_views;
CREATE POLICY "story_views_own" ON public.story_views
  FOR SELECT USING (
    viewer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_views.story_id AND s.provider_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "story_views_insert" ON public.story_views;
CREATE POLICY "story_views_insert" ON public.story_views
  FOR INSERT WITH CHECK (viewer_id = auth.uid());
