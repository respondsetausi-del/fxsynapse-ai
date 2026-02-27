import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { activatePayment, verifyAndActivate } from "@/lib/payment-activate";

/**
 * Payment Activation — Layer 2 (success page polling)
 * 
 * SAFE auto-activation rules:
 * 1. If webhook already processed → return activated (always safe)
 * 2. If payment < 5 min old → try Yoco API, then auto-activate (user just paid)
 * 3. If payment > 5 min old → only activate if Yoco API confirms "completed"
 * 4. Never activate abandoned/old payments
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

    // ─── Check 3: Pending payment ───
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

    // ─── Strategy A: Yoco API verify ───
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

    // ─── Strategy B: Auto-activate ONLY if payment is very recent ───
    // Payment must be < 5 min old AND user has polled 3+ times
    // This means user JUST went through Yoco checkout and landed here
    if (attempt >= 3 && paymentAge < 5 * 60 * 1000) {
      console.log(`[ACTIVATE] Auto-activating RECENT payment ${pendingPayment.id} — age ${Math.round(paymentAge / 1000)}s, attempt ${attempt}`);
      
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

    // ─── Still processing ───
    return NextResponse.json({
      status: paymentAge > 5 * 60 * 1000 ? "processing_delayed" : "processing",
      message: attempt < 3 ? "Confirming payment..." : "Almost there...",
    });

  } catch (error) {
    console.error("[ACTIVATE] Error:", error);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
