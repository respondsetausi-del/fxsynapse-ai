/* ─── AI Signal Engine ───
 * Pulls live candle data → Runs technical indicators → Feeds to Claude →
 * Returns structured trade signals with smart money analysis.
 * 
 * Uses: /api/market/candles (TwelveData) + indicators.ts + Claude API
 * Cost: ~$0.01-0.03 per signal cycle via Claude
 */

import { SMA, EMA, RSI } from "@/lib/indicators";
import type { Candle } from "@/lib/indicators";

/* ─── Types ─── */
export interface Signal {
  id: string;
  symbol: string;
  displaySymbol: string;
  timeframe: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number; // 0-100
  grade: "A" | "B" | "C" | "D";
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  riskReward: string;
  trend: "Bullish" | "Bearish" | "Ranging";
  structure: string;
  smartMoney: {
    orderBlocks: { type: string; high: number; low: number; description: string }[];
    liquidityLevels: { price: number; type: string; description: string }[];
    fvgs: { type: string; high: number; low: number }[];
    supplyDemand: { type: string; high: number; low: number; strength: string }[];
  };
  confluences: string[];
  reasoning: string;
  indicators: {
    rsi: number | null;
    rsiSignal: string;
    ema20: number | null;
    ema50: number | null;
    sma200: number | null;
    emaCross: string;
    atr: number | null;
  };
  keyLevels: { price: number; type: string; strength: string }[];
  newsRisk: string;
  createdAt: string;
  expiresAt: string;
}

export interface SignalEngineResult {
  signals: Signal[];
  scannedPairs: number;
  signalsGenerated: number;
  scanDuration: number;
  errors: string[];
}

/* ─── Config ─── */
const SCAN_PAIRS = [
  { symbol: "OANDA:EUR_USD", display: "EUR/USD" },
  { symbol: "OANDA:GBP_USD", display: "GBP/USD" },
  { symbol: "OANDA:USD_JPY", display: "USD/JPY" },
  { symbol: "OANDA:AUD_USD", display: "AUD/USD" },
  { symbol: "OANDA:USD_CAD", display: "USD/CAD" },
  { symbol: "OANDA:NZD_USD", display: "NZD/USD" },
  { symbol: "OANDA:EUR_JPY", display: "EUR/JPY" },
  { symbol: "OANDA:GBP_JPY", display: "GBP/JPY" },
  { symbol: "OANDA:EUR_GBP", display: "EUR/GBP" },
  { symbol: "OANDA:USD_CHF", display: "USD/CHF" },
  { symbol: "OANDA:USD_ZAR", display: "USD/ZAR" },
  { symbol: "OANDA:GBP_AUD", display: "GBP/AUD" },
];

const SCAN_TIMEFRAMES = ["1h", "4h"] as const;

/* ─── ATR Calculation ─── */
function ATR(candles: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (candles.length < 2) return candles.map(() => null);

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }

  result.push(null); // first candle has no TR
  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += trs[j];
      result.push(sum / period);
    } else {
      const prev = result[result.length - 1];
      if (prev === null) { result.push(null); continue; }
      result.push((prev * (period - 1) + trs[i]) / period);
    }
  }
  return result;
}

