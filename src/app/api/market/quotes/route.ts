import { NextRequest, NextResponse } from "next/server";

// Priority:
// 1. Twelve Data /price (real-time, free 8 credits/min)
// 2. Frankfurter (daily ECB rates, free unlimited)

const TWELVE_DATA_BASE = "https://api.twelvedata.com";

function toTwelveSymbol(oandaSymbol: string): string {
  return oandaSymbol.replace("OANDA:", "").replace("_", "/");
}

function toOandaSymbol(tdSymbol: string): string {
  return "OANDA:" + tdSymbol.replace("/", "_");
}

// Cache: separate for Twelve Data (short TTL) and Frankfurter (longer TTL)
let tdCache: { data: any; timestamp: number } | null = null;
let ffCache: { data: any; timestamp: number } | null = null;
const TD_CACHE_TTL = 8000;   // 8 seconds (matches ~8 calls/min limit)
const FF_CACHE_TTL = 60000;  // 60 seconds

async function fetchTwelveDataPrices(symbols: string[], apiKey: string): Promise<Record<string, { bid: number; ask: number }> | null> {
  try {
    // Batch up to 8 symbols per call (free tier limit)
    const batch = symbols.slice(0, 8);
    const tdSymbols = batch.map(toTwelveSymbol).join(",");

    const res = await fetch(
      `${TWELVE_DATA_BASE}/price?symbol=${encodeURIComponent(tdSymbols)}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const pairs: Record<string, { bid: number; ask: number }> = {};

    if (batch.length === 1) {
      // Single symbol returns { price: "1.0869" }
      if (data.price) {
        const price = parseFloat(data.price);
        const spread = price * 0.00003;
        pairs[batch[0]] = { bid: price, ask: price + spread };
      }
    } else {
      // Multiple symbols returns { "EUR/USD": { price: "1.0869" }, ... }
      for (const [tdSym, val] of Object.entries(data)) {
        const v = val as any;
        if (v.price) {
          const oandaSym = toOandaSymbol(tdSym);
          const price = parseFloat(v.price);
          const spread = price * 0.00003;
          pairs[oandaSym] = { bid: price, ask: price + spread };
        }
      }
    }

    return Object.keys(pairs).length > 0 ? pairs : null;
  } catch {
    return null;
  }
}

async function fetchFrankfurterPrices(): Promise<Record<string, { bid: number; ask: number }>> {
  const res = await fetch(
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CHF,AUD,CAD,NZD,ZAR,TRY,MXN,SGD"
  );
  if (!res.ok) return {};
  const data = await res.json();
  const r = data.rates || {};

  const pairs: Record<string, { bid: number; ask: number }> = {};
  const add = (sym: string, bid: number, sp: number = 1.00003) => {
    pairs[sym] = { bid: parseFloat(bid.toFixed(6)), ask: parseFloat((bid * sp).toFixed(6)) };
  };

  // Majors
  if (r.EUR) add("OANDA:EUR_USD", 1 / r.EUR);
  if (r.GBP) add("OANDA:GBP_USD", 1 / r.GBP);
  if (r.JPY) add("OANDA:USD_JPY", r.JPY);
  if (r.CHF) add("OANDA:USD_CHF", r.CHF);
  if (r.AUD) add("OANDA:AUD_USD", 1 / r.AUD);
  if (r.CAD) add("OANDA:USD_CAD", r.CAD);
  if (r.NZD) add("OANDA:NZD_USD", 1 / r.NZD);
  // Crosses
  if (r.EUR && r.GBP) add("OANDA:EUR_GBP", r.GBP / r.EUR);
  if (r.EUR && r.JPY) add("OANDA:EUR_JPY", r.JPY / r.EUR);
  if (r.GBP && r.JPY) add("OANDA:GBP_JPY", r.JPY / r.GBP);
  if (r.EUR && r.AUD) add("OANDA:EUR_AUD", r.AUD / r.EUR);
  if (r.EUR && r.CAD) add("OANDA:EUR_CAD", r.CAD / r.EUR);
  if (r.EUR && r.CHF) add("OANDA:EUR_CHF", r.CHF / r.EUR);
  if (r.GBP && r.AUD) add("OANDA:GBP_AUD", r.AUD / r.GBP);
  if (r.GBP && r.CAD) add("OANDA:GBP_CAD", r.CAD / r.GBP);
  if (r.GBP && r.CHF) add("OANDA:GBP_CHF", r.CHF / r.GBP);
  if (r.AUD && r.JPY) add("OANDA:AUD_JPY", r.JPY / r.AUD);
  if (r.CAD && r.JPY) add("OANDA:CAD_JPY", r.JPY / r.CAD);
  if (r.NZD && r.JPY) add("OANDA:NZD_JPY", r.JPY / r.NZD);
  if (r.AUD && r.CAD) add("OANDA:AUD_CAD", r.CAD / r.AUD);
  if (r.AUD && r.NZD) add("OANDA:AUD_NZD", r.NZD / r.AUD);
  if (r.NZD && r.CAD) add("OANDA:NZD_CAD", r.CAD / r.NZD);
  if (r.ZAR) add("OANDA:USD_ZAR", r.ZAR, 1.0005);
  if (r.TRY) add("OANDA:USD_TRY", r.TRY, 1.0005);
  if (r.MXN) add("OANDA:USD_MXN", r.MXN, 1.0005);

  return pairs;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requestedSymbols = searchParams.get("symbols")?.split(",") || [];

  const apiKey = process.env.TWELVE_DATA_API_KEY;

  // Try Twelve Data first (real-time)
  if (apiKey && requestedSymbols.length > 0) {
    // Check cache
    if (tdCache && Date.now() - tdCache.timestamp < TD_CACHE_TTL) {
      return NextResponse.json(tdCache.data);
    }

    const tdPrices = await fetchTwelveDataPrices(requestedSymbols, apiKey);
    if (tdPrices) {
      // Merge with Frankfurter for any missing pairs
      if (!ffCache || Date.now() - ffCache.timestamp > FF_CACHE_TTL) {
        const ffPrices = await fetchFrankfurterPrices();
        ffCache = { data: ffPrices, timestamp: Date.now() };
      }
      const merged = { ...ffCache.data, ...tdPrices };
      const result = { pairs: merged, timestamp: Date.now() };
      tdCache = { data: result, timestamp: Date.now() };
      return NextResponse.json(result);
    }
  }

  // Fallback: Frankfurter only
  if (ffCache && Date.now() - ffCache.timestamp < FF_CACHE_TTL) {
    return NextResponse.json({ pairs: ffCache.data, timestamp: Date.now() });
  }

  try {
    const ffPrices = await fetchFrankfurterPrices();
    ffCache = { data: ffPrices, timestamp: Date.now() };
    return NextResponse.json({ pairs: ffPrices, timestamp: Date.now() });
  } catch (err) {
    console.error("Quotes error:", err);
    return NextResponse.json({ error: "Failed", pairs: {} }, { status: 500 });
  }
}
