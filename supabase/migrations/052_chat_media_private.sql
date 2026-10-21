-- 052: Private chat media bucket for PPV hardening.
--
-- The problem: thread chat media lived at public URLs. The
-- messages.media_url value itself travelled to both browsers in a
-- thread, so a locked PPV photo or video was only blurred in the
-- UI while the raw file stayed one right-click away for the
-- non-payer. Locked media and free media were equally exposed.
--
-- The fix follows the Fans Only pattern from 047: a private
-- bucket, chat-media, with objects under the uploader's own
-- <uid>/ folder. There are deliberately no public reads and no
-- select policy for thread partners. New chat uploads land here,
-- and messages.media_url stores the storage path for them (values
-- that do not start with http are paths, values that do are legacy
-- public URLs and keep rendering as before). The thread UI asks
-- POST /api/chat/media-urls for short-lived signed URLs; the
-- server mints one only for the sender, for free media, or for a
-- viewer who has unlocked that PPV message. A locked message the
-- caller has not paid for produces no URL at all.
--
-- Nothing else changes: messages rows, the ppv unlock route, and
-- media_views keep their current shape and policies.

-- ============================================================
-- 1. Private chat media bucket (own folder writes, no reads)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

drop policy if exists "chatmedia_insert_own" on storage.objects;
create policy "chatmedia_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chatmedia_update_own" on storage.objects;
create policy "chatmedia_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chatmedia_delete_own" on storage.objects;
create policy "chatmedia_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- No select policy on purpose: even the uploader reads her media
-- back through the server-minted signed URLs, so storage reads
-- can never bypass the PPV check.
