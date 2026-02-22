import { NextRequest, NextResponse } from "next/server";

const RESOLUTIONS: Record<string, string> = {
  "1": "1",
  "5": "5",
  "15": "15",
  "30": "30",
  "60": "60",
  "D": "D",
  "W": "W",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "OANDA:EUR_USD";
  const resolution = searchParams.get("resolution") || "60";
  const count = parseInt(searchParams.get("count") || "200");

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  const res_key = RESOLUTIONS[resolution] || "60";

  // Calculate from/to timestamps
  const to = Math.floor(Date.now() / 1000);
  let barSeconds = 3600; // default 1H
  if (res_key === "1") barSeconds = 60;
  else if (res_key === "5") barSeconds = 300;
  else if (res_key === "15") barSeconds = 900;
  else if (res_key === "30") barSeconds = 1800;
  else if (res_key === "60") barSeconds = 3600;
  else if (res_key === "D") barSeconds = 86400;
  else if (res_key === "W") barSeconds = 604800;

  const from = to - (count * barSeconds);

  try {
    const url = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(symbol)}&resolution=${res_key}&from=${from}&to=${to}&token=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 60 } });

    if (!res.ok) {
      return NextResponse.json({ error: "Finnhub API error" }, { status: res.status });
    }

    const data = await res.json();

    if (data.s === "no_data" || !data.c) {
      return NextResponse.json({ candles: [], symbol, resolution: res_key });
    }

    // Transform to array of candle objects
    const candles = data.t.map((time: number, i: number) => ({
      time: time,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v?.[i] || 0,
    }));

    return NextResponse.json({
      candles,
      symbol,
      resolution: res_key,
      count: candles.length,
    });
  } catch (err) {
    console.error("Candles fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch candles" }, { status: 500 });
  }
}
