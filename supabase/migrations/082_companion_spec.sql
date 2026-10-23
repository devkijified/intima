-- Companion spec: the structured "what is your spec" attributes a
-- companion declares on her profile (lib/spec.ts holds the fixed
-- vocabularies) and clients filter the map by. Fixed choices only,
-- no free text, so the spec can never carry contact details around
-- the connection fee. All optional: an unset spec simply never
-- matches an active spec filter.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS spec_complexion text,
  ADD COLUMN IF NOT EXISTS spec_body_type text,
  ADD COLUMN IF NOT EXISTS spec_height text,
  ADD COLUMN IF NOT EXISTS spec_tags text[] NOT NULL DEFAULT '{}';
