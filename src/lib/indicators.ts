// Technical Indicator Library — Pure math, no API calls
// All calculations happen client-side for zero cost

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  name: string;
  values: (number | null)[];
  signal?: "buy" | "sell" | "neutral";
  color: string;
}

// ============================================================
// MOVING AVERAGES
// ============================================================

export function SMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      result.push(sum / period);
    }
  }
  return result;
}

export function EMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += closes[j];
      result.push(sum / period);
    } else {
      const prev = result[i - 1];
      if (prev === null) { result.push(null); continue; }
      result.push(closes[i] * k + prev * (1 - k));
    }
  }
  return result;
}

// ============================================================
// RSI — Relative Strength Index (Wilder's smoothing)
// ============================================================

export function RSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (closes.length < period + 1) return closes.map(() => null);

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // First value: simple average
  result.push(null); // index 0
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 1; i < closes.length; i++) {
    if (i < period) {
      result.push(null);
    } else if (i === period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    } else {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }
  return result;
}

// ============================================================
// MACD — Moving Average Convergence Divergence
// ============================================================

export interface MACDResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export function MACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEMA = EMA(closes, fastPeriod);
  const slowEMA = EMA(closes, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(fastEMA[i]! - slowEMA[i]!);
    }
  }

  // Signal line = EMA of MACD line
  const validMacd = macdLine.filter(v => v !== null) as number[];
  const signalEMA = EMA(validMacd, signalPeriod);

  const signalLine: (number | null)[] = [];
  const histogram: (number | null)[] = [];
  let validIdx = 0;

  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] === null) {
      signalLine.push(null);
      histogram.push(null);
    } else {
      const sig = signalEMA[validIdx] ?? null;
      signalLine.push(sig);
      histogram.push(sig !== null ? macdLine[i]! - sig : null);
      validIdx++;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// ============================================================
// BOLLINGER BANDS
// ============================================================

export interface BollingerResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  bandwidth: (number | null)[];
}

export function BollingerBands(
  closes: number[],
  period: number = 20,
  stdDev: number = 2
): BollingerResult {
  const middle = SMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  const bandwidth: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null || i < period - 1) {
      upper.push(null);
      lower.push(null);
      bandwidth.push(null);
    } else {
      let sumSqDiff = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sumSqDiff += (closes[j] - middle[i]!) ** 2;
      }
      const sd = Math.sqrt(sumSqDiff / period);
      upper.push(middle[i]! + stdDev * sd);
      lower.push(middle[i]! - stdDev * sd);
      bandwidth.push(middle[i]! > 0 ? ((upper[i]! - lower[i]!) / middle[i]!) * 100 : null);
    }
  }

  return { upper, middle, lower, bandwidth };
}

// ============================================================
// ATR — Average True Range
// ============================================================

export function ATR(candles: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [null];

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }

  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += trueRanges[j];
      result.push(sum / period);
    } else {
      const prev = result[result.length - 1];
      if (prev === null) { result.push(null); continue; }
      result.push((prev * (period - 1) + trueRanges[i]) / period);
    }
  }
  return result;
}

// ============================================================
// STOCHASTIC OSCILLATOR
// ============================================================

export interface StochasticResult {
  k: (number | null)[];
  d: (number | null)[];
}

export function Stochastic(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3
): StochasticResult {
  const k: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      k.push(null);
    } else {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) {
        if (candles[j].high > highestHigh) highestHigh = candles[j].high;
        if (candles[j].low < lowestLow) lowestLow = candles[j].low;
      }
      const range = highestHigh - lowestLow;
      k.push(range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100);
    }
  }

  // %D = SMA of %K
  const validK = k.filter(v => v !== null) as number[];
  const dSMA = SMA(validK, dPeriod);
  const d: (number | null)[] = [];
  let vIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (k[i] === null) {
      d.push(null);
    } else {
      d.push(dSMA[vIdx] ?? null);
      vIdx++;
    }
  }

  return { k, d };
}

// ============================================================
// SIGNAL DETECTION ENGINE
// ============================================================

