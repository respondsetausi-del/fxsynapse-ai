export interface Annotation {
  type: "zone" | "line" | "trend" | "point" | "arrow" | "fib" | "pattern" | "bos" | "choch" | "fvg" | "liquidity";
  // Price-based (from AI) — converted to y coords in route.ts
  price?: string;
  price_high?: string;
  price_low?: string;
  entry_price?: string;
  tp_price?: string;
  y1_price?: string;
  y2_price?: string;
  swing_high_price?: string;
  swing_low_price?: string;
  // Pixel-relative coords (0-1, computed from prices)
  y?: number;
  y1?: number;
  y2?: number;
  x?: number;
  x1?: number;
  x2?: number;
  y_0?: number;
  y_100?: number;
  // Styling
  label?: string;
  color: string;
  bc?: string;
  style?: "solid" | "dashed" | "dotted";
}

export interface ChartBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PatternInfo {
  name: string;
  location?: string;
  price?: string;
  x_position?: number;
  significance: "high" | "medium" | "low";
}

export interface LevelInfo {
  price: string;
  type: "support" | "resistance";
  strength?: "strong" | "moderate" | "weak";
  touches?: number;
}

export interface ZoneInfo {
  type: "supply" | "demand";
  high: string;
  low: string;
  strength?: "strong" | "moderate" | "weak";
}

export interface OrderBlock {
  type: "bullish_ob" | "bearish_ob";
  high: string;
  low: string;
  location?: string;
}

export interface FVG {
  type: "bullish" | "bearish";
  high: string;
  low: string;
}

export interface LiquidityLevel {
  price: string;
  type: "buy_side" | "sell_side";
  description?: string;
}

export interface AnalysisResult {
  pair: string;
  timeframe: string;
  trend: string;
  structure: string;
  bias: "Long" | "Short" | "Neutral";
  confidence: number;
  price_high: string;
  price_low: string;
  current_price: string;
  support: string;
  resistance: string;
  all_levels?: LevelInfo[];
  zones?: ZoneInfo[];
  order_blocks?: OrderBlock[];
  fvgs?: FVG[];
  liquidity_levels?: LiquidityLevel[];
  patterns?: PatternInfo[];
  notes: string;
  rsi: number | null;
  rsi_signal?: string;
  ema_status: string;
  volume: string;
  entry_price?: string;
  entry_zone?: string;
  take_profit: string;
  stop_loss: string;
  risk_reward: string;
  confluences?: string[];
  setup_grade?: string;
  current_price_y?: number;
  chart_bounds?: ChartBounds;
  annotations: Annotation[];
}

export type Stage = "upload" | "preview" | "analyzing" | "result";
export type ViewMode = "split" | "chart" | "analysis";
