-- v16b: Free trial — 1 free scan for new signups

-- Give existing users without an active plan 1 free credit (if they have 0)
UPDATE profiles 
SET credits_balance = 1 
WHERE (subscription_status IS NULL OR subscription_status != 'active')
AND (credits_balance IS NULL OR credits_balance = 0);

-- Update the handle_new_user function to grant 1 free credit on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, credits_balance)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    1  -- 1 free scan credit
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
