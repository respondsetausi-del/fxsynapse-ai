import { NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();

    // Verify admin
    const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [usersRes, scansToday, scansTotal, paymentsMonth, planDist] = await Promise.all([
      service.from("profiles").select("id", { count: "exact", head: true }),
      service.from("scans").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      service.from("scans").select("id", { count: "exact", head: true }),
      service.from("payments").select("amount_cents").eq("status", "completed").gte("created_at", monthStart.toISOString()),
      service.from("profiles").select("plan_id"),
    ]);

    const revenueMonth = (paymentsMonth.data || []).reduce((sum, p) => sum + p.amount_cents, 0);
    const plans: Record<string, number> = {};
    (planDist.data || []).forEach((p) => { plans[p.plan_id] = (plans[p.plan_id] || 0) + 1; });

    return NextResponse.json({
      totalUsers: usersRes.count || 0,
      scansToday: scansToday.count || 0,
      scansTotal: scansTotal.count || 0,
      revenueMonth,
      planDistribution: plans,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
