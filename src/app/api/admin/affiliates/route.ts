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

    const tab = req.nextUrl.searchParams.get("tab") || "overview";

    if (tab === "overview") {
      // All affiliates with profile info
      const { data: affiliates } = await service
        .from("affiliates")
        .select("*, profiles:user_id(email, full_name, plan_id)")
        .order("total_earned_cents", { ascending: false });

      // Summary stats
      const totalAffiliates = (affiliates || []).length;
      const activeAffiliates = (affiliates || []).filter(a => a.status === "active").length;
      const totalEarned = (affiliates || []).reduce((s, a) => s + a.total_earned_cents, 0);
      const totalPaid = (affiliates || []).reduce((s, a) => s + a.total_paid_cents, 0);
      const totalClicks = (affiliates || []).reduce((s, a) => s + a.total_clicks, 0);
      const totalSignups = (affiliates || []).reduce((s, a) => s + a.total_signups, 0);
      const totalConversions = (affiliates || []).reduce((s, a) => s + a.total_conversions, 0);

      return NextResponse.json({
        affiliates: affiliates || [],
        stats: {
          totalAffiliates,
          activeAffiliates,
          totalEarned,
          totalPaid,
          totalOutstanding: totalEarned - totalPaid,
          totalClicks,
          totalSignups,
          totalConversions,
          conversionRate: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 100) : 0,
        },
      });
    }

    if (tab === "referrals") {
      const { data: referrals } = await service
        .from("referrals")
        .select("*, affiliates(ref_code, profiles:user_id(email, full_name)), profiles:referred_user_id(email, full_name, plan_id, subscription_status)")
        .order("signed_up_at", { ascending: false })
        .limit(100);

      return NextResponse.json({ referrals: referrals || [] });
    }

    if (tab === "earnings") {
      const { data: earnings } = await service
        .from("affiliate_earnings")
        .select("*, affiliates(ref_code, profiles:user_id(email, full_name))")
        .order("created_at", { ascending: false })
        .limit(100);

      return NextResponse.json({ earnings: earnings || [] });
    }

    if (tab === "payouts") {
      const { data: payouts } = await service
        .from("affiliate_payouts")
        .select("*, affiliates(ref_code, profiles:user_id(email, full_name))")
        .order("requested_at", { ascending: false })
        .limit(100);

      return NextResponse.json({ payouts: payouts || [] });
    }

    return NextResponse.json({ error: "Invalid tab" }, { status: 400 });
  } catch (error) {
    console.error("Admin affiliates error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST — admin actions: approve/reject payouts, suspend affiliates, update commission
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    if (action === "approve_payout") {
      const { payoutId } = body;
      const { data: payout } = await service
        .from("affiliate_payouts")
        .select("*")
        .eq("id", payoutId)
        .single();

      if (!payout || payout.status !== "pending") {
        return NextResponse.json({ error: "Invalid payout" }, { status: 400 });
      }

      // Mark payout as completed
      await service.from("affiliate_payouts").update({
        status: "completed",
        paid_at: new Date().toISOString(),
      }).eq("id", payoutId);

      // Update affiliate total_paid
      const { data: aff } = await service
        .from("affiliates")
        .select("total_paid_cents")
        .eq("id", payout.affiliate_id)
        .single();

      await service.from("affiliates").update({
        total_paid_cents: (aff?.total_paid_cents || 0) + payout.amount_cents,
      }).eq("id", payout.affiliate_id);

      // Mark related earnings as paid
      await service.from("affiliate_earnings").update({ status: "paid" })
        .eq("affiliate_id", payout.affiliate_id)
        .in("status", ["pending", "approved"]);

      return NextResponse.json({ success: true });
    }

    if (action === "reject_payout") {
      const { payoutId, reason } = body;
      await service.from("affiliate_payouts").update({
        status: "rejected",
        admin_notes: reason || "Rejected by admin",
      }).eq("id", payoutId);

      return NextResponse.json({ success: true });
    }

    if (action === "suspend_affiliate") {
      const { affiliateId } = body;
      await service.from("affiliates").update({ status: "suspended" }).eq("id", affiliateId);
      return NextResponse.json({ success: true });
    }

    if (action === "activate_affiliate") {
      const { affiliateId } = body;
      await service.from("affiliates").update({ status: "active" }).eq("id", affiliateId);
      return NextResponse.json({ success: true });
    }

    if (action === "update_commission") {
      const { affiliateId, rate } = body;
      const r = Math.max(0.05, Math.min(0.50, parseFloat(rate)));
      await service.from("affiliates").update({ commission_rate: r }).eq("id", affiliateId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Admin affiliate action error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
