-- ═══════════════════════════════════════════════════════════
-- v19: AFFILIATE PROGRAM
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ═══ 1. AFFILIATES TABLE ═══
CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  ref_code TEXT NOT NULL UNIQUE,
  commission_rate NUMERIC(4,2) NOT NULL DEFAULT 0.20,
  total_earned_cents INTEGER NOT NULL DEFAULT 0,
  total_paid_cents INTEGER NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_signups INTEGER NOT NULL DEFAULT 0,
  total_conversions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  payout_method TEXT DEFAULT 'eft',
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══ 2. REFERRALS TABLE ═══
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  ref_code_used TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'converted', 'churned')),
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_payment_at TIMESTAMPTZ
);

-- ═══ 3. AFFILIATE EARNINGS TABLE ═══
CREATE TABLE IF NOT EXISTS affiliate_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id),
  amount_cents INTEGER NOT NULL,
  commission_rate NUMERIC(4,2) NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══ 4. AFFILIATE PAYOUTS TABLE ═══
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'eft',
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  admin_notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- ═══ 5. ADD referred_by TO PROFILES ═══
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- ═══ 6. INDEXES ═══
CREATE INDEX IF NOT EXISTS idx_affiliates_user ON affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_ref_code ON affiliates(ref_code);
CREATE INDEX IF NOT EXISTS idx_referrals_affiliate ON referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_affiliate ON affiliate_earnings(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_status ON affiliate_earnings(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate ON affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by);

-- ═══ 7. RLS POLICIES ═══
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;

-- Affiliates: users see own, admins see all
CREATE POLICY "Users can view own affiliate" ON affiliates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all affiliates" ON affiliates FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Referrals: affiliates see own referrals
CREATE POLICY "Affiliates can view own referrals" ON referrals FOR SELECT USING (
  affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can view all referrals" ON referrals FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Earnings: affiliates see own
CREATE POLICY "Affiliates can view own earnings" ON affiliate_earnings FOR SELECT USING (
  affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can view all earnings" ON affiliate_earnings FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Payouts: affiliates see own
CREATE POLICY "Affiliates can view own payouts" ON affiliate_payouts FOR SELECT USING (
  affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can view all payouts" ON affiliate_payouts FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
