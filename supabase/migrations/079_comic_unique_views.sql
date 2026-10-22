-- 079: comic views count unique readers, for real this time.
-- A "view" is a comic_reads row: one per reader per episode,
-- enforced by the UNIQUE (episode_id, viewer_id) constraint from
-- migration 029. But migration 074's comic_stats() computed
-- total_views by SUMming comic_episodes.view_count, a counter that
-- had already inflated (guest identity used to live in localStorage
-- and regenerated whenever storage was cleared or unavailable, and
-- the track endpoint's select-then-upsert let racing opens from
-- one reader both increment). The counter and the reads table could
-- therefore disagree, always in the inflated direction.
--
-- This migration makes the reads table the single source of truth:
-- total_views and monthly_views both count comic_reads rows, and
-- the stored view_count column is resynced once from those rows so
-- per-episode displays (reader title plate, series episode rows)
-- agree with the totals again. The track endpoint now only
-- increments on a genuinely new read row, keyed by a durable
-- httpOnly reader cookie, so the two stay in step from here.

CREATE OR REPLACE FUNCTION public.comic_stats()
RETURNS TABLE (comic_id uuid, total_views bigint, monthly_views bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT e.comic_id,
         COUNT(r.id)::bigint AS total_views,
         COUNT(r.id) FILTER (WHERE r.first_read_at >= date_trunc('month', now()))::bigint AS monthly_views
  FROM public.comic_episodes e
  LEFT JOIN public.comic_reads r ON r.episode_id = e.id
  WHERE e.comic_id IS NOT NULL AND e.status = 'published'
  GROUP BY e.comic_id;
$$;

GRANT EXECUTE ON FUNCTION public.comic_stats() TO anon, authenticated, service_role;

-- One-time repair: resync the denormalized counter from the unique
-- read rows it was always supposed to mirror.
UPDATE public.comic_episodes e
SET view_count = (SELECT COUNT(*) FROM public.comic_reads r WHERE r.episode_id = e.id);
