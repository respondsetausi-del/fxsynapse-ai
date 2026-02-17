-- FXSynapse AI Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)

-- 1. Plans table
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  daily_scans INTEGER NOT NULL DEFAULT 3,
  features JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (id, name, price_cents, daily_scans, features) VALUES
  ('free', 'Free', 0, 3, '["3 scans per day", "Basic annotations", "Standard processing"]'),
  ('pro', 'Pro', 9900, 50, '["50 scans per day", "Full annotations", "Trade setups", "Credit top-ups", "Priority support"]'),
  ('premium', 'Premium', 24900, -1, '["Unlimited scans", "Advanced annotations", "Trade setups", "Credit top-ups", "Priority processing", "Priority support"]');

-- 2. Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  plan_id TEXT NOT NULL DEFAULT 'free' REFERENCES plans(id),
  credits_balance INTEGER NOT NULL DEFAULT 0,
  daily_scans_used INTEGER NOT NULL DEFAULT 0,
  daily_scans_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'cancelled', 'past_due')),
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Credit transactions
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'admin_grant', 'admin_revoke', 'scan_debit', 'subscription_grant', 'refund')),
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Scan history
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pair TEXT,
  timeframe TEXT,
  trend TEXT,
  bias TEXT,
  confidence INTEGER,
  analysis JSONB,
  credit_source TEXT NOT NULL DEFAULT 'daily' CHECK (credit_source IN ('daily', 'credits', 'unlimited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Payment records
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  yoco_checkout_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  type TEXT NOT NULL CHECK (type IN ('subscription', 'credits')),
  plan_id TEXT REFERENCES plans(id),
  credits_amount INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Plans: anyone can read
CREATE POLICY "Plans are viewable by everyone" ON plans FOR SELECT USING (true);

-- Profiles: users see own, admins see all
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Credit transactions: users see own, admins see all
CREATE POLICY "Users can view own transactions" ON credit_transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all transactions" ON credit_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can insert transactions" ON credit_transactions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Scans: users see own, admins see all
CREATE POLICY "Users can view own scans" ON scans FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own scans" ON scans FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all scans" ON scans FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Payments: users see own, admins see all
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can view all payments" ON payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 8. Indexes for performance
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_plan ON profiles(plan_id);
CREATE INDEX idx_scans_user ON scans(user_id, created_at DESC);
CREATE INDEX idx_credit_tx_user ON credit_transactions(user_id, created_at DESC);
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX idx_payments_status ON payments(status);

-- 9. Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
