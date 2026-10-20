-- 047: Private snaps. Fan-only photo and video collections on a
-- companion profile, the Intima version of a private story for
-- paying followers.
--
-- Media lives in a private bucket, private-snaps, under the
-- provider's own <uid>/ folder. There are no public reads and no
-- fan storage policies: fans see snaps only through short-lived
-- signed URLs minted server-side by GET /api/private-snaps after
-- the subscription check passes. Non-subscribers never receive a
-- storage path or a signed URL, only collection names and counts.
--
-- Access is the fan club from 041: an effective subscription
-- (status 'active', or 'cancelled' with the paid period still
-- running). Money already flows through the subscription split in
-- platform_settings.subscription_platform_cut_pct, so private
-- snaps need no new payment path.

-- ============================================================
-- 1. Private snaps bucket (own folder only)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('private-snaps', 'private-snaps', false)
on conflict (id) do nothing;

drop policy if exists "psnaps_insert_own" on storage.objects;
create policy "psnaps_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'private-snaps'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "psnaps_select_own" on storage.objects;
create policy "psnaps_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'private-snaps'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "psnaps_delete_own" on storage.objects;
create policy "psnaps_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'private-snaps'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 2. private_snaps table
-- ============================================================
create table if not exists public.private_snaps (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption text,
  collection text not null default 'Private snaps',
  created_at timestamptz not null default now()
);

create index if not exists private_snaps_provider_collection_idx
  on public.private_snaps (provider_id, collection, created_at desc);

alter table public.private_snaps enable row level security;

-- Reads: the owner, or an admin. Writes: the owner only. The API
-- enforces the same rules; RLS is the backstop. Fans never read
-- this table directly (the API answers with counts and, for
-- subscribers, signed URLs).
drop policy if exists private_snaps_select on public.private_snaps;
create policy private_snaps_select on public.private_snaps
  for select using (provider_id = auth.uid() or public.is_admin());

drop policy if exists private_snaps_insert on public.private_snaps;
create policy private_snaps_insert on public.private_snaps
  for insert with check (provider_id = auth.uid());

drop policy if exists private_snaps_delete on public.private_snaps;
create policy private_snaps_delete on public.private_snaps
  for delete using (provider_id = auth.uid());
