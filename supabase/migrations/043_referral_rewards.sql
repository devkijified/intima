-- 043: referral rewards. One reward per referred user, ever, paid
-- when that user opens their first genuine connection.
--
-- Attribution background (verified in code, 2026-10-20):
--   * RefCapture + lib/links.ts already capture ?ref= into localStorage
--     (key intima_ref), and /c/{username} redirects with ref set to the
--     companion username, so the stored ref is a USERNAME string.
--   * The signup page already sends that value as referred_by inside
--     the auth user metadata.
--   * BUT no profiles.referred_by column existed and the
--     handle_new_user trigger never persisted the metadata value, so
--     the attribution was silently dropped. This migration adds the
--     column as TEXT (it holds a username, not a uuid) and rewires
--     the trigger to store it. The reward code resolves the username
--     to a profile id at payout time and also accepts a raw uuid.

alter table public.profiles
  add column if not exists referred_by text;

comment on column public.profiles.referred_by is
  'Referrer captured at signup: a username (from ?ref=) or, rarely, a profile uuid. Resolved to a profile at reward time.';

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by)
  where referred_by is not null;

-- Persist referred_by at signup. Same body as migration 025, plus the
-- referred_by column read from the auth metadata the signup page sends.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  );
  -- Usernames are unique; if taken, fall back to a suffixed variant.
  if exists (select 1 from public.profiles where username = v_username and id <> new.id) then
    v_username := v_username || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  insert into public.profiles (id, role, display_name, full_name, phone, username, referred_by)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'client'),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    v_username,
    nullif(new.raw_user_meta_data ->> 'referred_by', '')
  )
  on conflict (id) do update set
    role = excluded.role,
    display_name = excluded.display_name,
    full_name = excluded.full_name,
    phone = excluded.phone,
    username = excluded.username,
    referred_by = coalesce(public.profiles.referred_by, excluded.referred_by);
  return new;
end;
$$;

-- One row per payout. The unique index on referee_id is the hard guard
-- against double grants: a referred user can only ever earn their
-- referrer one reward.
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  reward_kind text not null check (reward_kind in ('coins', 'boost_credit')),
  coins integer not null default 0,
  connection_id uuid references public.connections(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists referral_rewards_referee_unique
  on public.referral_rewards (referee_id);

create index if not exists referral_rewards_referrer_idx
  on public.referral_rewards (referrer_id);

alter table public.referral_rewards enable row level security;

-- Read own rewards, or any row as an admin. Writes are service role
-- only (the connections API), so there is no insert or update policy.
drop policy if exists referral_rewards_select_own on public.referral_rewards;
create policy referral_rewards_select_own on public.referral_rewards
  for select using (referrer_id = auth.uid() or public.is_admin());
