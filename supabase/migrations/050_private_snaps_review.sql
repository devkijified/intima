-- 050: Private Snaps content rules (owner decision 2026-10-20).
-- Every snap passes a human review before fans can see it or it can
-- count toward the fan club earning bar. Videos carry their duration
-- so the 30 second minimum is enforceable. Thresholds live in
-- platform_settings as JSON numbers, adjustable without a deploy.

alter table public.private_snaps
  add column if not exists review_status text not null default 'pending',
  add column if not exists duration_seconds integer,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reject_reason text;

alter table public.private_snaps
  drop constraint if exists private_snaps_review_status_check;
alter table public.private_snaps
  add constraint private_snaps_review_status_check
  check (review_status in ('pending', 'approved', 'rejected'));

create index if not exists private_snaps_review_queue_idx
  on public.private_snaps (review_status, created_at);

insert into public.platform_settings (key, value) values
  ('snaps_min_contents', '7'),
  ('snaps_min_video_seconds', '30'),
  ('snaps_min_carousel_photos', '5'),
  ('snaps_stale_days', '30')
on conflict (key) do nothing;
