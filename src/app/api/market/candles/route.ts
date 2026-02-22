import { NextRequest, NextResponse } from "next/server";

// Frankfurter time series → daily candles (free, no key)
// For indicators, daily close is what matters (SMA, RSI, MACD all use close)

// Map OANDA symbols to Frankfurter currencies
function parseSymbol(symbol: string): { base: string; quote: string } | null {
  // OANDA:EUR_USD → base=EUR, quote=USD
  const clean = symbol.replace("OANDA:", "");
  const parts = clean.split("_");
  if (parts.length !== 2) return null;
  return { base: parts[0], quote: parts[1] };
}

// Convert Frankfurter rates to a pair price
function calcPrice(rates: Record<string, number>, base: string, quote: string, frankfurterBase: string): number | null {
  // Frankfurter returns rates relative to frankfurterBase
  if (base === frankfurterBase) {
    // e.g., USD/JPY with frankfurterBase=USD → just return JPY rate
    return rates[quote] ?? null;
  }
  if (quote === frankfurterBase) {
    // e.g., EUR/USD with frankfurterBase=USD → 1/EUR_rate
    return rates[base] ? 1 / rates[base] : null;
  }
  // Cross pair: e.g., EUR/GBP with frankfurterBase=USD
  // EUR/GBP = (1/EUR_in_USD) / (1/GBP_in_USD) = GBP_rate / EUR_rate
  if (rates[base] && rates[quote]) {
    return rates[quote] / rates[base];
  }
  return null;
}

let candleCache: Record<string, { candles: any[]; timestamp: number }> = {};
const CACHE_TTL = 300000; // 5 min cache for candles

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "OANDA:EUR_USD";
  const count = Math.min(parseInt(searchParams.get("count") || "200"), 365);

  const cacheKey = `${symbol}-${count}`;
  if (candleCache[cacheKey] && Date.now() - candleCache[cacheKey].timestamp < CACHE_TTL) {
    return NextResponse.json({
      candles: candleCache[cacheKey].candles,
      symbol,
      resolution: "D",
      count: candleCache[cacheKey].candles.length,
    });
  }

  const pair = parseSymbol(symbol);
  if (!pair) {
    return NextResponse.json({ error: "Invalid symbol", candles: [] }, { status: 400 });
  }

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Math.ceil(count * 1.5)); // Extra days for weekends/holidays

  const from = startDate.toISOString().split("T")[0];
  const to = endDate.toISOString().split("T")[0];

  // Determine which currencies to fetch
  const symbols = new Set<string>();
  if (pair.base !== "USD") symbols.add(pair.base);
  if (pair.quote !== "USD") symbols.add(pair.quote);

  // Handle XAU/XAG — Frankfurter doesn't support metals
  if (pair.base === "XAU" || pair.base === "XAG" || pair.quote === "XAU" || pair.quote === "XAG") {
    return NextResponse.json({ candles: [], symbol, resolution: "D", count: 0, note: "Metals not available on free feed" });
  }

  const symbolsParam = symbols.size > 0 ? `&symbols=${Array.from(symbols).join(",")}` : "";

  try {
    const url = `https://api.frankfurter.dev/v1/${from}..${to}?base=USD${symbolsParam}`;
    const res = await fetch(url);

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch historical data", candles: [] }, { status: 500 });
    }

    const data = await res.json();
    const ratesByDate = data.rates || {};
    const dates = Object.keys(ratesByDate).sort();

    if (dates.length === 0) {
      return NextResponse.json({ candles: [], symbol, resolution: "D", count: 0 });
    }

    // Build candles from daily rates
    const candles: any[] = [];
    let prevClose: number | null = null;

    for (const date of dates) {
      const dayRates = ratesByDate[date];
      const close = calcPrice(dayRates, pair.base, pair.quote, "USD");
      if (close === null) continue;

      const open = prevClose ?? close;
      // Estimate high/low from open/close with small variance
      const range = Math.abs(close - open);
      const minRange = close * 0.0005; // Minimum 0.05% range
      const wick = Math.max(range * 0.3, minRange);
      const high = Math.max(open, close) + wick;
      const low = Math.min(open, close) - wick;

      candles.push({
        time: Math.floor(new Date(date).getTime() / 1000),
        open: parseFloat(open.toFixed(6)),
        high: parseFloat(high.toFixed(6)),
        low: parseFloat(low.toFixed(6)),
        close: parseFloat(close.toFixed(6)),
        volume: 0,
      });

      prevClose = close;
    }

    // Trim to requested count
    const trimmed = candles.slice(-count);

    candleCache[cacheKey] = { candles: trimmed, timestamp: Date.now() };

    return NextResponse.json({
      candles: trimmed,
      symbol,
      resolution: "D",
      count: trimmed.length,
    });
  } catch (err) {
    console.error("Candles error:", err);
    return NextResponse.json({ error: "Failed to fetch candles", candles: [] }, { status: 500 });
  }
}
