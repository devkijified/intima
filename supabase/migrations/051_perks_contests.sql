-- 051: Perks contests (challenges and photo contests).
-- Companions enter with one photo (human approved before it shows),
-- signed-in members vote (one vote per account per contest, movable
-- until the contest ends), contestants share their entry link to pull
-- voters in, and the platform pays coin prizes to the winners when
-- the admin closes the contest. Prizes are platform marketing spend,
-- credited through credit_coins with a per-entry ref (idempotent).

create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  theme text not null default '',
  prize_coins int not null default 0 check (prize_coins >= 0),
  prize_split jsonb not null default '[100]'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed', 'paid')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  image_path text not null,
  caption text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  created_at timestamptz not null default now(),
  unique (contest_id, provider_id)
);

create table if not exists public.contest_votes (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  entry_id uuid not null references public.contest_entries(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contest_id, voter_id)
);

create index if not exists contest_entries_contest_idx on public.contest_entries (contest_id, status, created_at);
create index if not exists contest_votes_entry_idx on public.contest_votes (entry_id);
create index if not exists contests_window_idx on public.contests (status, starts_at, ends_at);

alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_votes enable row level security;

-- Reads: contests are public (they are the share surface). Entries are
-- readable when approved, or by their owner, or by admins. Votes are
-- counted server-side; a voter can read their own vote.
drop policy if exists contests_read on public.contests;
create policy contests_read on public.contests for select using (true);
drop policy if exists contest_entries_read on public.contest_entries;
create policy contest_entries_read on public.contest_entries for select
  using (status = 'approved' or provider_id = auth.uid() or public.is_admin());
drop policy if exists contest_votes_read on public.contest_votes;
create policy contest_votes_read on public.contest_votes for select
  using (voter_id = auth.uid() or public.is_admin());
-- Writes go through the API routes (service role) so the contest
-- rules (window, one entry, no self vote) are enforced in one place.

-- Entry photos: public bucket (entries exist to be seen and shared),
-- own-folder writes like profile-photos.
insert into storage.buckets (id, name, public)
values ('contest-entries', 'contest-entries', true)
on conflict (id) do nothing;

drop policy if exists "contest entries read" on storage.objects;
create policy "contest entries read" on storage.objects for select
  using (bucket_id = 'contest-entries');
drop policy if exists "contest entries insert own" on storage.objects;
create policy "contest entries insert own" on storage.objects for insert
  with check (bucket_id = 'contest-entries' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "contest entries delete own" on storage.objects;
create policy "contest entries delete own" on storage.objects for delete
  using (bucket_id = 'contest-entries' and (storage.foldername(name))[1] = auth.uid()::text);
