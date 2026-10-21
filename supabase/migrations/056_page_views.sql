-- 056: First-party page view tracking.
-- The PageViewBeacon in the app shell posts one row per route view
-- to /api/track, which writes here via the service role. Powers the
-- traffic section of /admin/analytics (pageviews, unique visitors,
-- top pages, referrer hosts) without a third-party analytics
-- service. referrer_host stores the host only, never a full URL, so
-- no query strings or tokens from other sites land in this table.
-- user_id is set for signed-in views; anon_id is a device id the
-- client keeps in localStorage, so unique visitors are a
-- device-based approximation, not a person count.

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  path text not null,
  referrer_host text,
  user_id uuid references public.profiles(id) on delete set null,
  anon_id text
);

create index if not exists page_views_created_idx
  on public.page_views (created_at desc);
create index if not exists page_views_path_idx
  on public.page_views (path);

alter table public.page_views enable row level security;

-- No policies on purpose: the beacon writes and the admin analytics
-- route reads through the service role only, which bypasses RLS.
-- Nothing here is readable or writable from the browser directly.
