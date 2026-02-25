-- === v20: AFFILIATE CHAT SYSTEM ===

CREATE TABLE IF NOT EXISTS affiliate_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('affiliate', 'admin')),
  sender_id UUID NOT NULL REFERENCES profiles(id),
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_messages_affiliate ON affiliate_messages(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_messages_created ON affiliate_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_messages_unread ON affiliate_messages(affiliate_id, read_at) WHERE read_at IS NULL;

ALTER TABLE affiliate_messages ENABLE ROW LEVEL SECURITY;

-- Affiliates can view their own messages
CREATE POLICY "Affiliates can view own messages" ON affiliate_messages
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

-- Admins can view all messages
CREATE POLICY "Admins can view all messages" ON affiliate_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
