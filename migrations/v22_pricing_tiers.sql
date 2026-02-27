-- ═══════════════════════════════════════════════════
-- V22: NEW PRICING TIERS + DAILY USAGE TRACKING
-- ═══════════════════════════════════════════════════

-- 1. Add billing_period column if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'billing_period') THEN
    ALTER TABLE profiles ADD COLUMN billing_period TEXT DEFAULT 'monthly';
  END IF;
END $$;

-- 2. Add daily usage tracking columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'daily_scans_used') THEN
    ALTER TABLE profiles ADD COLUMN daily_scans_used INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'daily_scans_reset_at') THEN
    ALTER TABLE profiles ADD COLUMN daily_scans_reset_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'daily_chats_used') THEN
    ALTER TABLE profiles ADD COLUMN daily_chats_used INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'daily_chats_reset_at') THEN
    ALTER TABLE profiles ADD COLUMN daily_chats_reset_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- 3. Update plans table with new tier structure
-- (Insert or update plan records)
INSERT INTO plans (id, name, daily_scans, monthly_scans, price_cents, features)
VALUES
  ('free', 'Free', 1, 30, 0, '{"chart_scans_per_day": 1, "ai_chat_per_day": 3, "signal_access": "blurred", "smart_money": "locked", "voice": false}'),
  ('basic', 'Basic', 5, 150, 7900, '{"chart_scans_per_day": 5, "ai_chat_per_day": 15, "signal_access": "grade_bc", "smart_money": "basic", "voice": false}'),
  ('starter', 'Starter', 15, 450, 19900, '{"chart_scans_per_day": 15, "ai_chat_per_day": 30, "signal_access": "grade_bc_a_delayed", "smart_money": "basic", "voice": false}'),
  ('pro', 'Pro', 50, 1500, 34900, '{"chart_scans_per_day": 50, "ai_chat_per_day": 100, "signal_access": "all", "smart_money": "full", "voice": true}'),
  ('unlimited', 'Unlimited', -1, -1, 49900, '{"chart_scans_per_day": -1, "ai_chat_per_day": -1, "signal_access": "all_priority", "smart_money": "full", "voice": true}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  daily_scans = EXCLUDED.daily_scans,
  monthly_scans = EXCLUDED.monthly_scans,
  price_cents = EXCLUDED.price_cents,
  features = EXCLUDED.features;

-- 4. Migrate existing users on old plans
-- old "starter" (R79) → new "basic" (R79)
-- old "pro" (R149) → new "starter" (R199) — grandfathered at old price
-- old "premium" (R299) → new "pro" (R349) — grandfathered at old price
UPDATE profiles SET plan_id = 'basic' WHERE plan_id = 'starter' AND subscription_status = 'active';
UPDATE profiles SET plan_id = 'starter' WHERE plan_id = 'pro' AND subscription_status = 'active';
UPDATE profiles SET plan_id = 'pro' WHERE plan_id = 'premium' AND subscription_status = 'active';

-- 5. Function to reset daily usage (call via cron at midnight)
CREATE OR REPLACE FUNCTION reset_daily_usage() RETURNS void AS $$
BEGIN
  UPDATE profiles 
  SET daily_scans_used = 0, 
      daily_scans_reset_at = NOW(),
      daily_chats_used = 0,
      daily_chats_reset_at = NOW()
  WHERE daily_scans_used > 0 OR daily_chats_used > 0;
END;
$$ LANGUAGE plpgsql;
