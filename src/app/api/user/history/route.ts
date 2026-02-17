import { NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: scans } = await service
      .from("scans")
      .select("id, pair, timeframe, bias, confidence, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ scans: scans || [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
