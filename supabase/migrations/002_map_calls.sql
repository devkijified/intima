-- Intima migration 002: map presence + call records
--
-- HOW TO APPLY: open the Supabase dashboard for this project, go to the SQL
-- editor, paste this entire file, and run it. The app cannot apply
-- migrations by itself. Safe to run more than once (IF NOT EXISTS guards).

-- ---------------------------------------------------------------------------
-- provider_presence: area-level, strictly opt-in location for the Intima Map.
-- Coordinates are neighbourhood centres (e.g. Lekki, Yaba), never addresses.
-- ---------------------------------------------------------------------------
create table if not exists public.provider_presence (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  city text not null,
  area_lat double precision not null,
  area_lng double precision not null,
  show_on_map boolean not null default false,
  is_available boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(provider_id)
);

alter table public.provider_presence enable row level security;

drop policy if exists "Public map pins are visible to everyone" on public.provider_presence;
create policy "Public map pins are visible to everyone"
  on public.provider_presence for select
  using (show_on_map = true);

drop policy if exists "Providers manage their own presence" on public.provider_presence;
create policy "Providers manage their own presence"
  on public.provider_presence for insert
  with check (auth.uid() = provider_id);

drop policy if exists "Providers update their own presence" on public.provider_presence;
create policy "Providers update their own presence"
  on public.provider_presence for update
  using (auth.uid() = provider_id)
  with check (auth.uid() = provider_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists provider_presence_touch on public.provider_presence;
create trigger provider_presence_touch
  before update on public.provider_presence
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- calls: 1:1 voice/video call records. Signaling itself travels over
-- Supabase Realtime broadcast channels (calls:{userId}); this table is only
-- the audit trail (who called whom, kind, outcome).
-- ---------------------------------------------------------------------------
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('voice', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'active', 'ended', 'rejected', 'missed')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.calls enable row level security;

drop policy if exists "Call participants can read their calls" on public.calls;
create policy "Call participants can read their calls"
  on public.calls for select
  using (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "Call participants can log their calls" on public.calls;
create policy "Call participants can log their calls"
  on public.calls for insert
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "Call participants can update their calls" on public.calls;
create policy "Call participants can update their calls"
  on public.calls for update
  using (auth.uid() = caller_id or auth.uid() = callee_id)
  with check (auth.uid() = caller_id or auth.uid() = callee_id);
