-- Intima migration 014: favorites (saved companions).
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. Safe to run more than once.

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, provider_id)
);
alter table public.favorites enable row level security;

drop policy if exists "Users manage their own favorites" on public.favorites;
create policy "Users manage their own favorites"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists favorites_user_id_idx
  on public.favorites (user_id, created_at desc);
