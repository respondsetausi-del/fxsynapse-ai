-- v23: Enhanced Analytics & Payment Recovery
-- Run in Supabase SQL Editor

-- Track which payment plans users VIEW and CLICK
CREATE TABLE IF NOT EXISTS plan_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL, -- 'basic', 'starter', 'pro', 'unlimited'
  event TEXT NOT NULL, -- 'view', 'click', 'checkout_start', 'checkout_complete', 'checkout_abandon'
  source TEXT, -- 'paywall', 'pricing_page', 'upgrade_banner', 'affiliate_banner'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_analytics_plan ON plan_analytics(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_analytics_event ON plan_analytics(event);
CREATE INDEX IF NOT EXISTS idx_plan_analytics_created ON plan_analytics(created_at DESC);

ALTER TABLE plan_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on plan_analytics" ON plan_analytics FOR ALL USING (true) WITH CHECK (true);

-- Track user sessions & page views for engagement
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  page TEXT NOT NULL, -- '/dashboard', '/pricing', '/affiliate'
  action TEXT, -- 'view', 'click_tab', 'click_scan', 'click_upgrade'
  element TEXT, -- 'scanner_tab', 'signals_tab', 'upgrade_btn', etc.
  duration_ms INTEGER, -- time on page
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_page ON user_sessions(page);
CREATE INDEX IF NOT EXISTS idx_user_sessions_created ON user_sessions(created_at DESC);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on user_sessions" ON user_sessions FOR ALL USING (true) WITH CHECK (true);

-- Payment recovery tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recovery_email_sent_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER DEFAULT 0;

-- Affiliate bulk payout tracking
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  method TEXT DEFAULT 'credit', -- 'credit', 'ewallet', 'bank'
  status TEXT DEFAULT 'completed', -- 'pending', 'completed', 'failed'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on affiliate_payouts" ON affiliate_payouts FOR ALL USING (true) WITH CHECK (true);
