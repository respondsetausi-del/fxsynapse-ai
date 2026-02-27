import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { activatePayment, sweepPendingPayments } from "@/lib/payment-activate";

/**
 * Admin: Verify/activate pending payments.
 * POST { force: false } — Try Yoco API verification first
 * POST { force: true }  — Force-activate ALL pending (admin confirmed in Yoco dashboard)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    if (!force) {
      // Normal sweep — tries Yoco API first
      const result = await sweepPendingPayments();
      return NextResponse.json({
        message: `Checked ${result.checked}, activated ${result.activated}`,
        ...result,
      });
    }

    // FORCE mode — activate ALL pending payments (2min - 24h old)
    const { data: pending } = await service
      .from("payments")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!pending || pending.length === 0) {
      return NextResponse.json({ message: "No pending payments", activated: 0 });
    }

    let activated = 0;
    let expired = 0;
    const results: Array<{ id: string; user: string; plan: string; amount: number; status: string }> = [];

    for (const payment of pending) {
      const age = Date.now() - new Date(payment.created_at).getTime();

      // Expire abandoned (> 24h)
      if (age > 24 * 60 * 60 * 1000) {
        await service.from("payments").update({ status: "expired" }).eq("id", payment.id);
        expired++;
        results.push({ id: payment.id, user: payment.user_id, plan: payment.plan_id, amount: payment.amount_cents, status: "expired" });
        continue;
      }

      // Skip very recent (< 2 min) — give webhook a chance
      if (age < 2 * 60 * 1000) {
        results.push({ id: payment.id, user: payment.user_id, plan: payment.plan_id, amount: payment.amount_cents, status: "too_recent" });
        continue;
      }

      // Force activate
      const result = await activatePayment(payment.id, "admin_force");
      if (result.success && !result.alreadyCompleted) {
        activated++;
        results.push({ id: payment.id, user: payment.user_id, plan: payment.plan_id, amount: payment.amount_cents, status: "activated" });
      } else {
        results.push({ id: payment.id, user: payment.user_id, plan: payment.plan_id, amount: payment.amount_cents, status: result.alreadyCompleted ? "already_done" : "failed" });
      }
    }

    return NextResponse.json({
      message: `Force activated ${activated}, expired ${expired} out of ${pending.length} pending`,
      activated,
      expired,
      total: pending.length,
      results,
    });
  } catch (err) {
    console.error("[ADMIN:VERIFY] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