export interface SignalCondition {
  id: string;
  name: string;
  type: "buy" | "sell";
  indicator: string;
  condition: string;
  value: number;
  enabled: boolean;
}

export interface Signal {
  id: string;
  pair: string;
  type: "buy" | "sell";
  condition: string;
  price: number;
  time: number;
  indicator: string;
  value: number;
}

export const DEFAULT_SIGNAL_CONDITIONS: SignalCondition[] = [
  { id: "rsi_oversold", name: "RSI Oversold", type: "buy", indicator: "RSI", condition: "crosses_below", value: 30, enabled: true },
  { id: "rsi_overbought", name: "RSI Overbought", type: "sell", indicator: "RSI", condition: "crosses_above", value: 70, enabled: true },
  { id: "macd_bull_cross", name: "MACD Bullish Cross", type: "buy", indicator: "MACD", condition: "crosses_above_signal", value: 0, enabled: true },
  { id: "macd_bear_cross", name: "MACD Bearish Cross", type: "sell", indicator: "MACD", condition: "crosses_below_signal", value: 0, enabled: true },
  { id: "price_above_sma50", name: "Price > SMA 50", type: "buy", indicator: "SMA", condition: "price_crosses_above", value: 50, enabled: true },
  { id: "price_below_sma50", name: "Price < SMA 50", type: "sell", indicator: "SMA", condition: "price_crosses_below", value: 50, enabled: true },
  { id: "bb_lower_touch", name: "Bollinger Lower Touch", type: "buy", indicator: "BB", condition: "price_below_lower", value: 20, enabled: false },
  { id: "bb_upper_touch", name: "Bollinger Upper Touch", type: "sell", indicator: "BB", condition: "price_above_upper", value: 20, enabled: false },
  { id: "stoch_oversold", name: "Stochastic Oversold", type: "buy", indicator: "STOCH", condition: "k_crosses_above_d_below", value: 20, enabled: false },
  { id: "stoch_overbought", name: "Stochastic Overbought", type: "sell", indicator: "STOCH", condition: "k_crosses_below_d_above", value: 80, enabled: false },
];

