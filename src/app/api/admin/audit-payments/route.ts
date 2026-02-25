import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { verifyYocoPayment } from "@/lib/yoco-verify";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) return NextResponse.json({ error: "YOCO_SECRET_KEY not configured" }, { status: 500 });

    const { fix } = await req.json().catch(() => ({ fix: false }));

    // Get ALL completed payments
    const { data: completed } = await service
      .from("payments")
      .select("*")
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (!completed || completed.length === 0) {
      return NextResponse.json({ message: "No completed payments found", total: 0 });
    }

    let reallyPaid = 0;
    let notPaid = 0;
    let errors = 0;
    const results: Array<{
      id: string;
      email: string;
      plan: string;
      amount: number;
      yocoStatus: string;
      paymentStatus: string;
      verdict: string;
    }> = [];

    for (const payment of completed) {
      const checkoutId = payment.yoco_checkout_id;
      if (!checkoutId) {
        results.push({
          id: payment.id, email: "?", plan: payment.plan_id || "topup",
          amount: (payment.amount_cents || 0) / 100, yocoStatus: "no_checkout_id",
          paymentStatus: "unknown", verdict: "unknown",
        });
        continue;
      }

      try {
        // Use proper payment-level verification (not just checkout status!)
        const verification = await verifyYocoPayment(checkoutId, yocoKey);

        const { data: profile } = await service
          .from("profiles")
          .select("email, display_name")
          .eq("id", payment.user_id)
          .single();

        const email = profile?.email || "?";

        if (verification.paid) {
          reallyPaid++;
          results.push({
            id: payment.id, email, plan: payment.plan_id || "topup",
            amount: (payment.amount_cents || 0) / 100,
            yocoStatus: verification.checkoutStatus,
            paymentStatus: verification.checkoutStatus,
            verdict: "REAL",
          });
        } else {
          notPaid++;

          if (fix) {
            // Revert payment to failed
            await service.from("payments").update({
              status: "failed",
            }).eq("id", payment.id);

            // Downgrade user to free if this was a subscription
            if (payment.type === "subscription") {
              // Check if user has any OTHER real completed payments still
              const { data: otherPayments } = await service
                .from("payments")
                .select("id")
                .eq("user_id", payment.user_id)
                .eq("status", "completed")
                .neq("id", payment.id);

              // Only downgrade if they have no other completed payments
              if (!otherPayments || otherPayments.length === 0) {
                await service.from("profiles").update({
                  plan_id: "free",
                  subscription_status: "none",
                  subscription_expires_at: null,
                }).eq("id", payment.user_id);
              }
            }
          }

          results.push({
            id: payment.id, email, plan: payment.plan_id || "topup",
            amount: (payment.amount_cents || 0) / 100,
            yocoStatus: verification.checkoutStatus,
            paymentStatus: verification.checkoutStatus,
            verdict: fix ? "FAKE_REVERTED" : "FAKE",
          });
        }

        // Rate limit Yoco API calls
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        errors++;
        results.push({
          id: payment.id, email: "?", plan: payment.plan_id || "topup",
          amount: (payment.amount_cents || 0) / 100, yocoStatus: String(err),
          paymentStatus: "error", verdict: "error",
        });
      }
    }

    const realRevenue = results.filter(r => r.verdict === "REAL").reduce((sum, r) => sum + r.amount, 0);
    const fakeRevenue = results.filter(r => r.verdict.includes("FAKE")).reduce((sum, r) => sum + r.amount, 0);

    return NextResponse.json({
      total: completed.length, reallyPaid, notPaid, errors,
      realRevenue: `R${realRevenue}`, fakeRevenue: `R${fakeRevenue}`, fixed: fix, results,
    });
  } catch (err) {
    console.error("[AUDIT] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
