-- ============================================
-- FXSynapse AI — PAID-ONLY MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add new columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS monthly_scans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_scans_reset_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ;

-- 2. Update plans table — remove free, add starter, update pro/premium
-- First delete existing free plan
DELETE FROM plans WHERE id = 'free';

-- Upsert the 3 new plans
INSERT INTO plans (id, name, daily_scans, price_cents, monthly_scans)
VALUES
  ('starter', 'Starter', 0, 4900, 15),
  ('pro', 'Pro', 0, 9900, 50),
  ('premium', 'Premium', -1, 19900, -1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  daily_scans = EXCLUDED.daily_scans;

-- 3. Add monthly_scans column to plans if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'monthly_scans'
  ) THEN
    ALTER TABLE plans ADD COLUMN monthly_scans INTEGER DEFAULT 0;
    UPDATE plans SET monthly_scans = 15 WHERE id = 'starter';
    UPDATE plans SET monthly_scans = 50 WHERE id = 'pro';
    UPDATE plans SET monthly_scans = -1 WHERE id = 'premium';
  ELSE
    UPDATE plans SET monthly_scans = 15 WHERE id = 'starter';
    UPDATE plans SET monthly_scans = 50 WHERE id = 'pro';
    UPDATE plans SET monthly_scans = -1 WHERE id = 'premium';
  END IF;
END $$;

-- 4. Migrate existing free users to "none" plan (no access until they pay)
-- NOTE: This will lock out existing free users until they choose a plan!
UPDATE profiles SET plan_id = 'none', subscription_status = 'none'
WHERE plan_id = 'free';

-- 5. Create a "none" plan row for FK reference
INSERT INTO plans (id, name, daily_scans, price_cents, monthly_scans)
VALUES ('none', 'No Plan', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 6. Verify
SELECT id, name, monthly_scans, price_cents FROM plans ORDER BY price_cents;
SELECT plan_id, COUNT(*) FROM profiles GROUP BY plan_id;
