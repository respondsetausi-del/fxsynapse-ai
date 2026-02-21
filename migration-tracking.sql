-- Visitor Event Tracking
CREATE TABLE IF NOT EXISTS visitor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'signup_click', 'broker_click', 'broker_popup_shown', 'broker_popup_dismissed', 'landing_visit'
  source TEXT, -- 'popup', 'header', 'post_scan', 'landing_banner', 'landing_nav'
  visitor_id TEXT, -- anonymous fingerprint (stored in localStorage)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_events_type ON visitor_events(event_type);
CREATE INDEX IF NOT EXISTS idx_visitor_events_created ON visitor_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor ON visitor_events(visitor_id);

-- No RLS — service role only (API writes, admin reads)
ALTER TABLE visitor_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all events"
  ON visitor_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow inserts from service role (API route handles auth)
CREATE POLICY "Service role can insert events"
  ON visitor_events FOR INSERT
  WITH CHECK (true);
