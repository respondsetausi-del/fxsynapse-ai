import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase, requireAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "0");
    const limit = 30;

    // Get scans with user info
    const { data: scans, count } = await supabase
      .from("scans")
      .select(`
        id, pair, timeframe, trend, bias, confidence, analysis,
        chart_image_url, share_id, credit_source, created_at, user_id,
        profiles!inner(email, full_name, plan_id)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    return NextResponse.json({
      scans: scans || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error("Admin scans error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
