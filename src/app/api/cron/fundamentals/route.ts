import { NextRequest, NextResponse } from "next/server";

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

    // 1. Refresh calendar data
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : "http://localhost:3000";

    await fetch(`${baseUrl}/api/fundamentals/calendar?refresh=true&range=week`);

    // 2. Generate AI brief
    const briefRes = await fetch(`${baseUrl}/api/fundamentals/brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, adminKey: cronSecret || "admin" }),
    });

    const result = await briefRes.json();

    return NextResponse.json({
      success: true,
      session,
      ...result,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
