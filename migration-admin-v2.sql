-- FXSynapse Admin V2 Migration
-- Run in Supabase SQL Editor

-- 1. Add is_blocked to profiles (controls login access)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- 2. Email logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'delivered', 'bounced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all email logs" ON email_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can insert email logs" ON email_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_id, created_at DESC);
CREATE INDEX idx_profiles_blocked ON profiles(is_blocked);
CREATE INDEX idx_profiles_last_seen ON profiles(last_seen_at);
CREATE INDEX idx_profiles_created ON profiles(created_at);
CREATE INDEX idx_payments_created ON payments(created_at);
CREATE INDEX idx_scans_created ON scans(created_at);
