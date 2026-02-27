import { NextRequest, NextResponse } from "next/server";
import { executeTrade } from "@/lib/puppeteer-trader";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, symbol, type, lots, sl, tp } = body;

    if (!sessionId || !symbol || !type || !lots) {
      return NextResponse.json({ error: "Missing required fields: sessionId, symbol, type, lots" }, { status: 400 });
    }

    if (!["BUY", "SELL"].includes(type)) {
      return NextResponse.json({ error: "type must be BUY or SELL" }, { status: 400 });
    }

    const result = await executeTrade({
      sessionId,
      symbol,
      type,
      lots: parseFloat(lots),
      sl: sl ? parseFloat(sl) : undefined,
      tp: tp ? parseFloat(tp) : undefined,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