/* ─── Fetch Candles ─── */
async function fetchCandles(baseUrl: string, symbol: string, resolution: string, count: number = 200): Promise<Candle[]> {
  try {
    const url = `${baseUrl}/api/market/candles?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&count=${count}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.candles || [];
  } catch {
    return [];
  }
}

/* ─── Run Indicators ─── */
function analyzeIndicators(candles: Candle[]) {
  if (candles.length < 50) return null;

  const closes = candles.map(c => c.close);
  const rsiValues = RSI(closes, 14);
  const ema20 = EMA(closes, 20);
  const ema50 = EMA(closes, 50);
  const sma200 = SMA(closes, 200);
  const atrValues = ATR(candles, 14);

  const last = candles.length - 1;
  const currentPrice = closes[last];
  const currentRsi = rsiValues[last];
  const currentEma20 = ema20[last];
  const currentEma50 = ema50[last];
  const currentSma200 = sma200[last];
  const currentAtr = atrValues[last];

  // EMA cross status
  let emaCross = "neutral";
  if (currentEma20 && currentEma50) {
    if (currentEma20 > currentEma50) emaCross = "bullish";
    else if (currentEma20 < currentEma50) emaCross = "bearish";
    // Check for recent crossover (within last 5 candles)
    for (let i = last - 5; i < last; i++) {
      if (i < 0) continue;
      const prev20 = ema20[i];
      const prev50 = ema50[i];
      if (prev20 && prev50 && currentEma20 && currentEma50) {
        if (prev20 < prev50 && currentEma20 > currentEma50) emaCross = "golden_cross";
        if (prev20 > prev50 && currentEma20 < currentEma50) emaCross = "death_cross";
      }
    }
  }

  // RSI signal
  let rsiSignal = "neutral";
  if (currentRsi !== null) {
    if (currentRsi > 70) rsiSignal = "overbought";
    else if (currentRsi < 30) rsiSignal = "oversold";
    else if (currentRsi > 60) rsiSignal = "bullish";
    else if (currentRsi < 40) rsiSignal = "bearish";
  }

  // Recent candles for pattern context
  const recentCandles = candles.slice(-20).map(c => ({
    o: +c.open.toFixed(5),
    h: +c.high.toFixed(5),
    l: +c.low.toFixed(5),
    c: +c.close.toFixed(5),
    v: c.volume,
  }));

  // Swing highs/lows for structure
  const swings: { price: number; type: "high" | "low"; index: number }[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high &&
        candles[i].high > candles[i - 2].high && candles[i].high > candles[i + 2].high) {
      swings.push({ price: candles[i].high, type: "high", index: i });
    }
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low &&
        candles[i].low < candles[i - 2].low && candles[i].low < candles[i + 2].low) {
      swings.push({ price: candles[i].low, type: "low", index: i });
    }
  }

  return {
    currentPrice,
    rsi: currentRsi,
    rsiSignal,
    ema20: currentEma20,
    ema50: currentEma50,
    sma200: currentSma200,
    emaCross,
    atr: currentAtr,
    recentCandles,
    swings: swings.slice(-10),
    high24h: Math.max(...candles.slice(-24).map(c => c.high)),
    low24h: Math.min(...candles.slice(-24).map(c => c.low)),
  };
}

/* ─── Claude Signal Generation ─── */
const SIGNAL_PROMPT = `You are FXSynapse Signal Engine — an institutional-grade AI that generates precise trade signals using Smart Money Concepts (SMC).

You will receive:
1. Symbol, timeframe, current price
2. Technical indicators (RSI, EMA20, EMA50, SMA200, ATR, EMA cross status)
3. Recent 20 candles (OHLCV)
4. Detected swing points

YOUR JOB: Analyze and generate a trade signal IF a valid setup exists. If no quality setup, return grade "D" with direction "NEUTRAL".

SMART MONEY ANALYSIS:
- Detect Order Blocks: last opposing candle before a strong impulse move
- Detect Liquidity: equal highs/lows where stops cluster, session highs/lows
- Detect Fair Value Gaps: 3-candle imbalances
- Detect Market Structure: HH/HL (bullish), LH/LL (bearish), BOS, CHoCH
- Identify Supply/Demand zones from consolidation before impulse

SIGNAL RULES:
- Entry must be at or near current price (within 1 ATR)
- SL must be beyond a protective structure level (order block, demand/supply zone edge)
- TP1 at nearest key level, TP2 at next level
- Minimum R:R of 1:1.5 for grade C, 1:2 for grade B, 1:2.5+ for grade A
- Grade D = no trade, wait

CONFLUENCE SCORING (+1 each):
1. Trend alignment (price above/below EMA20+50)
2. Market structure (BOS/CHoCH confirmed)
3. Order block or demand/supply zone
4. RSI confirmation (not divergent)
5. FVG or liquidity target
6. Key level reaction
Grade: A(5-6), B(3-4), C(2), D(0-1)

Return ONLY valid JSON:
{
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": 0-100,
  "grade": "A" | "B" | "C" | "D",
  "entry_price": number,
  "stop_loss": number,
  "take_profit_1": number,
  "take_profit_2": number,
  "risk_reward": "1:2.3",
  "trend": "Bullish" | "Bearish" | "Ranging",
  "structure": "HH/HL with BOS at 1.0850",
  "order_blocks": [{"type": "bullish_ob", "high": 1.0830, "low": 1.0825, "description": "Last bearish candle before impulse"}],
  "liquidity_levels": [{"price": 1.0870, "type": "buy_side", "description": "Equal highs — stops above"}],
  "fvgs": [{"type": "bullish", "high": 1.0845, "low": 1.0840}],
  "supply_demand": [{"type": "demand", "high": 1.0835, "low": 1.0828, "strength": "strong"}],
  "confluences": ["Bullish BOS confirmed", "Demand zone retest", "RSI bouncing from 40"],
  "key_levels": [{"price": 1.0870, "type": "resistance", "strength": "strong"}, {"price": 1.0820, "type": "support", "strength": "moderate"}],
  "reasoning": "2-3 sentence explanation of the setup",
  "news_risk": "Low — no high-impact USD events in next 4h"
}`;

async function generateSignalWithClaude(
  symbol: string,
  displaySymbol: string,
  timeframe: string,
  indicators: ReturnType<typeof analyzeIndicators>,
  apiKey: string
): Promise<Signal | null> {
  if (!indicators) return null;

  const userMessage = `ANALYZE FOR SIGNAL:
Symbol: ${displaySymbol}
Timeframe: ${timeframe}
Current Price: ${indicators.currentPrice}

INDICATORS:
- RSI(14): ${indicators.rsi?.toFixed(1)} (${indicators.rsiSignal})
- EMA20: ${indicators.ema20?.toFixed(5)}
- EMA50: ${indicators.ema50?.toFixed(5)}
- SMA200: ${indicators.sma200?.toFixed(5) || "N/A"}
- EMA Cross: ${indicators.emaCross}
- ATR(14): ${indicators.atr?.toFixed(5)}
- 24h High: ${indicators.high24h.toFixed(5)}
- 24h Low: ${indicators.low24h.toFixed(5)}

RECENT 20 CANDLES (oldest→newest):
${JSON.stringify(indicators.recentCandles)}

SWING POINTS (last 10):
${JSON.stringify(indicators.swings.map(s => ({ price: s.price.toFixed(5), type: s.type })))}

Generate signal. Return ONLY JSON.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: SIGNAL_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error(`[SignalEngine] Claude API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON from response (handle possible markdown wrapping)
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.direction || !parsed.grade) return null;

    const now = new Date();
    const expiry = new Date(now.getTime() + (timeframe === "4h" ? 4 * 60 * 60 * 1000 : 60 * 60 * 1000));

    return {
      id: `SIG-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      symbol,
      displaySymbol,
      timeframe,
      direction: parsed.direction,
      confidence: parsed.confidence || 0,
      grade: parsed.grade,
      entryPrice: parsed.entry_price || indicators.currentPrice,
      stopLoss: parsed.stop_loss || 0,
      takeProfit1: parsed.take_profit_1 || 0,
      takeProfit2: parsed.take_profit_2 || undefined,
      riskReward: parsed.risk_reward || "—",
      trend: parsed.trend || "Ranging",
      structure: parsed.structure || "",
      smartMoney: {
        orderBlocks: parsed.order_blocks || [],
        liquidityLevels: parsed.liquidity_levels || [],
        fvgs: parsed.fvgs || [],
        supplyDemand: parsed.supply_demand || [],
      },
      confluences: parsed.confluences || [],
      reasoning: parsed.reasoning || "",
      indicators: {
        rsi: indicators.rsi,
        rsiSignal: indicators.rsiSignal,
        ema20: indicators.ema20,
        ema50: indicators.ema50,
        sma200: indicators.sma200,
        emaCross: indicators.emaCross,
        atr: indicators.atr,
      },
      keyLevels: parsed.key_levels || [],
      newsRisk: parsed.news_risk || "Unknown",
      createdAt: now.toISOString(),
      expiresAt: expiry.toISOString(),
    };
  } catch (err: any) {
    console.error(`[SignalEngine] Error for ${displaySymbol}: ${err.message}`);
    return null;
  }
}

