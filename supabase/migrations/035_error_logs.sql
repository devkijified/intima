-- 035: Error observability log.
-- Client and server errors are posted to /api/logs, which writes here
-- via the service role only. Admins read the aggregated view at
-- /admin/errors. Reconcile mismatches (source = 'reconcile') also land
-- here so balance drift shows up next to runtime errors.

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  route text,
  source text NOT NULL DEFAULT 'client'
    CHECK (source IN ('client', 'server', 'reconcile')),
  stack_head text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_logs_message_created_idx
  ON public.error_logs (message, created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_created_idx
  ON public.error_logs (created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_logs_admin_select ON public.error_logs;
CREATE POLICY error_logs_admin_select ON public.error_logs
  FOR SELECT USING (public.is_admin());

-- No insert, update, or delete policies on purpose: writes go through
-- the service role (the /api/logs route and the reconcile cron), which
-- bypasses RLS.
