-- 076: comic series follows ("Notify me") + the comic_episode
-- notification type. A follow records when the reader last looked
-- at the series, so the nav badge can count episodes published
-- since then. Followers are the only members notified when a new
-- episode publishes (lib/comics/import.ts notifySeriesFollowers).

create table if not exists public.comic_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  comic_id uuid not null references public.comics(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, comic_id)
);

create index if not exists comic_follows_user_idx on public.comic_follows (user_id);
create index if not exists comic_follows_comic_idx on public.comic_follows (comic_id);

alter table public.comic_follows enable row level security;

drop policy if exists comic_follows_select_own on public.comic_follows;
create policy comic_follows_select_own on public.comic_follows
  for select using (user_id = auth.uid());

drop policy if exists comic_follows_insert_own on public.comic_follows;
create policy comic_follows_insert_own on public.comic_follows
  for insert with check (user_id = auth.uid());

drop policy if exists comic_follows_update_own on public.comic_follows;
create policy comic_follows_update_own on public.comic_follows
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists comic_follows_delete_own on public.comic_follows;
create policy comic_follows_delete_own on public.comic_follows
  for delete using (user_id = auth.uid());

-- ---------- Notification type: new comic episode ----------
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
      'contest_new', 'ticket_update',
      'comic_episode'
    ));
end $$;