/* ─── MAIN: Run Full Scan ─── */
export async function runSignalScan(
  baseUrl: string,
  options?: {
    pairs?: typeof SCAN_PAIRS;
    timeframes?: readonly string[];
    apiKey?: string;
  }
): Promise<SignalEngineResult> {
  const startTime = Date.now();
  const pairs = options?.pairs || SCAN_PAIRS;
  const timeframes = options?.timeframes || SCAN_TIMEFRAMES;
  const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
  const errors: string[] = [];
  const signals: Signal[] = [];

  if (!apiKey) {
    return { signals: [], scannedPairs: 0, signalsGenerated: 0, scanDuration: 0, errors: ["No ANTHROPIC_API_KEY configured"] };
  }

  for (const pair of pairs) {
    for (const tf of timeframes) {
      try {
        // 1. Fetch candles
        const candles = await fetchCandles(baseUrl, pair.symbol, tf, 200);
        if (candles.length < 50) {
          errors.push(`${pair.display} ${tf}: Insufficient candles (${candles.length})`);
          continue;
        }

        // 2. Run indicators
        const indicators = analyzeIndicators(candles);
        if (!indicators) {
          errors.push(`${pair.display} ${tf}: Indicator analysis failed`);
          continue;
        }

        // 3. Generate signal via Claude
        const signal = await generateSignalWithClaude(pair.symbol, pair.display, tf, indicators, apiKey);
        if (signal && signal.grade !== "D" && signal.direction !== "NEUTRAL") {
          signals.push(signal);
        }

        // Rate limiting — small delay between Claude calls
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        errors.push(`${pair.display} ${tf}: ${err.message}`);
      }
    }
  }

  // Sort by confidence (highest first)
  signals.sort((a, b) => b.confidence - a.confidence);

  return {
    signals,
    scannedPairs: pairs.length * timeframes.length,
    signalsGenerated: signals.length,
    scanDuration: Date.now() - startTime,
    errors,
  };
}

/* ─── QUICK SCAN: Single pair ─── */
export async function scanSinglePair(
  baseUrl: string,
  symbol: string,
  displaySymbol: string,
  timeframe: string,
  apiKey?: string
): Promise<Signal | null> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const candles = await fetchCandles(baseUrl, symbol, timeframe, 200);
  if (candles.length < 50) return null;

  const indicators = analyzeIndicators(candles);
  if (!indicators) return null;

  return generateSignalWithClaude(symbol, displaySymbol, timeframe, indicators, key);
}
