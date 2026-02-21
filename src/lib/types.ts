export interface Annotation {
  type: "zone" | "line" | "trend" | "point" | "arrow";
  // zone
  y1?: number;
  y2?: number;
  label?: string;
  color: string;
  bc?: string; // border color for zones
  // line
  y?: number;
  // trend
  x1?: number;
  x2?: number;
  // point
  x?: number;
  // arrow
}

export interface ChartBounds {
  x: number; // left edge of chart area (0-1 of full image)
  y: number; // top edge of chart area (0-1 of full image)
  w: number; // width of chart area (0-1 of full image)
  h: number; // height of chart area (0-1 of full image)
}

export interface AnalysisResult {
  pair: string;
  timeframe: string;
  trend: string;
  structure: string;
  bias: "Long" | "Short" | "Neutral";
  confidence: number;
  support: string;
  resistance: string;
  notes: string;
  rsi: number | null;
  ema_status: string;
  volume: string;
  entry_zone: string;
  take_profit: string;
  stop_loss: string;
  risk_reward: string;
  chart_bounds?: ChartBounds;
  annotations: Annotation[];
}

export type Stage = "upload" | "preview" | "analyzing" | "result";
export type ViewMode = "split" | "chart" | "analysis";
