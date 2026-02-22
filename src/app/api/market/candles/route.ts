import { NextRequest, NextResponse } from "next/server";

// Twelve Data for intraday candles (1min, 5min, 15min, 1H)
// Frankfurter for daily candles (free fallback)

const TWELVE_DATA_BASE = "https://api.twelvedata.com";

// Convert OANDA:EUR_USD → EUR/USD for Twelve Data
function toTwelveSymbol(symbol: string): string {
  return symbol.replace("OANDA:", "").replace("_", "/");
}

// Frankfurter daily candles (free, no key)
async function fetchDailyCandles(symbol: string, count: number) {
  const clean = symbol.replace("OANDA:", "");
  const [base, quote] = clean.split("_");
  if (!base || !quote) return [];

  if (["XAU", "XAG"].includes(base) || ["XAU", "XAG"].includes(quote)) {
    return [];
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Math.ceil(count * 1.5));

  const from = startDate.toISOString().split("T")[0];
  const to = endDate.toISOString().split("T")[0];

  const symbols = new Set<string>();
  if (base !== "USD") symbols.add(base);
  if (quote !== "USD") symbols.add(quote);
  const symbolsParam = symbols.size > 0 ? `&symbols=${Array.from(symbols).join(",")}` : "";

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
    const minRange = close * 0.0005;
    const wick = Math.max(range * 0.3, minRange);

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
}

// Twelve Data intraday candles
async function fetchIntradayCandles(symbol: string, interval: string, count: number, apiKey: string) {
  const tdSymbol = toTwelveSymbol(symbol);
  const url = `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${interval}&outputsize=${count}&apikey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status === "error" || !data.values) return null;

  // Twelve Data returns newest first, we want oldest first
  const candles = data.values.reverse().map((v: any) => ({
    time: Math.floor(new Date(v.datetime).getTime() / 1000),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume || "0"),
  }));

  return candles;
}

// Cache
const cache: Record<string, { candles: any[]; timestamp: number }> = {};
const CACHE_TTL: Record<string, number> = {
  "1min": 60000,      // 1 min
  "5min": 120000,     // 2 min
  "15min": 300000,    // 5 min
  "1h": 600000,       // 10 min
  "D": 300000,        // 5 min (daily doesn't change often)
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "OANDA:EUR_USD";
  const resolution = searchParams.get("resolution") || "1h";
  const count = Math.min(parseInt(searchParams.get("count") || "200"), 500);

  // Map resolution
  const resMap: Record<string, string> = {
    "1": "1min", "1min": "1min",
    "5": "5min", "5min": "5min",
    "15": "15min", "15min": "15min",
    "30": "30min", "30min": "30min",
    "60": "1h", "1h": "1h",
    "D": "D", "1D": "D", "1d": "D",
  };
  const interval = resMap[resolution] || "1h";

  // Check cache
  const cacheKey = `${symbol}-${interval}-${count}`;
  const ttl = CACHE_TTL[interval] || 300000;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < ttl) {
    return NextResponse.json({
      candles: cache[cacheKey].candles,
      symbol, resolution: interval, count: cache[cacheKey].candles.length,
    });
  }

  try {
    let candles: any[] = [];

    if (interval === "D") {
      // Daily → use Frankfurter (free, no key)
      candles = await fetchDailyCandles(symbol, count);
    } else {
      // Intraday → use Twelve Data
      const apiKey = process.env.TWELVE_DATA_API_KEY;
      if (!apiKey) {
        // Fallback to daily if no Twelve Data key
        candles = await fetchDailyCandles(symbol, count);
        return NextResponse.json({
          candles, symbol, resolution: "D", count: candles.length,
        });
      }

      const result = await fetchIntradayCandles(symbol, interval, count, apiKey);
      if (result && result.length > 0) {
        candles = result;
      } else {
        // Fallback to daily
        candles = await fetchDailyCandles(symbol, count);
        return NextResponse.json({
          candles, symbol, resolution: "D", count: candles.length,
        });
      }
    }

    if (candles.length > 0) {
      cache[cacheKey] = { candles, timestamp: Date.now() };
    }

    return NextResponse.json({
      candles, symbol, resolution: interval, count: candles.length,
    });
  } catch (err) {
    console.error("Candles error:", err);
    return NextResponse.json({ error: "Failed to fetch candles", candles: [] }, { status: 500 });
  }
}
