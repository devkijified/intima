-- 028: trust tier engine. Elite = 10+ completed connections, 4.8+ avg
-- rating, verified. Runs from admin or manually; safe to re-run.

CREATE OR REPLACE FUNCTION public.recompute_trust_tiers()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count integer;
BEGIN
  WITH stats AS (
    SELECT
      p.id,
      (SELECT count(*) FROM public.connections c
        WHERE c.provider_id = p.id AND c.status = 'active') AS conns,
      (SELECT coalesce(avg(rating), 0) FROM public.reviews r
        WHERE r.provider_id = p.id) AS avg_rating
    FROM public.profiles p
    WHERE p.role = 'model'
  )
  UPDATE public.profiles p
  SET trust_tier = CASE
    WHEN p.verification_status = 'verified' AND s.conns >= 10 AND s.avg_rating >= 4.8 THEN 'elite'
    WHEN p.verification_status = 'verified' AND p.trust_tier = 'video_verified' THEN 'video_verified'
    ELSE 'verified'
  END
  FROM stats s
  WHERE p.id = s.id
    AND p.trust_tier IS DISTINCT FROM CASE
      WHEN p.verification_status = 'verified' AND s.conns >= 10 AND s.avg_rating >= 4.8 THEN 'elite'
      WHEN p.verification_status = 'verified' AND p.trust_tier = 'video_verified' THEN 'video_verified'
      ELSE 'verified'
    END;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
