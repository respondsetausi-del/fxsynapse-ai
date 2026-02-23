import { NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();

    // Get user plan
    const { data: profile } = await service
      .from("profiles")
      .select("plan_id")
      .eq("id", user.id)
      .single();

    // All paid users get full history (starter gets 30, pro/premium get 50)
    const historyLimit = profile?.plan_id === "starter" ? 30 : 50;

    const { data: scans } = await service
      .from("scans")
      .select("id, pair, timeframe, bias, confidence, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(historyLimit);

    return NextResponse.json({
      scans: scans || [],
      totalCount: scans?.length || 0,
      isLimited: false,
      hiddenCount: 0,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
