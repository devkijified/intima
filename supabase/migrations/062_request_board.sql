-- Intima migration 062: the request board.
--
-- A client posts a structured request (city, service, rate, timing:
-- tokens only, no free text anywhere) and pays the standard
-- connection fee up front. Verified companions in that city respond
-- with Accept or a numeric counter. The client picks; the pick
-- stamps the settled fee payment to the chosen companion and opens
-- a normal connection through the existing machinery. A request
-- that expires unfilled refunds the fee through the original rail.
--
-- The fee payment rows are ordinary card_payments rows with kind
-- 'connection_fee' and a NULL target until the pick; the new
-- board_request_id column ties a payment (either rail) to its
-- request so settlement can open the request.

create table if not exists public.board_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  city text not null,
  service_type text not null,
  proposed_rate_ngn integer not null check (proposed_rate_ngn > 0),
  timing text not null check (timing in ('today', 'tomorrow', 'this_weekend', 'flexible')),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'open', 'filled', 'expired', 'cancelled')),
  payment_ref text,
  payment_rail text check (payment_rail in ('card', 'crypto')),
  picked_provider_id uuid,
  connection_id uuid,
  refund_state text check (refund_state in ('pending', 'refunded', 'failed')),
  opened_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_requests_city_status_idx
  on public.board_requests (city, status);
create index if not exists board_requests_client_idx
  on public.board_requests (client_id, created_at desc);

-- One live request per client at a time.
create unique index if not exists board_requests_one_live_per_client
  on public.board_requests (client_id)
  where status in ('awaiting_payment', 'open');

create table if not exists public.board_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.board_requests (id) on delete cascade,
  provider_id uuid,
  author_role text not null check (author_role in ('provider', 'client')),
  kind text not null check (kind in ('accept', 'counter', 'client_counter')),
  rate_ngn integer check (rate_ngn is null or rate_ngn > 0),
  created_at timestamptz not null default now()
);

create index if not exists board_responses_request_idx
  on public.board_responses (request_id, created_at);

alter table public.card_payments
  add column if not exists board_request_id uuid;
alter table public.crypto_payments
  add column if not exists board_request_id uuid;

-- All reads and writes go through the API (service role). RLS stays
-- on with no public policies, matching the broadcasts pattern.
alter table public.board_requests enable row level security;
alter table public.board_responses enable row level security;

-- Notification types for the board lifecycle.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%live_started%'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'live_started', 'booking_request', 'booking_accepted',
      'booking_message', 'new_review', 'system',
      'dispute_opened', 'dispute_resolved', 'provider_hidden',
      'incoming_call',
      'new_connection', 'connection_accepted', 'connection_deFlintd',
      'connection_expired',
      'subscription_started', 'subscription_renewed',
      'subscription_lapsed', 'subscription_paused',
      'cashout_requested', 'cashout_approved', 'cashout_rejected',
      'cashout_paid',
      'verification_approved', 'verification_rejected',
      'contest_won', 'referral_reward',
      'board_request_new', 'board_response', 'board_filled',
      'board_expired'
    ));
end $$;
