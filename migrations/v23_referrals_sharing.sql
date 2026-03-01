-- ═══════════════════════════════════════════════════════════
-- v23: REFERRAL SYSTEM + SHAREABLE SCANS + DAILY RESET
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ═══ 1. REFERRAL CODE ON PROFILES ═══
-- Every user gets a unique referral code for sharing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_reward_total INTEGER NOT NULL DEFAULT 0;

-- Generate referral codes for existing users who don't have one
UPDATE profiles 
SET referral_code = UPPER(SUBSTRING(MD5(id::text || created_at::text) FROM 1 FOR 8))
WHERE referral_code IS NULL;

-- ═══ 2. REFERRAL TRACKING TABLE ═══
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  credits_granted INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referrer_id, referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_id);

-- ═══ 3. SHAREABLE SCAN FIELDS ═══
-- share_id is a short URL-friendly ID for public scan pages
ALTER TABLE scans ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE;
-- Store the chart image URL so public page can show it
ALTER TABLE scans ADD COLUMN IF NOT EXISTS chart_image_url TEXT;

-- Generate share_ids for existing scans
UPDATE scans
SET share_id = LOWER(SUBSTRING(MD5(id::text || created_at::text) FROM 1 FOR 10))
WHERE share_id IS NULL;

-- ═══ 4. UPDATE handle_new_user FOR REFERRALS + DAILY RESET ═══
-- Now grants 1 credit AND generates referral code on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, credits_balance, referral_code, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    1,
    UPPER(SUBSTRING(MD5(NEW.id::text || NOW()::text) FROM 1 FOR 8)),
    COALESCE(NEW.raw_user_meta_data->>'referred_by', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 5. RLS FOR REFERRAL_REWARDS ═══
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral rewards" ON referral_rewards 
  FOR SELECT USING (auth.uid() = referrer_id);

CREATE POLICY "Admins can view all referral rewards" ON referral_rewards 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ═══ 6. MAKE SCANS READABLE BY SHARE_ID (for public pages) ═══
-- Allow anyone to read a scan by share_id (the API handles blurring)
CREATE POLICY "Anyone can view scans by share_id" ON scans 
  FOR SELECT USING (share_id IS NOT NULL);

-- ═══ 7. CREATE STORAGE BUCKET FOR CHART IMAGES ═══
-- Run this separately if it fails (bucket may already exist):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('scans', 'scans', true);
INSERT INTO storage.buckets (id, name, public) 
VALUES ('scans', 'scans', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to chart images
CREATE POLICY "Public read chart images" ON storage.objects 
  FOR SELECT USING (bucket_id = 'scans');

-- Allow authenticated users to upload chart images
CREATE POLICY "Users can upload chart images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'scans' 
    AND auth.role() = 'authenticated'
  );
