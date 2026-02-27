import { NextRequest, NextResponse } from "next/server";
import { scanSinglePair } from "@/lib/signal-engine";
import { getAuthUserId, getUserUsage, incrementScanUsage } from "@/lib/usage";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in to scan signals." }, { status: 401 });
    }

    // 2. Usage check
    const usage = await getUserUsage(userId);
    if (!usage.canScan) {
      return NextResponse.json({
        error: usage.scanReason || "Scan limit reached. Upgrade for more.",
        usage,
        upgrade: true,
      }, { status: 429 });
    }

    // 3. Validate input
    const body = await req.json();
    const { symbol, displaySymbol, timeframe } = body;
    if (!symbol || !displaySymbol || !timeframe) {
      return NextResponse.json({ error: "Missing: symbol, displaySymbol, timeframe" }, { status: 400 });
    }

    // 4. Run scan
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const signal = await scanSinglePair(baseUrl, symbol, displaySymbol, timeframe);

    // 5. Increment usage (topup if daily limit hit but has credits)
    await incrementScanUsage(userId, usage.canScanViaTopup);

    // 6. Return signal + updated usage
    const updated = await getUserUsage(userId);
    return NextResponse.json({ signal, usage: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
