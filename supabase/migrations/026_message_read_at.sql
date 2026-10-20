-- 026: message read receipts (drives unread badges in the thread list).
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON public.messages (connection_id, sender_id)
  WHERE read_at IS NULL;
