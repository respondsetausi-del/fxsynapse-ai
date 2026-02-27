import { NextRequest, NextResponse } from "next/server";
import { runSignalScan } from "@/lib/signal-engine";
import { getAuthUserId, getUserUsage, incrementScanUsage } from "@/lib/usage";

export const maxDuration = 300; // 5 min max for full scan

const FULL_SCAN_TIERS = new Set(["pro", "unlimited"]);

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in to run scans." }, { status: 401 });
    }

    // 2. Check tier — Pro+ only
    const usage = await getUserUsage(userId);
    if (!FULL_SCAN_TIERS.has(usage.planId)) {
      return NextResponse.json({
        error: "Full market scan requires Pro (R349/mo) or Unlimited.",
        upgrade: true,
      }, { status: 403 });
    }

    // 3. Usage check
    if (!usage.canScan) {
      return NextResponse.json({
        error: usage.scanReason || "Scan limit reached.",
        usage,
        upgrade: true,
      }, { status: 429 });
    }

    // 4. Run full scan
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const body = await req.json().catch(() => ({}));

    const result = await runSignalScan(baseUrl, {
      pairs: body.pairs,
      timeframes: body.timeframes,
    });

    // 5. Increment usage by number of successful signals
    const count = result.signalsGenerated || 1;
    for (let i = 0; i < count; i++) {
      await incrementScanUsage(userId, false);
    }

    // 6. Return with updated usage
    const updated = await getUserUsage(userId);
    return NextResponse.json({ ...result, usage: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
