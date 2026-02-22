import { NextRequest, NextResponse } from "next/server";

// ═══ RATE LIMITER ═══
// Twelve Data free: 8 credits/min. We use max 5 to stay safe.
const TD_CALLS: number[] = [];
const TD_MAX_PER_MIN = 5;

function canCallTwelveData(): boolean {
  const now = Date.now();
  // Remove calls older than 60s
  while (TD_CALLS.length > 0 && now - TD_CALLS[0] > 60000) {
    TD_CALLS.shift();
  }
  return TD_CALLS.length < TD_MAX_PER_MIN;
}

function recordTwelveDataCall() {
  TD_CALLS.push(Date.now());
}

// ═══ CACHE ═══
const cache: Record<string, { candles: any[]; timestamp: number }> = {};
const CACHE_TTL: Record<string, number> = {
  "1min": 120000,    // 2 min (don't refetch 1min candles constantly)
  "5min": 300000,    // 5 min
  "15min": 600000,   // 10 min
  "1h": 900000,      // 15 min
  "D": 600000,       // 10 min
};

// ═══ TWELVE DATA (intraday only) ═══
function toTwelveSymbol(symbol: string): string {
  return symbol.replace("OANDA:", "").replace("_", "/");
}

async function fetchTwelveDataCandles(symbol: string, interval: string, count: number, apiKey: string): Promise<any[] | null> {
  if (!canCallTwelveData()) return null; // Rate limited — skip silently

  try {
    recordTwelveDataCall();
    const tdSymbol = toTwelveSymbol(symbol);
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${interval}&outputsize=${count}&apikey=${apiKey}`;
    
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status === "error" || !data.values) return null;

    return data.values.reverse().map((v: any) => ({
      time: Math.floor(new Date(v.datetime).getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || "0"),
    }));
  } catch {
    return null;
  }
}

// ═══ FRANKFURTER (daily — free, unlimited) ═══
async function fetchDailyCandles(symbol: string, count: number): Promise<any[]> {
  const clean = symbol.replace("OANDA:", "");
  const [base, quote] = clean.split("_");
  if (!base || !quote) return [];
  if (["XAU", "XAG"].includes(base) || ["XAU", "XAG"].includes(quote)) return [];

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Math.ceil(count * 1.5));

  const from = startDate.toISOString().split("T")[0];
  const to = endDate.toISOString().split("T")[0];

  const symbols = new Set<string>();
  if (base !== "USD") symbols.add(base);
  if (quote !== "USD") symbols.add(quote);
  const symbolsParam = symbols.size > 0 ? `&symbols=${Array.from(symbols).join(",")}` : "";

  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${from}..${to}?base=USD${symbolsParam}`);
    if (!res.ok) return [];
    const data = await res.json();
    const ratesByDate = data.rates || {};
    const dates = Object.keys(ratesByDate).sort();

    const candles: any[] = [];
    let prevClose: number | null = null;

    for (const date of dates) {
      const dayRates = ratesByDate[date];
      let close: number | null = null;

      if (base === "USD") close = dayRates[quote] ?? null;
      else if (quote === "USD") close = dayRates[base] ? 1 / dayRates[base] : null;
      else if (dayRates[base] && dayRates[quote]) close = dayRates[quote] / dayRates[base];

      if (close === null) continue;

      const open = prevClose ?? close;
      const range = Math.abs(close - open);
      const wick = Math.max(range * 0.3, close * 0.0005);

      candles.push({
        time: Math.floor(new Date(date).getTime() / 1000),
        open: parseFloat(open.toFixed(6)),
        high: parseFloat((Math.max(open, close) + wick).toFixed(6)),
        low: parseFloat((Math.min(open, close) - wick).toFixed(6)),
        close: parseFloat(close.toFixed(6)),
        volume: 0,
      });
      prevClose = close;
    }

    return candles.slice(-count);
  } catch {
    return [];
  }
}

// ═══ MAIN HANDLER ═══
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "OANDA:EUR_USD";
  const resolution = searchParams.get("resolution") || "1h";
  const count = Math.min(parseInt(searchParams.get("count") || "200"), 500);

  const resMap: Record<string, string> = {
    "1": "1min", "1min": "1min",
    "5": "5min", "5min": "5min",
    "15": "15min", "15min": "15min",
    "30": "30min", "30min": "30min",
    "60": "1h", "1h": "1h",
    "D": "D", "1D": "D", "1d": "D",
  };
  const interval = resMap[resolution] || "1h";

  // Check cache first
  const cacheKey = `${symbol}-${interval}-${count}`;
  const ttl = CACHE_TTL[interval] || 600000;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < ttl) {
    return NextResponse.json({
      candles: cache[cacheKey].candles,
      symbol, resolution: interval, count: cache[cacheKey].candles.length,
    });
  }

  let candles: any[] = [];

  if (interval === "D") {
    // Daily → always Frankfurter (free)
    candles = await fetchDailyCandles(symbol, count);
  } else {
    // Intraday → try Twelve Data (rate limited), fallback to daily
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (apiKey) {
      const tdCandles = await fetchTwelveDataCandles(symbol, interval, count, apiKey);
      if (tdCandles && tdCandles.length > 0) {
        candles = tdCandles;
      }
    }
    // Fallback to daily if no intraday data
    if (candles.length === 0) {
      candles = await fetchDailyCandles(symbol, count);
    }
  }

  if (candles.length > 0) {
    cache[cacheKey] = { candles, timestamp: Date.now() };
  }

  return NextResponse.json({
    candles, symbol, resolution: interval, count: candles.length,
  });
}
