-- 084: automated identity verification (Dojah) with admin fallback.
--
-- The existing verification flow stays exactly as it is for users:
-- ID photo, selfie holding the ID, and the handwritten sign selfie go
-- to the private verification-docs bucket and a row lands in
-- public.verifications as pending. This migration only adds the
-- bookkeeping the automation layer needs: which provider checked the
-- submission, what it returned, whether the decision was automatic,
-- and where a submission sits when the provider cannot make a clean
-- call and a human has to look (automation_status = 'manual_review').
-- No new tables, so the existing table grants keep applying.

ALTER TABLE public.verifications
  ADD COLUMN IF NOT EXISTS automation_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS provider_result jsonb,
  ADD COLUMN IF NOT EXISTS provider_confidence numeric,
  ADD COLUMN IF NOT EXISTS decision_source text,
  ADD COLUMN IF NOT EXISTS automated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'verifications_automation_status_check'
  ) THEN
    ALTER TABLE public.verifications
      ADD CONSTRAINT verifications_automation_status_check
      CHECK (automation_status IN (
        'not_started', 'not_configured', 'processing',
        'approved', 'rejected', 'manual_review', 'error'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'verifications_decision_source_check'
  ) THEN
    ALTER TABLE public.verifications
      ADD CONSTRAINT verifications_decision_source_check
      CHECK (decision_source IS NULL OR decision_source IN ('admin', 'dojah', 'dojah_webhook'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS verifications_provider_reference_idx
  ON public.verifications (provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS verifications_automation_pending_idx
  ON public.verifications (automation_status, submitted_at)
  WHERE status = 'pending';
