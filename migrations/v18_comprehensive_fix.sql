-- ═══════════════════════════════════════════════════════════
-- v18: COMPREHENSIVE FIX — Plans, Credits, Tracking
-- Run this ONCE in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ═══ 1. ADD STARTER PLAN (missing from DB) ═══
INSERT INTO plans (id, name, price_cents, daily_scans, features)
VALUES ('starter', 'Starter', 4900, 15, 
  '["15 scans/month", "Full chart annotations", "Trade setups (Entry/TP/SL)", "Risk:Reward ratio", "Scan history"]'
)
ON CONFLICT (id) DO UPDATE SET
  price_cents = 4900,
  daily_scans = 15,
  features = '["15 scans/month", "Full chart annotations", "Trade setups (Entry/TP/SL)", "Risk:Reward ratio", "Scan history"]';

-- ═══ 2. ADD monthly_scans COLUMN TO PLANS ═══
ALTER TABLE plans ADD COLUMN IF NOT EXISTS monthly_scans INTEGER;

UPDATE plans SET monthly_scans = 1 WHERE id = 'free';
UPDATE plans SET monthly_scans = 15 WHERE id = 'starter';
UPDATE plans SET monthly_scans = 50 WHERE id = 'pro';
UPDATE plans SET monthly_scans = -1 WHERE id = 'premium';

-- ═══ 3. ENSURE PROFILE COLUMNS EXIST ═══
-- monthly tracking columns (may already exist from earlier migrations)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_scans_used INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_scans_reset_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Update subscription_status constraint to include 'expired'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_status_check 
  CHECK (subscription_status IN ('none', 'active', 'cancelled', 'past_due', 'expired'));

-- ═══ 4. FIX handle_new_user — GRANT 1 FREE CREDIT ═══
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, credits_balance)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    1  -- 1 free scan credit on signup
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 5. GRANT 1 FREE CREDIT TO EXISTING UNPAID USERS WITH 0 CREDITS ═══
UPDATE profiles 
SET credits_balance = 1 
WHERE (subscription_status IS NULL OR subscription_status = 'none')
AND (credits_balance IS NULL OR credits_balance = 0)
AND plan_id IN ('free', 'none');

-- ═══ 6. INDEXES FOR PERFORMANCE ═══
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_profiles_plan_status ON profiles(plan_id, subscription_status);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at);
CREATE INDEX IF NOT EXISTS idx_scans_user_created ON scans(user_id, created_at);

-- ═══ VERIFICATION ═══
-- Run these after to confirm:
-- SELECT id, name, price_cents, daily_scans, monthly_scans FROM plans ORDER BY price_cents;
-- SELECT count(*) as unpaid_with_credits FROM profiles WHERE subscription_status = 'none' AND credits_balance > 0;
