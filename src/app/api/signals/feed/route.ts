import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getUserTierInfo, getSignalVisibility, getSmartMoneyVisibility, canViewAiReasoning, canViewSignalTrackRecord } from "@/lib/tier-gates";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
        },
      }
    );

    // Get user
    const { data: { user } } = await supabase.auth.getUser();

    // Get user profile (or default to free)
    let planId = "free";
    let subStatus = null as string | null;

    if (user) {
      const service = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: profile } = await service
        .from("profiles")
        .select("plan_id, subscription_status")
        .eq("id", user.id)
        .single();

      if (profile) {
        planId = profile.plan_id || "free";
        subStatus = profile.subscription_status;
      }
    }

    const tierInfo = getUserTierInfo(planId, subStatus);
    const smcAccess = getSmartMoneyVisibility(tierInfo);
    const showReasoning = canViewAiReasoning(tierInfo);

    // Fetch signals from DB (service role to bypass RLS)
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const symbol = searchParams.get("symbol");
    const grade = searchParams.get("grade");

    let query = service
      .from("ai_signals")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (symbol) query = query.eq("symbol", symbol);
    if (grade) query = query.eq("grade", grade);

    const { data: signals, error } = await query;

    if (error) {
      console.error("[FEED] DB error:", error);
      return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 });
    }

    // Apply tier-based filtering
    const now = Date.now();
    const filteredSignals = (signals || []).map((s: any) => {
      const signalGrade = s.grade as "A" | "B" | "C" | "D";
      const visibility = getSignalVisibility(tierInfo, signalGrade);
      const delayMs = tierInfo.tier.limits.signalDelay * 60 * 1000;
      const signalAge = now - new Date(s.created_at).getTime();
      const isDelayed = delayMs > 0 && signalAge < delayMs;

      // Base signal (always visible)
      const base = {
        id: s.id,
        symbol: s.symbol,
        displaySymbol: s.display_symbol,
        timeframe: s.timeframe,
        direction: s.direction,
        confidence: s.confidence,
        grade: s.grade,
        status: s.status,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        visibility, // "full" | "delayed" | "blurred"
      };

      // Blurred — only show direction + confidence
      if (visibility === "blurred") {
        return {
          ...base,
          entryPrice: null,
          stopLoss: null,
          takeProfit1: null,
          takeProfit2: null,
          riskReward: null,
          trend: s.trend, // Trend is free — teaser
          structure: null,
          smartMoney: null,
          confluences: null,
          reasoning: null,
          indicators: null,
          keyLevels: null,
          newsRisk: null,
        };
      }

      // Delayed — show everything but mark as delayed if too fresh
      if (visibility === "delayed" && isDelayed) {
        return {
          ...base,
          visibility: "delayed" as const,
          delayRemaining: Math.ceil((delayMs - signalAge) / 60000), // minutes
          entryPrice: null,
          stopLoss: null,
          takeProfit1: null,
          takeProfit2: null,
          riskReward: null,
          trend: s.trend,
          structure: s.structure,
          smartMoney: smcAccess === "locked" ? null : smcAccess === "basic" ? { orderBlocks: s.smart_money?.orderBlocks || [], liquidityLevels: [], fvgs: [], supplyDemand: [] } : s.smart_money,
          confluences: s.confluences,
          reasoning: showReasoning ? s.reasoning : null,
          indicators: s.indicators,
          keyLevels: null,
          newsRisk: s.news_risk,
        };
      }

      // Full access
      return {
        ...base,
        entryPrice: s.entry_price,
        stopLoss: s.stop_loss,
        takeProfit1: s.take_profit_1,
        takeProfit2: s.take_profit_2,
        riskReward: s.risk_reward,
        trend: s.trend,
        structure: s.structure,
        smartMoney: smcAccess === "locked" ? null : smcAccess === "basic" ? { orderBlocks: s.smart_money?.orderBlocks || [], liquidityLevels: [], fvgs: [], supplyDemand: [] } : s.smart_money,
        confluences: s.confluences,
        reasoning: showReasoning ? s.reasoning : null,
        indicators: s.indicators,
        keyLevels: s.key_levels,
        newsRisk: s.news_risk,
        pipsResult: s.pips_result,
      };
    });

    // Fetch track record if user has access
    let trackRecord = null;
    if (canViewSignalTrackRecord(tierInfo)) {
      const { data: perf } = await service
        .from("signal_performance")
        .select("*")
        .limit(20);
      trackRecord = perf;
    }

    return NextResponse.json({
      signals: filteredSignals,
      total: filteredSignals.length,
      tier: tierInfo.planId,
      trackRecord,
    });

  } catch (err: any) {
    console.error("[FEED] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
