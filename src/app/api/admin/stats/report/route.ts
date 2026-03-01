import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

    // ── USERS ──
    const { data: allUsers, count: totalUsers } = await service
      .from("profiles")
      .select("id, full_name, email, plan_id, subscription_status, created_at, last_sign_in_at, daily_scans_used, daily_chats_used, credits_balance", { count: "exact" });

    const activeUsers = allUsers?.filter(u => u.subscription_status === "active" && u.plan_id !== "free").length || 0;
    const planDist: Record<string, number> = {};
    const signupsByDay: Record<string, number> = {};
    allUsers?.forEach(u => {
      const plan = (u.subscription_status === "active" ? u.plan_id : "free") || "free";
      planDist[plan] = (planDist[plan] || 0) + 1;
      const day = u.created_at?.split("T")[0];
      if (day && day >= thirtyDaysAgo.split("T")[0]) signupsByDay[day] = (signupsByDay[day] || 0) + 1;
    });

    const recentLogins = allUsers?.filter(u => u.last_sign_in_at && u.last_sign_in_at >= sevenDaysAgo).length || 0;
    const topUsers = (allUsers || []).sort((a, b) => (b.daily_scans_used || 0) - (a.daily_scans_used || 0)).slice(0, 20).map(u => ({
      name: u.full_name || u.email, email: u.email, plan: u.plan_id || "free",
      scans: u.daily_scans_used || 0, credits: u.credits_balance || 0,
    }));

    // ── PAYMENTS ──
    const { data: allPayments } = await service.from("payments").select("*").order("created_at", { ascending: false });
    const completed = allPayments?.filter(p => p.status === "completed") || [];
    const pending = allPayments?.filter(p => p.status === "pending") || [];
    const failed = allPayments?.filter(p => p.status === "failed") || [];
    const reverted = allPayments?.filter(p => p.metadata?.reverted === true) || [];
    const totalRevenue = completed.reduce((s, p) => s + (p.amount_cents || 0), 0);
    const monthRevenue = completed.filter(p => p.completed_at && p.completed_at >= thirtyDaysAgo).reduce((s, p) => s + (p.amount_cents || 0), 0);

    const revenueByPlan: Record<string, { count: number; total: number }> = {};
    completed.forEach(p => {
      const plan = p.plan_id || "unknown";
      if (!revenueByPlan[plan]) revenueByPlan[plan] = { count: 0, total: 0 };
      revenueByPlan[plan].count++;
      revenueByPlan[plan].total += p.amount_cents || 0;
    });

    const revenueByDay: Record<string, number> = {};
    completed.forEach(p => {
      const day = (p.completed_at || p.created_at)?.split("T")[0];
      if (day && day >= thirtyDaysAgo.split("T")[0]) revenueByDay[day] = (revenueByDay[day] || 0) + (p.amount_cents || 0);
    });

    // Failed user recovery list
    const failedUserIds = [...new Set(failed.map(p => p.user_id))];
    const { data: failedProfiles } = await service.from("profiles").select("id, email, full_name")
      .in("id", failedUserIds.length > 0 ? failedUserIds : ["none"]);
    const failedUsersDetail = failed.slice(0, 20).map(p => {
      const prof = failedProfiles?.find(pr => pr.id === p.user_id);
      return { date: p.created_at, email: prof?.email || "?", name: prof?.full_name || "—", plan: p.plan_id, amount: p.amount_cents, status: p.status, recovery: p.recovery_email_sent_at ? "sent" : "pending" };
    });

    // Payment history
    const paymentUserIds = [...new Set((allPayments || []).slice(0, 50).map(p => p.user_id))];
    const { data: paymentProfiles } = await service.from("profiles").select("id, email, full_name")
      .in("id", paymentUserIds.length > 0 ? paymentUserIds : ["none"]);
    const paymentHistory = (allPayments || []).slice(0, 50).map(p => {
      const prof = paymentProfiles?.find(pr => pr.id === p.user_id);
      return { date: p.created_at, email: prof?.email || "?", name: prof?.full_name || "—", plan: p.plan_id, amount: p.amount_cents, status: p.status, method: p.metadata?.activation_method || "—" };
    });

    // ── AFFILIATES ──
    const { data: affiliates } = await service.from("affiliates").select("*, profiles(email, full_name)").order("total_earned_cents", { ascending: false });
    const affList = (affiliates || []).map(a => {
      const p: any = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
      return { code: a.ref_code, name: p?.full_name || "—", email: p?.email || "—", earned: a.total_earned_cents, paid: a.total_paid_cents, balance: (a.total_earned_cents || 0) - (a.total_paid_cents || 0), clicks: a.total_clicks, signups: a.total_signups, conversions: a.total_conversions };
    });

    // ── CLICK TRACKING ──
    let clickStats: Record<string, number> = {};
    try {
      const { data: events } = await service.from("visitor_events").select("event_type, source").gte("created_at", thirtyDaysAgo);
      (events || []).forEach(e => { const k = `${e.event_type}${e.source ? `:${e.source}` : ""}`; clickStats[k] = (clickStats[k] || 0) + 1; });
    } catch {}

    // ── PLAN VIEWS ──
    let planViews: Record<string, number> = {};
    let planClicks: Record<string, number> = {};
    try {
      const { data: planEvents } = await service.from("plan_analytics").select("plan_id, event").gte("created_at", thirtyDaysAgo);
      (planEvents || []).forEach(e => {
        if (e.event === "view") planViews[e.plan_id] = (planViews[e.plan_id] || 0) + 1;
        if (e.event === "click") planClicks[e.plan_id] = (planClicks[e.plan_id] || 0) + 1;
      });
    } catch {}

    // ── RETENTION ──
    const dayOldUsers = allUsers?.filter(u => u.created_at && u.created_at <= sevenDaysAgo) || [];
    const returnedUsers = dayOldUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at >= sevenDaysAgo).length;

    return NextResponse.json({
      generated: now.toISOString(),
      users: { total: totalUsers || 0, active: activeUsers, free: (totalUsers || 0) - activeUsers, planDistribution: planDist, signupsByDay, topUsers, recentLogins, weeklyActive: `${totalUsers ? ((recentLogins / totalUsers) * 100).toFixed(1) : 0}%`, retention: `${dayOldUsers.length > 0 ? ((returnedUsers / dayOldUsers.length) * 100).toFixed(1) : 0}%` },
      revenue: { total: `R${(totalRevenue / 100).toFixed(2)}`, month: `R${(monthRevenue / 100).toFixed(2)}`, byPlan: revenueByPlan, byDay: revenueByDay },
      payments: { total: allPayments?.length || 0, completed: completed.length, failed: failed.length, pending: pending.length, reverted: reverted.length, conversion: `${((completed.length / Math.max(1, allPayments?.length || 1)) * 100).toFixed(1)}%`, history: paymentHistory },
      failedRecovery: failedUsersDetail,
      affiliates: { total: affiliates?.length || 0, totalEarned: `R${((affiliates || []).reduce((s, a) => s + (a.total_earned_cents || 0), 0) / 100).toFixed(2)}`, outstanding: `R${(affList.reduce((s, a) => s + a.balance, 0) / 100).toFixed(2)}`, list: affList },
      planAnalytics: { views: planViews, clicks: planClicks },
      clickTracking: clickStats,
    });
  } catch (err) {
    console.error("[STATS:REPORT]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
