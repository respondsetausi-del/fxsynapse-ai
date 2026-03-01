import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

// GET /api/scan?id=SHARE_ID
// Returns scan data, with sensitive fields stripped for non-paid users
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shareId = url.searchParams.get("id");
    
    if (!shareId) {
      return NextResponse.json({ error: "Missing scan ID" }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    // Fetch scan by share_id
    const { data: scan } = await supabase
      .from("scans")
      .select("id, share_id, pair, timeframe, trend, bias, confidence, analysis, chart_image_url, created_at, user_id")
      .eq("share_id", shareId)
      .single();

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Fetch scan owner's name
    const { data: scanOwner } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", scan.user_id)
      .single();
    const ownerName = scanOwner?.full_name || "FXSynapse Trader";

    // Check if current user is paid
    let isPaid = false;
    let isOwner = false;
    
    try {
      const { createServerSupabase } = await import("@/lib/supabase/server");
      const client = await createServerSupabase();
      const { data: { user } } = await client.auth.getUser();
      
      if (user) {
        isOwner = user.id === scan.user_id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("subscription_status, plan_id")
          .eq("id", user.id)
          .single();
        
        isPaid = profile?.subscription_status === "active" && profile?.plan_id !== "free";
      }
    } catch {
      // Not authenticated — that's fine, they see blurred version
    }

    const analysis = scan.analysis as Record<string, unknown>;
    const showFull = isPaid || isOwner;

    // Build response — strip sensitive fields for non-paid, non-owner viewers
    const publicAnalysis: Record<string, unknown> = {
      pair: analysis.pair,
      timeframe: analysis.timeframe,
      trend: analysis.trend,
      bias: analysis.bias,
      structure: analysis.structure,
      confidence: analysis.confidence,
      annotations: analysis.annotations,
      chart_bounds: analysis.chart_bounds,
    };

    if (showFull) {
      // Full access — include everything
      Object.assign(publicAnalysis, {
        entry_price: analysis.entry_price,
        entry_zone: analysis.entry_zone,
        take_profit: analysis.take_profit,
        stop_loss: analysis.stop_loss,
        risk_reward: analysis.risk_reward,
        support: analysis.support,
        resistance: analysis.resistance,
        all_levels: analysis.all_levels,
        overview: analysis.overview,
        ema_status: analysis.ema_status,
        volume: analysis.volume,
        confluences: analysis.confluences,
        reasoning: analysis.reasoning,
      });
    }

    return NextResponse.json({
      scan: {
        shareId: scan.share_id,
        pair: scan.pair,
        timeframe: scan.timeframe,
        trend: scan.trend,
        bias: scan.bias,
        confidence: scan.confidence,
        chartImageUrl: scan.chart_image_url,
        createdAt: scan.created_at,
        ownerName,
      },
      analysis: publicAnalysis,
      access: showFull ? "full" : "limited",
      isOwner,
    });
  } catch (error) {
    console.error("Public scan error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
