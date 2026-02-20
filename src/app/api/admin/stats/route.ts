import { NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [usersRes, scansToday, scansTotal, scansWeek, activeToday] = await Promise.all([
      service.from("profiles").select("id", { count: "exact", head: true }),
      service.from("scans").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      service.from("scans").select("id", { count: "exact", head: true }),
      service.from("scans").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
      service.from("profiles").select("id", { count: "exact", head: true }).gte("last_seen_at", today.toISOString()),
    ]);

    const [paymentsThisMonth, paymentsLastMonth] = await Promise.all([
      service.from("payments").select("amount_cents").eq("status", "completed").gte("created_at", monthStart.toISOString()),
      service.from("payments").select("amount_cents").eq("status", "completed").gte("created_at", lastMonthStart.toISOString()).lte("created_at", lastMonthEnd.toISOString()),
    ]);

    const revenueMonth = (paymentsThisMonth.data || []).reduce((s, p) => s + p.amount_cents, 0);
    const revenueLastMonth = (paymentsLastMonth.data || []).reduce((s, p) => s + p.amount_cents, 0);

    const { data: planDist } = await service.from("profiles").select("plan_id, is_blocked");
    const plans: Record<string, number> = {};
    let blockedCount = 0;
    (planDist || []).forEach((p) => {
      plans[p.plan_id] = (plans[p.plan_id] || 0) + 1;
      if (p.is_blocked) blockedCount++;
    });

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const { data: revenueDaily } = await service.from("payments").select("amount_cents, created_at").eq("status", "completed").gte("created_at", thirtyDaysAgo.toISOString()).order("created_at", { ascending: true });
    const revByDay: Record<string, number> = {};
    (revenueDaily || []).forEach((p) => { const d = new Date(p.created_at).toISOString().split("T")[0]; revByDay[d] = (revByDay[d] || 0) + p.amount_cents; });

    const { data: signupsDaily } = await service.from("profiles").select("created_at").gte("created_at", thirtyDaysAgo.toISOString()).order("created_at", { ascending: true });
    const sigByDay: Record<string, number> = {};
    (signupsDaily || []).forEach((p) => { const d = new Date(p.created_at).toISOString().split("T")[0]; sigByDay[d] = (sigByDay[d] || 0) + 1; });

    const { data: scansDaily } = await service.from("scans").select("created_at").gte("created_at", thirtyDaysAgo.toISOString()).order("created_at", { ascending: true });
    const scnByDay: Record<string, number> = {};
    (scansDaily || []).forEach((s) => { const d = new Date(s.created_at).toISOString().split("T")[0]; scnByDay[d] = (scnByDay[d] || 0) + 1; });

    const chartDays = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      chartDays.push({ date: key, label: d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }), revenue: revByDay[key] || 0, signups: sigByDay[key] || 0, scans: scnByDay[key] || 0 });
    }

    const { data: activeUsers7d } = await service.from("scans").select("user_id").gte("created_at", weekAgo.toISOString());
    const uniqueActive7d = new Set((activeUsers7d || []).map((s) => s.user_id)).size;
    const { data: everScanned } = await service.from("scans").select("user_id");
    const uniqueEverScanned = new Set((everScanned || []).map((s) => s.user_id)).size;

    const { data: activeLastMonth } = await service.from("scans").select("user_id").gte("created_at", lastMonthStart.toISOString()).lte("created_at", lastMonthEnd.toISOString());
    const activeLastMonthSet = new Set((activeLastMonth || []).map((s) => s.user_id));
    const { data: activeThisMonth } = await service.from("scans").select("user_id").gte("created_at", monthStart.toISOString());
    const activeThisMonthSet = new Set((activeThisMonth || []).map((s) => s.user_id));

    let churned = 0;
    activeLastMonthSet.forEach((uid) => { if (!activeThisMonthSet.has(uid)) churned++; });

    const retentionRate = uniqueEverScanned > 0 ? Math.round((uniqueActive7d / uniqueEverScanned) * 100) : 0;
    const churnRate = activeLastMonthSet.size > 0 ? Math.round((churned / activeLastMonthSet.size) * 100) : 0;

    const newThisMonth = await service.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString());
    const newLastMonth = await service.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", lastMonthStart.toISOString()).lte("created_at", lastMonthEnd.toISOString());

    const totalPaid = (plans.pro || 0) + (plans.premium || 0);
    const totalUsers = usersRes.count || 0;
    const conversionRate = totalUsers > 0 ? Math.round((totalPaid / totalUsers) * 100) : 0;

    const { data: allPayments } = await service.from("payments").select("amount_cents").eq("status", "completed");
    const revenueAllTime = (allPayments || []).reduce((s, p) => s + p.amount_cents, 0);

    return NextResponse.json({
      totalUsers, scansToday: scansToday.count || 0, scansTotal: scansTotal.count || 0, scansWeek: scansWeek.count || 0, activeToday: activeToday.count || 0,
      revenueMonth, revenueLastMonth, revenueAllTime, planDistribution: plans, blockedCount, chartDays,
      retentionRate, churnRate, churned, uniqueActive7d, uniqueEverScanned,
      newUsersThisMonth: newThisMonth.count || 0, newUsersLastMonth: newLastMonth.count || 0,
      conversionRate, totalPaid,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
