import { NextRequest, NextResponse } from "next/server";
import { scanSinglePair } from "@/lib/signal-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const body = await req.json();
    const { symbol, displaySymbol, timeframe } = body;

    if (!symbol || !displaySymbol || !timeframe) {
      return NextResponse.json({ error: "Missing: symbol, displaySymbol, timeframe" }, { status: 400 });
    }

    const signal = await scanSinglePair(baseUrl, symbol, displaySymbol, timeframe);

    return NextResponse.json({ signal });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