export function detectSignals(
  pair: string,
  candles: Candle[],
  conditions: SignalCondition[]
): Signal[] {
  if (candles.length < 50) return [];

  const closes = candles.map(c => c.close);
  const signals: Signal[] = [];
  const lastIdx = closes.length - 1;
  const prevIdx = closes.length - 2;
  const lastCandle = candles[lastIdx];

  for (const cond of conditions) {
    if (!cond.enabled) continue;

    if (cond.indicator === "RSI") {
      const rsi = RSI(closes, 14);
      const curr = rsi[lastIdx];
      const prev = rsi[prevIdx];
      if (curr === null || prev === null) continue;

      if (cond.condition === "crosses_below" && prev >= cond.value && curr < cond.value) {
        signals.push({ id: cond.id, pair, type: "buy", condition: `RSI crossed below ${cond.value} (${curr.toFixed(1)})`, price: lastCandle.close, time: lastCandle.time, indicator: "RSI", value: curr });
      }
      if (cond.condition === "crosses_above" && prev <= cond.value && curr > cond.value) {
        signals.push({ id: cond.id, pair, type: "sell", condition: `RSI crossed above ${cond.value} (${curr.toFixed(1)})`, price: lastCandle.close, time: lastCandle.time, indicator: "RSI", value: curr });
      }
    }

    if (cond.indicator === "MACD") {
      const macd = MACD(closes);
      const currM = macd.macd[lastIdx], currS = macd.signal[lastIdx];
      const prevM = macd.macd[prevIdx], prevS = macd.signal[prevIdx];
      if (currM === null || currS === null || prevM === null || prevS === null) continue;

      if (cond.condition === "crosses_above_signal" && prevM <= prevS && currM > currS) {
        signals.push({ id: cond.id, pair, type: "buy", condition: "MACD crossed above signal line", price: lastCandle.close, time: lastCandle.time, indicator: "MACD", value: currM });
      }
      if (cond.condition === "crosses_below_signal" && prevM >= prevS && currM < currS) {
        signals.push({ id: cond.id, pair, type: "sell", condition: "MACD crossed below signal line", price: lastCandle.close, time: lastCandle.time, indicator: "MACD", value: currM });
      }
    }

    if (cond.indicator === "SMA") {
      const sma = SMA(closes, cond.value);
      const currSMA = sma[lastIdx], prevSMA = sma[prevIdx];
      if (currSMA === null || prevSMA === null) continue;

      if (cond.condition === "price_crosses_above" && closes[prevIdx] <= prevSMA && closes[lastIdx] > currSMA) {
        signals.push({ id: cond.id, pair, type: "buy", condition: `Price crossed above SMA(${cond.value})`, price: lastCandle.close, time: lastCandle.time, indicator: "SMA", value: currSMA });
      }
      if (cond.condition === "price_crosses_below" && closes[prevIdx] >= prevSMA && closes[lastIdx] < currSMA) {
        signals.push({ id: cond.id, pair, type: "sell", condition: `Price crossed below SMA(${cond.value})`, price: lastCandle.close, time: lastCandle.time, indicator: "SMA", value: currSMA });
      }
    }

    if (cond.indicator === "BB") {
      const bb = BollingerBands(closes, cond.value);
      const currLower = bb.lower[lastIdx], currUpper = bb.upper[lastIdx];
      if (currLower === null || currUpper === null) continue;

      if (cond.condition === "price_below_lower" && closes[lastIdx] < currLower) {
        signals.push({ id: cond.id, pair, type: "buy", condition: "Price below Bollinger lower band", price: lastCandle.close, time: lastCandle.time, indicator: "BB", value: currLower });
      }
      if (cond.condition === "price_above_upper" && closes[lastIdx] > currUpper) {
        signals.push({ id: cond.id, pair, type: "sell", condition: "Price above Bollinger upper band", price: lastCandle.close, time: lastCandle.time, indicator: "BB", value: currUpper });
      }
    }

    if (cond.indicator === "STOCH") {
      const stoch = Stochastic(candles);
      const currK = stoch.k[lastIdx], currD = stoch.d[lastIdx];
      const prevK = stoch.k[prevIdx], prevD = stoch.d[prevIdx];
      if (currK === null || currD === null || prevK === null || prevD === null) continue;

      if (cond.condition === "k_crosses_above_d_below" && prevK <= prevD && currK > currD && currK < cond.value) {
        signals.push({ id: cond.id, pair, type: "buy", condition: `Stochastic %K crossed %D below ${cond.value}`, price: lastCandle.close, time: lastCandle.time, indicator: "STOCH", value: currK });
      }
      if (cond.condition === "k_crosses_below_d_above" && prevK >= prevD && currK < currD && currK > cond.value) {
        signals.push({ id: cond.id, pair, type: "sell", condition: `Stochastic %K crossed %D above ${cond.value}`, price: lastCandle.close, time: lastCandle.time, indicator: "STOCH", value: currK });
      }
    }
  }

  return signals;
}

// ============================================================
// INDICATOR SUMMARY for display
// ============================================================

export interface IndicatorSummary {
  rsi: number | null;
  rsiSignal: "overbought" | "oversold" | "neutral";
  sma20: number | null;
  sma50: number | null;
  ema20: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdTrend: "bullish" | "bearish" | "neutral";
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bbPosition: "above" | "below" | "inside";
  atr: number | null;
  stochK: number | null;
  stochD: number | null;
  overallBias: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
  buyScore: number;
  sellScore: number;
}

