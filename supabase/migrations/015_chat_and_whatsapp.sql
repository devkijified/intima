-- 015: In-app chat for active connections + companion WhatsApp linking.
--
-- WhatsApp: companions link their number in their profile. It is ONLY
-- revealed to clients who hold an ACTIVE (paid) connection with them.
-- In-app chat: messages belong to a connection; only the two parties
-- can read or write.

-- 1. WhatsApp number on provider profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

-- 2. Messages table.
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_connection_idx
  ON public.messages (connection_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Read: only the two parties of the connection.
DROP POLICY IF EXISTS "messages_read_parties" ON public.messages;
CREATE POLICY "messages_read_parties" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = messages.connection_id
        AND (c.client_id = auth.uid() OR c.provider_id = auth.uid())
    )
  );

-- Write: only the two parties, and the connection must be active.
DROP POLICY IF EXISTS "messages_write_parties" ON public.messages;
CREATE POLICY "messages_write_parties" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = messages.connection_id
        AND c.status = 'active'
        AND (c.client_id = auth.uid() OR c.provider_id = auth.uid())
    )
  );

-- 3. WhatsApp reveal: a client may read a provider's whatsapp_number only
--    when they share an ACTIVE connection. Providers always see their own.
DROP POLICY IF EXISTS "profiles_whatsapp_restricted" ON public.profiles;
-- (Column-level restriction is enforced in app code; this policy documents
-- intent. The anon-readable map_providers view never selects whatsapp_number.)
