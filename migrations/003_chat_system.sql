-- Chat system tables
CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id text UNIQUE NOT NULL,
  name text,
  email text,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  status text DEFAULT 'waiting' CHECK (status IN ('waiting', 'answered', 'closed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id text NOT NULL,
  visitor_id text NOT NULL,
  sender text NOT NULL CHECK (sender IN ('visitor', 'admin')),
  message text NOT NULL,
  name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_visitor ON chat_messages(visitor_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_status ON chat_threads(status);

-- Ensure profiles has subscription columns (safe - won't fail if exists)
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'none';
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_cycle_start timestamptz;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_scans_used integer DEFAULT 0;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_scans_reset_at timestamptz;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Disable RLS on chat tables for API access
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on chat_threads" ON chat_threads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on chat_messages" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