export function calculateSummary(candles: Candle[]): IndicatorSummary | null {
  if (candles.length < 50) return null;

  const closes = candles.map(c => c.close);
  const lastClose = closes[closes.length - 1];
  const lastIdx = closes.length - 1;

  const rsiVals = RSI(closes, 14);
  const rsi = rsiVals[lastIdx];

  const sma20Vals = SMA(closes, 20);
  const sma50Vals = SMA(closes, 50);
  const ema20Vals = EMA(closes, 20);
  const sma20 = sma20Vals[lastIdx];
  const sma50 = sma50Vals[lastIdx];
  const ema20 = ema20Vals[lastIdx];

  const macdResult = MACD(closes);
  const macd = macdResult.macd[lastIdx];
  const macdSig = macdResult.signal[lastIdx];
  const macdHist = macdResult.histogram[lastIdx];

  const bb = BollingerBands(closes, 20);
  const bbUpper = bb.upper[lastIdx];
  const bbMiddle = bb.middle[lastIdx];
  const bbLower = bb.lower[lastIdx];

  const atrVals = ATR(candles, 14);
  const atr = atrVals[lastIdx];

  const stoch = Stochastic(candles);
  const stochK = stoch.k[lastIdx];
  const stochD = stoch.d[lastIdx];

  // Score calculation
  let buyScore = 0, sellScore = 0;

  // RSI
  if (rsi !== null) {
    if (rsi < 30) buyScore += 2;
    else if (rsi < 40) buyScore += 1;
    else if (rsi > 70) sellScore += 2;
    else if (rsi > 60) sellScore += 1;
  }

  // Price vs MAs
  if (sma20 !== null) { lastClose > sma20 ? buyScore++ : sellScore++; }
  if (sma50 !== null) { lastClose > sma50 ? buyScore++ : sellScore++; }
  if (ema20 !== null) { lastClose > ema20 ? buyScore++ : sellScore++; }

  // MACD
  if (macd !== null && macdSig !== null) {
    macd > macdSig ? buyScore++ : sellScore++;
    if (macdHist !== null) { macdHist > 0 ? buyScore++ : sellScore++; }
  }

  // Bollinger
  if (bbLower !== null && bbUpper !== null) {
    if (lastClose < bbLower) buyScore += 2;
    else if (lastClose > bbUpper) sellScore += 2;
  }

  // Stochastic
  if (stochK !== null) {
    if (stochK < 20) buyScore++;
    else if (stochK > 80) sellScore++;
  }

  const total = buyScore + sellScore;
  const buyPct = total > 0 ? buyScore / total : 0.5;

  let overallBias: IndicatorSummary["overallBias"] = "neutral";
  if (buyPct >= 0.75) overallBias = "strong_buy";
  else if (buyPct >= 0.6) overallBias = "buy";
  else if (buyPct <= 0.25) overallBias = "strong_sell";
  else if (buyPct <= 0.4) overallBias = "sell";

  return {
    rsi,
    rsiSignal: rsi !== null ? (rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : "neutral") : "neutral",
    sma20, sma50, ema20,
    macd, macdSignal: macdSig, macdHistogram: macdHist,
    macdTrend: macd !== null && macdSig !== null ? (macd > macdSig ? "bullish" : "bearish") : "neutral",
    bbUpper, bbMiddle, bbLower,
    bbPosition: bbLower !== null && bbUpper !== null ? (lastClose < bbLower ? "below" : lastClose > bbUpper ? "above" : "inside") : "inside",
    atr,
    stochK, stochD,
    overallBias,
    buyScore,
    sellScore,
  };
}

// ============================================================
// CANDLESTICK PATTERN DETECTION ENGINE
// ============================================================

export interface CandlePattern {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  strength: 1 | 2 | 3; // 1=weak, 2=medium, 3=strong
  emoji: string;
  index: number;  // candle index where detected
}

// Helper: body and wick measurements
function body(c: Candle) { return Math.abs(c.close - c.open); }
function upperWick(c: Candle) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c: Candle) { return Math.min(c.open, c.close) - c.low; }
function range(c: Candle) { return c.high - c.low; }
function isBullish(c: Candle) { return c.close > c.open; }
function isBearish(c: Candle) { return c.close < c.open; }
function bodyMidpoint(c: Candle) { return (c.open + c.close) / 2; }
function avgBody(candles: Candle[], end: number, lookback: number = 10): number {
  let sum = 0, count = 0;
  for (let i = Math.max(0, end - lookback); i < end; i++) { sum += body(candles[i]); count++; }
  return count > 0 ? sum / count : 0;
}

