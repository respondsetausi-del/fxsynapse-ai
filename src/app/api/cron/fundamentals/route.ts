import { NextRequest, NextResponse } from "next/server";
import { sweepPendingPayments } from "@/lib/payment-activate";

// Vercel Cron hits this endpoint 2x daily
// Configured in vercel.json
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hour = new Date().getUTCHours();
    const session = hour < 14 ? "morning" : "evening";

    // 1. Refresh calendar data (free — no API cost)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : "http://localhost:3000";

    await fetch(`${baseUrl}/api/fundamentals/calendar?refresh=true&range=week`);

    // 2. Sweep pending payments — Layer 3 recovery (no Anthropic API, just Yoco verify)
    let sweepResult = { checked: 0, activated: 0 };
    try {
      sweepResult = await sweepPendingPayments();
      console.log(`[CRON] Payment sweep: ${sweepResult.checked} checked, ${sweepResult.activated} activated`);
    } catch (err) {
      console.error("[CRON] Payment sweep error:", err);
    }

    // 3. AI Brief generation DISABLED to save API costs
    // Uncomment when ready to re-enable:
    // const briefRes = await fetch(`${baseUrl}/api/fundamentals/brief`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ session, adminKey: cronSecret || "admin" }),
    // });

    return NextResponse.json({
      success: true,
      session,
      brief: "disabled — admin can generate manually",
      payments: sweepResult,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
