-- ═══════════════════════════════════════════════════
-- AI SIGNALS TABLE — Stores generated trade signals
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_signals (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  display_symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL', 'NEUTRAL')),
  confidence INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D')),
  
  -- Trade levels
  entry_price DECIMAL NOT NULL,
  stop_loss DECIMAL NOT NULL,
  take_profit_1 DECIMAL NOT NULL,
  take_profit_2 DECIMAL,
  risk_reward TEXT,
  
  -- Analysis
  trend TEXT,
  structure TEXT,
  smart_money JSONB DEFAULT '{}',
  confluences TEXT[] DEFAULT '{}',
  reasoning TEXT,
  indicators JSONB DEFAULT '{}',
  key_levels JSONB DEFAULT '[]',
  news_risk TEXT,
  
  -- Tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'hit_tp1', 'hit_tp2', 'hit_sl', 'cancelled')),
  hit_price DECIMAL,
  pips_result DECIMAL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  
  -- Visibility
  is_public BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_signals_status ON ai_signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_created ON ai_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON ai_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_grade ON ai_signals(grade);
CREATE INDEX IF NOT EXISTS idx_signals_public ON ai_signals(is_public) WHERE is_public = true;

-- Auto-expire signals past their expiry
CREATE OR REPLACE FUNCTION expire_old_signals() RETURNS void AS $$
BEGIN
  UPDATE ai_signals 
  SET status = 'expired' 
  WHERE status = 'active' 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Signal performance view
CREATE OR REPLACE VIEW signal_performance AS
SELECT
  display_symbol,
  timeframe,
  grade,
  COUNT(*) as total_signals,
  COUNT(*) FILTER (WHERE status IN ('hit_tp1', 'hit_tp2')) as wins,
  COUNT(*) FILTER (WHERE status = 'hit_sl') as losses,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('hit_tp1', 'hit_tp2'))::decimal / 
    NULLIF(COUNT(*) FILTER (WHERE status IN ('hit_tp1', 'hit_tp2', 'hit_sl')), 0) * 100, 1
  ) as win_rate,
  ROUND(AVG(pips_result) FILTER (WHERE pips_result IS NOT NULL), 1) as avg_pips
FROM ai_signals
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY display_symbol, timeframe, grade
ORDER BY win_rate DESC NULLS LAST;
