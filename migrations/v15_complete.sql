-- ============================================
-- FXSynapse AI v15 — COMPLETE MIGRATION
-- Run this in Supabase SQL Editor (one time)
-- Handles: subscription columns, plans, chat system
-- ============================================

-- STEP 1: Add subscription columns to profiles (safe, won't fail if exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'none';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_cycle_start timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_scans_used integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_scans_reset_at timestamptz;

-- STEP 2: Add monthly_scans to plans table
ALTER TABLE plans ADD COLUMN IF NOT EXISTS monthly_scans integer DEFAULT 0;

-- STEP 3: Create "none" plan first (FK reference for former free users)
INSERT INTO plans (id, name, daily_scans, price_cents, monthly_scans)
VALUES ('none', 'No Plan', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- STEP 4: Move all free users to "none" BEFORE deleting free plan
UPDATE profiles SET plan_id = 'none', subscription_status = 'none'
WHERE plan_id = 'free' OR plan_id IS NULL;

-- STEP 5: Now safe to remove free plan
DELETE FROM plans WHERE id = 'free';

-- STEP 6: Upsert paid plans
INSERT INTO plans (id, name, daily_scans, price_cents, monthly_scans)
VALUES
  ('starter', 'Starter', 0, 4900, 15),
  ('pro', 'Pro', 0, 9900, 50),
  ('premium', 'Premium', -1, 19900, -1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  daily_scans = EXCLUDED.daily_scans,
  monthly_scans = EXCLUDED.monthly_scans;

-- STEP 7: Ensure payments table exists with correct columns
CREATE TABLE IF NOT EXISTS payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  yoco_checkout_id text,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'ZAR',
  type text NOT NULL,
  plan_id text,
  credits_amount integer,
  status text DEFAULT 'pending',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- STEP 8: Chat system tables
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

-- STEP 9: Disable RLS on tables that need service role access
-- (service role already bypasses RLS, but let's be safe)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access payments" ON payments;
CREATE POLICY "Service role full access payments" ON payments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access chat_threads" ON chat_threads;
CREATE POLICY "Service role full access chat_threads" ON chat_threads FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access chat_messages" ON chat_messages;
CREATE POLICY "Service role full access chat_messages" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

-- STEP 10: Verify everything
SELECT '=== PLANS ===' as info;
SELECT id, name, monthly_scans, price_cents FROM plans ORDER BY price_cents;
SELECT '=== USER DISTRIBUTION ===' as info;
SELECT plan_id, subscription_status, COUNT(*) FROM profiles GROUP BY plan_id, subscription_status;
SELECT '=== TABLES ===' as info;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('payments', 'chat_threads', 'chat_messages');
