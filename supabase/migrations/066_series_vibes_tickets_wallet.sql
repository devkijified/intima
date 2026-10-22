-- 066: Comic series, companion vibes, support tickets, contest
-- video entries, wallet-paid connection fees, preset catalogues.
-- Owner fix wave, 2026-10-22.

-- ---------- Comic series: a Comic holds episodes ----------
create table if not exists public.comics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  synopsis text not null default '',
  cover_url text,
  status text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

alter table public.comic_episodes
  add column if not exists comic_id uuid references public.comics(id) on delete set null;

-- Backfill: one series per distinct source name; anything without
-- a source lands in the house series, so every existing episode
-- keeps a home.
insert into public.comics (title, synopsis)
select distinct coalesce(nullif(source_name, ''), 'Intima Comics'),
       'House stories from Intima.'
from public.comic_episodes
where comic_id is null
on conflict do nothing;

update public.comic_episodes e
set comic_id = c.id
from public.comics c
where e.comic_id is null
  and c.title = coalesce(nullif(e.source_name, ''), 'Intima Comics');

alter table public.comics enable row level security;
drop policy if exists comics_public_read on public.comics;
create policy comics_public_read on public.comics
  for select using (status = 'published' or public.is_admin());

-- ---------- Companion vibes ----------
alter table public.profiles
  add column if not exists vibes text[] not null default '{}';

-- ---------- Contest entries can be video ----------
alter table public.contest_entries
  add column if not exists media_type text not null default 'photo'
  check (media_type in ('photo', 'video'));

-- ---------- Wallet-paid fees join the coin ledger ----------
-- Rebuild the kind check with the full known list plus
-- 'connection_fee' (a client paying the connection or board fee
-- from coin balance) and 'board_fee'.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.coin_ledger'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.coin_ledger drop constraint %I', c.conname);
  end loop;
  alter table public.coin_ledger
    add constraint coin_ledger_kind_check
    check (kind in (
      'topup_card', 'topup_crypto', 'topup_transfer',
      'gift_send', 'gift_receive',
      'ppv_unlock', 'ppv_receive',
      'cashout_request', 'cashout_refund',
      'boost',
      'subscription_charge', 'subscription_earning',
      'referral', 'admin_adjust', 'contest_prize',
      'connection_fee', 'board_fee'
    ));
end $$;

-- ---------- Support tickets ----------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  category text not null default 'general'
    check (category in ('general', 'payments', 'account', 'safety', 'technical', 'other')),
  status text not null default 'open'
    check (status in ('open', 'answered', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('user', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx
  on public.support_tickets (user_id, last_message_at desc);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status, last_message_at desc);
create index if not exists ticket_messages_ticket_idx
  on public.ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;

drop policy if exists tickets_select_own on public.support_tickets;
create policy tickets_select_own on public.support_tickets
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists tickets_insert_own on public.support_tickets;
create policy tickets_insert_own on public.support_tickets
  for insert with check (user_id = auth.uid());
drop policy if exists tickets_update_own on public.support_tickets;
create policy tickets_update_own on public.support_tickets
  for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists ticket_messages_select on public.ticket_messages;
create policy ticket_messages_select on public.ticket_messages
  for select using (
    public.is_admin() or exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );
drop policy if exists ticket_messages_insert on public.ticket_messages;
create policy ticket_messages_insert on public.ticket_messages
  for insert with check (
    public.is_admin() or exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

-- ---------- Notification types: contest alerts + ticket updates ----------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.notifications'::regclass and contype = 'c'
      and conname = 'notifications_type_check'
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
      'board_expired',
      'contest_new', 'ticket_update'
    ));
end $$;

-- ---------- Admin-editable catalogues (settings seeds) ----------
-- The app reads these with built-in defaults when a row is absent;
-- the seeds exist so the admin editor has something to open.
insert into public.platform_settings (key, value, description)
values
  ('preset_vibes',
   '["420 Friendly","Rimming","Fetish Friendly","Kink Friendly","Role Play","Couples Welcome","Party Girl","Low Volume","High Class","Girl Next Door","Outcalls Only","Incalls Available"]'::jsonb,
   'Vibe tags companions can pick for their profile. Edited in Admin, Services and cities.'),
  ('preset_services',
   '[]'::jsonb,
   'Extra service options companions can pick, beyond the built-in catalogue. Edited in Admin, Services and cities.'),
  ('cities',
   '["Lagos","Abuja","Port Harcourt","Ibadan","Enugu","Benin City","Kano"]'::jsonb,
   'Cities companions can base themselves in. Edited in Admin, Services and cities.'),
  ('city_coords',
   '{}'::jsonb,
   'Optional map centres for cities added later, as {"City":[lng,lat]}. Edited in Admin, Services and cities.')
on conflict (key) do nothing;
