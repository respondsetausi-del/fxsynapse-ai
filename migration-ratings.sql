-- Scan Ratings Table
CREATE TABLE IF NOT EXISTS scan_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for analytics
CREATE INDEX IF NOT EXISTS idx_scan_ratings_user ON scan_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_ratings_created ON scan_ratings(created_at DESC);

-- RLS
ALTER TABLE scan_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own ratings"
  ON scan_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own ratings"
  ON scan_ratings FOR SELECT
  USING (auth.uid() = user_id);

-- Admin can view all
CREATE POLICY "Admins can view all ratings"
  ON scan_ratings FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
