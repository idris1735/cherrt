-- Links WhatsApp phone numbers to real Chertt workspace accounts.
-- Once linked, WhatsApp messages route to the user's workspace instead of guest/demo mode.

CREATE TABLE IF NOT EXISTS whatsapp_phone_links (
  phone_number   TEXT        PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id   UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workspace_slug TEXT        NOT NULL,
  workspace_name TEXT        NOT NULL,
  user_name      TEXT        NOT NULL DEFAULT '',
  user_role      TEXT        NOT NULL DEFAULT 'member',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_phone_links ENABLE ROW LEVEL SECURITY;

-- Authenticated users manage only their own link
CREATE POLICY "own phone link"
  ON whatsapp_phone_links
  FOR ALL
  USING (auth.uid() = user_id);

-- Anon role (WhatsApp webhook server) can read phone lookups
-- Phone number acts as the access credential for the webhook
CREATE POLICY "webhook phone lookup"
  ON whatsapp_phone_links
  FOR SELECT
  TO anon
  USING (true);