export function detectCandlePatterns(candles: Candle[]): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (candles.length < 5) return patterns;

  const i = candles.length - 1;  // current candle
  const c = candles[i];
  const p = candles[i - 1];      // previous
  const pp = i >= 2 ? candles[i - 2] : null; // 2 back
  const avg = avgBody(candles, i);
  const r = range(c);

  if (r === 0 || avg === 0) return patterns;

  const bodySize = body(c);
  const upperW = upperWick(c);
  const lowerW = lowerWick(c);

  // ── SINGLE CANDLE PATTERNS ──

  // Doji — body < 10% of range
  if (bodySize < r * 0.1) {
    if (lowerW > r * 0.6) {
      patterns.push({ name: "Dragonfly Doji", type: "bullish", strength: 2, emoji: "🜲", index: i });
    } else if (upperW > r * 0.6) {
      patterns.push({ name: "Gravestone Doji", type: "bearish", strength: 2, emoji: "🜲", index: i });
    } else {
      patterns.push({ name: "Doji", type: "neutral", strength: 1, emoji: "✚", index: i });
    }
  }

  // Hammer — small body at top, long lower wick (2x+ body), tiny upper wick
  if (lowerW >= bodySize * 2 && upperW < bodySize * 0.5 && bodySize > r * 0.1) {
    // Check prior trend (last 5 candles bearish = hammer is bullish reversal)
    const priorTrend = candles[i - 1].close < candles[Math.max(0, i - 5)].close;
    if (priorTrend) {
      patterns.push({ name: "Hammer", type: "bullish", strength: 2, emoji: "🔨", index: i });
    } else {
      patterns.push({ name: "Hanging Man", type: "bearish", strength: 2, emoji: "🔨", index: i });
    }
  }

  // Inverted Hammer / Shooting Star — long upper wick, small body at bottom
  if (upperW >= bodySize * 2 && lowerW < bodySize * 0.5 && bodySize > r * 0.1) {
    const priorTrend = candles[i - 1].close < candles[Math.max(0, i - 5)].close;
    if (priorTrend) {
      patterns.push({ name: "Inverted Hammer", type: "bullish", strength: 2, emoji: "⭐", index: i });
    } else {
      patterns.push({ name: "Shooting Star", type: "bearish", strength: 2, emoji: "💫", index: i });
    }
  }

  // Marubozu — very large body, tiny wicks
  if (bodySize > avg * 1.5 && upperW < bodySize * 0.1 && lowerW < bodySize * 0.1) {
    patterns.push({
      name: isBullish(c) ? "Bullish Marubozu" : "Bearish Marubozu",
      type: isBullish(c) ? "bullish" : "bearish",
      strength: 3, emoji: "🟩", index: i,
    });
  }

  // Spinning Top — small body, both wicks larger than body
  if (bodySize < avg * 0.5 && upperW > bodySize && lowerW > bodySize && bodySize > r * 0.1) {
    patterns.push({ name: "Spinning Top", type: "neutral", strength: 1, emoji: "🔄", index: i });
  }

  // Pin Bar — one wick 3x+ body, other wick tiny
  if (lowerW >= bodySize * 3 && upperW < bodySize * 0.3) {
    patterns.push({ name: "Bullish Pin Bar", type: "bullish", strength: 3, emoji: "📌", index: i });
  }
  if (upperW >= bodySize * 3 && lowerW < bodySize * 0.3) {
    patterns.push({ name: "Bearish Pin Bar", type: "bearish", strength: 3, emoji: "📌", index: i });
  }

  // ── TWO CANDLE PATTERNS ──

  // Bullish Engulfing
  if (isBearish(p) && isBullish(c) && c.open <= p.close && c.close >= p.open && body(c) > body(p)) {
    patterns.push({ name: "Bullish Engulfing", type: "bullish", strength: 3, emoji: "🟢", index: i });
  }

  // Bearish Engulfing
  if (isBullish(p) && isBearish(c) && c.open >= p.close && c.close <= p.open && body(c) > body(p)) {
    patterns.push({ name: "Bearish Engulfing", type: "bearish", strength: 3, emoji: "🔴", index: i });
  }

  // Tweezer Bottom — same low, prior downtrend
  if (Math.abs(c.low - p.low) < avg * 0.05 && isBearish(p) && isBullish(c)) {
    patterns.push({ name: "Tweezer Bottom", type: "bullish", strength: 2, emoji: "🔧", index: i });
  }

  // Tweezer Top — same high, prior uptrend
  if (Math.abs(c.high - p.high) < avg * 0.05 && isBullish(p) && isBearish(c)) {
    patterns.push({ name: "Tweezer Top", type: "bearish", strength: 2, emoji: "🔧", index: i });
  }

  // Piercing Line — bearish prev, bullish current opens below prev low, closes above 50% of prev body
  if (isBearish(p) && isBullish(c) && c.open < p.low && c.close > bodyMidpoint(p) && c.close < p.open) {
    patterns.push({ name: "Piercing Line", type: "bullish", strength: 2, emoji: "⚡", index: i });
  }

  // Dark Cloud Cover — bullish prev, bearish current opens above prev high, closes below 50% of prev body
  if (isBullish(p) && isBearish(c) && c.open > p.high && c.close < bodyMidpoint(p) && c.close > p.open) {
    patterns.push({ name: "Dark Cloud Cover", type: "bearish", strength: 2, emoji: "🌑", index: i });
  }

  // Harami — current body inside previous body
  if (body(c) < body(p) * 0.6) {
    if (isBearish(p) && isBullish(c) && c.open > p.close && c.close < p.open) {
      patterns.push({ name: "Bullish Harami", type: "bullish", strength: 1, emoji: "🤰", index: i });
    }
    if (isBullish(p) && isBearish(c) && c.open < p.close && c.close > p.open) {
      patterns.push({ name: "Bearish Harami", type: "bearish", strength: 1, emoji: "🤰", index: i });
    }
  }

  // Inside Bar — entire range inside previous range
  if (c.high <= p.high && c.low >= p.low) {
    patterns.push({ name: "Inside Bar", type: "neutral", strength: 1, emoji: "📦", index: i });
  }

  // ── THREE CANDLE PATTERNS ──
  if (pp) {
    // Morning Star — bearish, doji/small, bullish (reversal)
    if (isBearish(pp) && body(p) < avg * 0.3 && isBullish(c) && c.close > bodyMidpoint(pp)) {
      patterns.push({ name: "Morning Star", type: "bullish", strength: 3, emoji: "🌅", index: i });
    }

    // Evening Star — bullish, doji/small, bearish (reversal)
    if (isBullish(pp) && body(p) < avg * 0.3 && isBearish(c) && c.close < bodyMidpoint(pp)) {
      patterns.push({ name: "Evening Star", type: "bearish", strength: 3, emoji: "🌆", index: i });
    }

    // Three White Soldiers — 3 consecutive bullish candles with higher closes
    if (isBullish(pp) && isBullish(p) && isBullish(c) &&
        p.close > pp.close && c.close > p.close &&
        body(pp) > avg * 0.5 && body(p) > avg * 0.5 && body(c) > avg * 0.5) {
      patterns.push({ name: "Three White Soldiers", type: "bullish", strength: 3, emoji: "🪖", index: i });
    }

    // Three Black Crows — 3 consecutive bearish candles with lower closes
    if (isBearish(pp) && isBearish(p) && isBearish(c) &&
        p.close < pp.close && c.close < p.close &&
        body(pp) > avg * 0.5 && body(p) > avg * 0.5 && body(c) > avg * 0.5) {
      patterns.push({ name: "Three Black Crows", type: "bearish", strength: 3, emoji: "🦅", index: i });
    }

    // Three Inside Up — bearish, bullish harami, bullish continuation
    if (isBearish(pp) && isBullish(p) && p.open > pp.close && p.close < pp.open &&
        isBullish(c) && c.close > pp.open) {
      patterns.push({ name: "Three Inside Up", type: "bullish", strength: 3, emoji: "📈", index: i });
    }

    // Three Inside Down — bullish, bearish harami, bearish continuation
    if (isBullish(pp) && isBearish(p) && p.open < pp.close && p.close > pp.open &&
        isBearish(c) && c.close < pp.open) {
      patterns.push({ name: "Three Inside Down", type: "bearish", strength: 3, emoji: "📉", index: i });
    }
  }

  return patterns;
}
