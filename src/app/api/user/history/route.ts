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

    // Free users: only last 3 scans. Paid: full history
    const historyLimit = profile?.plan_id === "free" ? 3 : 50;

    const { data: scans } = await service
      .from("scans")
      .select("id, pair, timeframe, bias, confidence, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(historyLimit);

    let totalCount = scans?.length || 0;
    if (profile?.plan_id === "free") {
      const { count } = await service
        .from("scans")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      totalCount = count || 0;
    }

    return NextResponse.json({
      scans: scans || [],
      totalCount,
      isLimited: profile?.plan_id === "free" && totalCount > 3,
      hiddenCount: profile?.plan_id === "free" ? Math.max(0, totalCount - 3) : 0,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
