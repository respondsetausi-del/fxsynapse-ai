import { NextResponse } from "next/server";

// Frankfurter ONLY for live quotes — free, unlimited, no key
// Twelve Data is reserved exclusively for intraday candles

let cache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 30000; // 30s

async function fetchRates(): Promise<Record<string, { bid: number; ask: number }>> {
  const res = await fetch(
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CHF,AUD,CAD,NZD,ZAR,TRY,MXN,SGD,NOK,SEK,HKD,CNY"
  );
  if (!res.ok) return {};
  const data = await res.json();
  const r = data.rates || {};
  const pairs: Record<string, { bid: number; ask: number }> = {};

  const add = (sym: string, bid: number, sp: number = 1.00003) => {
    pairs[sym] = { bid: parseFloat(bid.toFixed(6)), ask: parseFloat((bid * sp).toFixed(6)) };
  };

  if (r.EUR) add("OANDA:EUR_USD", 1 / r.EUR);
  if (r.GBP) add("OANDA:GBP_USD", 1 / r.GBP);
  if (r.JPY) add("OANDA:USD_JPY", r.JPY);
  if (r.CHF) add("OANDA:USD_CHF", r.CHF);
  if (r.AUD) add("OANDA:AUD_USD", 1 / r.AUD);
  if (r.CAD) add("OANDA:USD_CAD", r.CAD);
  if (r.NZD) add("OANDA:NZD_USD", 1 / r.NZD);
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

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const pairs = await fetchRates();
    const result = { pairs, timestamp: Date.now() };
    cache = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (err) {
    console.error("Quotes error:", err);
    return NextResponse.json({ pairs: {}, timestamp: Date.now() }, { status: 500 });
  }
}
