import { NextRequest, NextResponse } from "next/server";
import { runSignalScan } from "@/lib/signal-engine";

export const maxDuration = 300; // 5 min max for full scan

export async function POST(req: NextRequest) {
  try {
    // Build base URL from request
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const body = await req.json().catch(() => ({}));
    const pairs = body.pairs; // optional override
    const timeframes = body.timeframes; // optional override

    const result = await runSignalScan(baseUrl, {
      pairs,
      timeframes,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
