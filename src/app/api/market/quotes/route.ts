import { NextResponse } from "next/server";

// Frankfurter API - FREE, no key, no limits
// Source: European Central Bank rates
// https://frankfurter.dev

let ratesCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 60000; // 60s cache

export async function GET() {
  // Return cache if fresh
  if (ratesCache && Date.now() - ratesCache.timestamp < CACHE_TTL) {
    return NextResponse.json(ratesCache.data);
  }

  try {
    const res = await fetch(
      "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CHF,AUD,CAD,NZD,SEK,NOK,DKK,PLN,CZK,HUF,TRY,ZAR,MXN,SGD,HKD,KRW,CNY,INR,BRL"
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Rates unavailable" }, { status: 500 });
    }

    const data = await res.json();
    const r = data.rates || {};

    // Build pair prices — Frankfurter gives rates relative to base (USD)
    // If base=USD and EUR=0.92, then EUR/USD = 1/0.92 = 1.0869
    const pairs: Record<string, { bid: number; ask: number }> = {};

    const addPair = (symbol: string, bid: number, spreadMult: number = 1.00003) => {
      pairs[symbol] = { bid: parseFloat(bid.toFixed(6)), ask: parseFloat((bid * spreadMult).toFixed(6)) };
    };

    // Majors
    if (r.EUR) addPair("OANDA:EUR_USD", 1 / r.EUR);
    if (r.GBP) addPair("OANDA:GBP_USD", 1 / r.GBP);
    if (r.JPY) addPair("OANDA:USD_JPY", r.JPY);
    if (r.CHF) addPair("OANDA:USD_CHF", r.CHF);
    if (r.AUD) addPair("OANDA:AUD_USD", 1 / r.AUD);
    if (r.CAD) addPair("OANDA:USD_CAD", r.CAD);
    if (r.NZD) addPair("OANDA:NZD_USD", 1 / r.NZD);

    // Crosses
    if (r.EUR && r.GBP) addPair("OANDA:EUR_GBP", r.GBP / r.EUR);
    if (r.EUR && r.JPY) addPair("OANDA:EUR_JPY", r.JPY / r.EUR);
    if (r.GBP && r.JPY) addPair("OANDA:GBP_JPY", r.JPY / r.GBP);
    if (r.EUR && r.AUD) addPair("OANDA:EUR_AUD", r.AUD / r.EUR);
    if (r.EUR && r.CAD) addPair("OANDA:EUR_CAD", r.CAD / r.EUR);
    if (r.EUR && r.CHF) addPair("OANDA:EUR_CHF", r.CHF / r.EUR);
    if (r.GBP && r.AUD) addPair("OANDA:GBP_AUD", r.AUD / r.GBP);
    if (r.GBP && r.CAD) addPair("OANDA:GBP_CAD", r.CAD / r.GBP);
    if (r.GBP && r.CHF) addPair("OANDA:GBP_CHF", r.CHF / r.GBP);
    if (r.AUD && r.JPY) addPair("OANDA:AUD_JPY", r.JPY / r.AUD);
    if (r.CAD && r.JPY) addPair("OANDA:CAD_JPY", r.JPY / r.CAD);
    if (r.NZD && r.JPY) addPair("OANDA:NZD_JPY", r.JPY / r.NZD);
    if (r.AUD && r.CAD) addPair("OANDA:AUD_CAD", r.CAD / r.AUD);
    if (r.AUD && r.NZD) addPair("OANDA:AUD_NZD", r.NZD / r.AUD);
    if (r.NZD && r.CAD) addPair("OANDA:NZD_CAD", r.CAD / r.NZD);

    // Exotics
    if (r.ZAR) addPair("OANDA:USD_ZAR", r.ZAR, 1.0005);
    if (r.TRY) addPair("OANDA:USD_TRY", r.TRY, 1.0005);
    if (r.MXN) addPair("OANDA:USD_MXN", r.MXN, 1.0005);
    if (r.SGD) addPair("OANDA:USD_SGD", r.SGD);

    const result = { pairs, base: "USD", date: data.date, timestamp: Date.now() };
    ratesCache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (err) {
    console.error("Frankfurter quotes error:", err);
    return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 });
  }
}
