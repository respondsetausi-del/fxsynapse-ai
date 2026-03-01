import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verifyAndActivate } from "@/lib/payment-activate";

/**
 * Payment Activation — Layer 2 (success page polling)
 *
 * Called by /payment/success every 2s after redirect from Yoco.
 *
 * FLOW:
 *   1. Check if profile already shows active subscription → done
 *   2. Check if a recently completed payment exists → done
 *   3. Find pending payment → verify with Yoco API → activate if confirmed
 *   4. Not confirmed yet → tell client to keep polling
 *
 * NEVER blindly activates. Only two paths to activation:
 *   - Webhook already did it (checks 1 & 2)
 *   - Yoco API confirms "completed" (check 3)
 */

function log(action: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), sys: "ACTIVATE", action, ...data }));
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const attempt = body.attempt || 0;

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ─── Check 1: Profile already active (webhook beat us) ───
    const { data: profile } = await service
      .from("profiles")
      .select("plan_id, subscription_status")
      .eq("id", user.id)
      .single();

    if (profile?.subscription_status === "active" && profile?.plan_id && profile.plan_id !== "free") {
      log("ALREADY_ACTIVE", { userId: user.id, plan: profile.plan_id });
      return NextResponse.json({ status: "activated", plan: profile.plan_id, type: "subscription", method: "webhook_processed" });
    }

    // ─── Check 2: Recently completed payment (webhook processed) ───
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentCompleted } = await service
      .from("payments")
      .select("plan_id, type, credits_amount")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("completed_at", tenMinAgo)
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    if (recentCompleted) {
      log("RECENTLY_COMPLETED", { userId: user.id, plan: recentCompleted.plan_id, type: recentCompleted.type });
      return NextResponse.json({
        status: "activated",
        plan: recentCompleted.plan_id,
        type: recentCompleted.type,
        credits: recentCompleted.credits_amount,
        method: "webhook_processed",
      });
    }

    // ─── Check 3: Find pending payment → verify with Yoco ───
    const { data: pendingPayment } = await service
      .from("payments")
      .select("id, yoco_checkout_id, plan_id, type, created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!pendingPayment) {
      log("NO_PENDING", { userId: user.id, attempt });
      return NextResponse.json({ status: "no_pending_payment" });
    }

    const checkoutId = pendingPayment.yoco_checkout_id;
    const paymentAge = Date.now() - new Date(pendingPayment.created_at).getTime();

    // Only verify if we have a checkout ID
    if (checkoutId) {
      log("VERIFYING", { userId: user.id, paymentId: pendingPayment.id, checkoutId, attempt });
      const verified = await verifyAndActivate(pendingPayment.id, checkoutId);
      if (verified) {
        log("VERIFIED_OK", { userId: user.id, paymentId: pendingPayment.id });
        return NextResponse.json({
          status: "activated",
          plan: pendingPayment.plan_id,
          type: pendingPayment.type,
          method: "auto_verify",
        });
      }
    }

    // Not confirmed yet — keep polling
    log("STILL_PENDING", { userId: user.id, paymentId: pendingPayment.id, attempt, ageMs: paymentAge });
    return NextResponse.json({
      status: paymentAge > 5 * 60 * 1000 ? "processing_delayed" : "processing",
      message: attempt < 5
        ? "Confirming payment with Yoco..."
        : "Still confirming — your plan will activate automatically once payment is verified.",
    });

  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), sys: "ACTIVATE", action: "ERROR", error: String(error) }));
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
