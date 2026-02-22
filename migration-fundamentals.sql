-- ============================================
-- AI FUNDAMENTALS — Migration
-- ============================================

-- Cached economic calendar events
CREATE TABLE IF NOT EXISTS economic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  event_time TEXT, -- e.g. "13:30"
  country TEXT NOT NULL, -- "USD", "EUR", "GBP", etc.
  event_name TEXT NOT NULL,
  impact TEXT NOT NULL DEFAULT 'medium', -- 'high', 'medium', 'low'
  previous TEXT,
  forecast TEXT,
  actual TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_econ_events_date ON economic_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_econ_events_country ON economic_events(country);

-- AI Market Briefs (2x daily reports)
CREATE TABLE IF NOT EXISTS ai_market_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session TEXT NOT NULL, -- 'morning' or 'evening'
  report_date DATE NOT NULL,
  currencies JSONB NOT NULL DEFAULT '[]',
  -- Each currency: { code, name, direction, probability, reasoning, flag }
  pair_implications JSONB NOT NULL DEFAULT '[]',
  -- Each: { pair, direction, arrow, reasoning }
  summary TEXT, -- Overall market summary
  events_analyzed JSONB DEFAULT '[]', -- Which events were fed to AI
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_briefs_date ON ai_market_briefs(report_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_briefs_unique ON ai_market_briefs(report_date, session);

-- RLS
ALTER TABLE economic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_market_briefs ENABLE ROW LEVEL SECURITY;

-- Everyone can read events
CREATE POLICY "Anyone can read events"
  ON economic_events FOR SELECT
  USING (true);

-- Anyone can read briefs (API handles plan gating)
CREATE POLICY "Anyone can read briefs"
  ON ai_market_briefs FOR SELECT
  USING (true);

-- Service role inserts
CREATE POLICY "Service can insert events"
  ON economic_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update events"
  ON economic_events FOR UPDATE
  USING (true);

CREATE POLICY "Service can insert briefs"
  ON ai_market_briefs FOR INSERT
  WITH CHECK (true);
