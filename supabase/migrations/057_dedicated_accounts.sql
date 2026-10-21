-- Intima migration 057: dedicated virtual accounts (Paystack DVA).
--
-- Every user gets a permanent personal Naira account number (the
-- Grey-style model): they transfer any amount to it from any bank and
-- the Paystack charge.success webhook (channel 'dedicated_nuban')
-- credits coins automatically at 1 coin per ₦10. One row per user,
-- storing the Paystack customer and dedicated account identity so the
-- webhook can resolve a credit to a user without guessing.
--
-- Writes go through the service role only (the row is created from
-- Paystack API responses server-side); the owner can read their own
-- row. Idempotent: safe to run more than once.

create table if not exists public.user_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  provider text not null default 'paystack_dva',
  paystack_customer_code text,
  dedicated_id text,
  account_number text,
  bank_name text,
  account_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_bank_accounts_account_number_idx
  on public.user_bank_accounts (account_number);

alter table public.user_bank_accounts enable row level security;

drop policy if exists user_bank_accounts_select_own on public.user_bank_accounts;
create policy user_bank_accounts_select_own
  on public.user_bank_accounts
  for select
  using (auth.uid() = user_id);
