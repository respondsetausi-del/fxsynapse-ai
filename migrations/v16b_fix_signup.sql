-- v16b_fix: Bulletproof signup — handle_new_user with conflict handling

-- Ensure credits_balance column exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0;

-- Give existing free users 1 credit
UPDATE profiles 
SET credits_balance = 1 
WHERE (subscription_status IS NULL OR subscription_status != 'active')
AND (credits_balance IS NULL OR credits_balance = 0);

-- Recreate handle_new_user with ON CONFLICT safety
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, credits_balance)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    1
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
