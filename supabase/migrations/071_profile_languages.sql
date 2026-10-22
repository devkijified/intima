-- 071: Companion languages. Model cards have rendered a languages
-- row since the beginning, but no column ever existed to hold the
-- data; this adds it so companions can finally set the languages
-- they speak in setup and on their profile.

alter table public.profiles
  add column if not exists languages text[] not null default '{}';
