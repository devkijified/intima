-- 074: public comic view stats for the shelf and series pages.
-- One definition of a "view" everywhere: a unique reader (the
-- comic_reads row, which is also what increments episode view_count).
-- total_views sums the episode counters; monthly_views counts first
-- reads inside the current calendar month. Aggregates only, so this
-- is safe to expose publicly through a security definer function.

CREATE OR REPLACE FUNCTION public.comic_stats()
RETURNS TABLE (comic_id uuid, total_views bigint, monthly_views bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT e.comic_id,
         COALESCE(SUM(e.view_count), 0)::bigint AS total_views,
         COALESCE((
           SELECT COUNT(*) FROM public.comic_reads r
           JOIN public.comic_episodes e2 ON e2.id = r.episode_id
           WHERE e2.comic_id = e.comic_id
             AND r.first_read_at >= date_trunc('month', now())
         ), 0)::bigint AS monthly_views
  FROM public.comic_episodes e
  WHERE e.comic_id IS NOT NULL AND e.status = 'published'
  GROUP BY e.comic_id;
$$;

GRANT EXECUTE ON FUNCTION public.comic_stats() TO anon, authenticated;
