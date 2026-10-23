-- 080: comic view inflation guard.
-- comic_reads gains the hashed source IP of guest reads so the track
-- route can cap how many first-time views one network address can
-- mint per hour (key rotation alone used to inflate counts without
-- limit). Signed-in readers are accountable identities and are never
-- capped; their rows keep ip_hash null.
alter table public.comic_reads add column if not exists ip_hash text;
create index if not exists comic_reads_ip_time_idx
  on public.comic_reads (ip_hash, first_read_at);

-- Hourly cap on counted guest first-views per source IP. Tunable by
-- the owner in platform_settings; the route falls back to 300 when
-- the row is missing or unreadable.
insert into public.platform_settings (key, value)
values ('comic_ip_hourly_cap', '300')
on conflict (key) do nothing;
