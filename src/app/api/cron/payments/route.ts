import { NextRequest, NextResponse } from "next/server";
import { sweepPendingPayments } from "@/lib/payment-activate";

/**
 * Payment Sweep Cron — Layer 3
 * 
 * Runs every 5 minutes via Vercel Cron.
 * Catches any payment that slipped through both webhook (Layer 1)
 * and success page auto-activate (Layer 2).
 * 
 * Also expires payments older than 24h (abandoned checkouts).
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await sweepPendingPayments();

    console.log(`[CRON:PAYMENTS] Sweep complete: ${result.checked} checked, ${result.activated} activated`);

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON:PAYMENTS] Error:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
