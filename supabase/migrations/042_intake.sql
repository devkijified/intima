-- 042: screening intake. Companions ask up to 3 short questions and
-- clients answer them when they request a connection. Screening only:
-- no money, no deposits, no escrow questions live here. Answers are
-- user text, so POST /api/connections runs them through the contact
-- leak scanner before anything is stored.

-- The questions a companion asks new clients. Array of up to 3 strings,
-- each at most 120 characters. Length is enforced in app code.
alter table public.profiles
  add column if not exists intake_questions jsonb not null default '[]'::jsonb;

comment on column public.profiles.intake_questions is
  'Up to 3 screening questions (strings) the companion asks new clients. Clients answer in the request flow.';

-- The answers given on one connection. Array of { q, a } objects, or
-- null when the companion asked nothing. Answers are leak-scanned
-- server-side in POST /api/connections before insert.
alter table public.connections
  add column if not exists intake_answers jsonb;

comment on column public.connections.intake_answers is
  'Client answers to the companion intake questions: array of { q, a } objects, or null.';
