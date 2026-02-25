import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { processReferralSignup } from "@/lib/affiliate";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { refCode } = await req.json();
    if (!refCode) return NextResponse.json({ error: "No ref code" }, { status: 400 });

    await processReferralSignup(user.id, refCode);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register referral error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
