import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { activatePayment, verifyAndActivate } from "@/lib/payment-activate";

/**
 * Payment Activation — Layer 2 (success page polling)
 * 
 * CRITICAL INSIGHT: If the user is on /payment/success, Yoco redirected them
 * there. Yoco ONLY redirects to successUrl after successful payment.
 * failureUrl is used for failed payments. So if they're here, they paid.
 * 
 * Flow:
 * 1. Check if webhook already activated it → return "activated"
 * 2. Try Yoco API verification → activate if "completed"
 * 3. If still pending after 6s (attempt >= 3), auto-activate
 *    (user is on success page = Yoco confirmed payment)
 * 4. Log activation method for audit trail
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Parse attempt count from client
    const body = await req.json().catch(() => ({}));
    const attempt = body.attempt || 0;

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ─── Check 1: Already active (webhook beat us) ───
    const { data: profile } = await service
      .from("profiles")
      .select("plan_id, subscription_status, credits_balance")
      .eq("id", user.id)
      .single();

    if (profile?.subscription_status === "active" && profile?.plan_id && profile.plan_id !== "free") {
      return NextResponse.json({
        status: "activated",
        plan: profile.plan_id,
        type: "subscription",
        method: "webhook_processed",
      });
    }

    // ─── Check 2: Recently completed payment ───
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentCompleted } = await service
      .from("payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("completed_at", tenMinAgo)
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    if (recentCompleted) {
      return NextResponse.json({
        status: "activated",
        plan: recentCompleted.plan_id,
        type: recentCompleted.type,
        method: "webhook_processed",
      });
    }

    // ─── Check 3: Pending payment — try to activate ───
    const { data: pendingPayment } = await service
      .from("payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!pendingPayment) {
      return NextResponse.json({ status: "no_pending_payment" });
    }

    const paymentAge = Date.now() - new Date(pendingPayment.created_at).getTime();
    const checkoutId = pendingPayment.yoco_checkout_id;

    // ─── Strategy A: Yoco API verify (if checkout has "completed" status) ───
    if (checkoutId) {
      const verified = await verifyAndActivate(pendingPayment.id, checkoutId);
      if (verified) {
        return NextResponse.json({
          status: "activated",
          plan: pendingPayment.plan_id,
          type: pendingPayment.type,
          method: "auto_verify",
        });
      }
    }

    // ─── Strategy B: Auto-activate from success page ───
    // If user has been polling for 6+ seconds (attempt >= 3) and payment
    // is recent (< 10 min), they ARE on the success page — Yoco confirmed it.
    // The webhook just didn't arrive. Activate now.
    if (attempt >= 3 && paymentAge < 10 * 60 * 1000) {
      console.log(`[ACTIVATE] Auto-activating payment ${pendingPayment.id} — user on success page, attempt ${attempt}, age ${Math.round(paymentAge / 1000)}s`);

      const result = await activatePayment(pendingPayment.id, "success_page");
      if (result.success) {
        return NextResponse.json({
          status: "activated",
          plan: pendingPayment.plan_id,
          type: pendingPayment.type,
          method: "success_page",
        });
      }
    }

    // ─── Still processing — tell client to keep polling ───
    return NextResponse.json({
      status: paymentAge > 5 * 60 * 1000 ? "processing_delayed" : "processing",
      message: attempt < 3
        ? "Confirming payment..."
        : "Almost there — activating your plan...",
    });

  } catch (error) {
    console.error("[ACTIVATE] Error:", error);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
