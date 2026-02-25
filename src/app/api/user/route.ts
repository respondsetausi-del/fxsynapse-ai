import { NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { checkCredits } from "@/lib/credits";

export async function GET() {
  try {
    // Auth check with anon client
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch profile with service role (bypasses RLS)
    const service = createServiceSupabase();
    const { data: profile } = await service
      .from("profiles")
      .select("*, plans(name, daily_scans, monthly_scans, price_cents)")
      .eq("id", user.id)
      .single();

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Update last_seen_at for activity tracking (fire and forget)
    service.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id).then(() => {});

    const credits = await checkCredits(user.id);

    return NextResponse.json({
      profile,
      credits: {
        ...credits,
        // backwards compat for dashboard
        dailyRemaining: credits.monthlyRemaining,
        creditsBalance: credits.topupBalance,
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
