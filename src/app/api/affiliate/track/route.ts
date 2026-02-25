import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

// POST — track a click on affiliate ref link
export async function POST(req: NextRequest) {
  try {
    const { refCode } = await req.json();
    if (!refCode) return NextResponse.json({ valid: false });

    const service = createServiceSupabase();
    const { data: affiliate } = await service
      .from("affiliates")
      .select("id, total_clicks, status")
      .eq("ref_code", refCode)
      .eq("status", "active")
      .single();

    if (!affiliate) {
      return NextResponse.json({ valid: false });
    }

    // Increment click count
    await service
      .from("affiliates")
      .update({ total_clicks: (affiliate.total_clicks || 0) + 1 })
      .eq("id", affiliate.id);

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
