import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { activatePayment, verifyAndActivate } from "@/lib/payment-activate";

/**
 * Payment Activation — Layer 2 (success page polling)
 * 
 * SAFE approach:
 * 1. Check if webhook already activated it → return "activated"
 * 2. Try Yoco API verification → activate ONLY if Yoco says "completed"
 * 3. Otherwise keep polling — webhook will handle it
 * 
 * We do NOT blindly auto-activate. Users can type /payment/success in URL bar.
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

    // ─── Check 3: Pending payment — try Yoco API verification ───
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

    // Try Yoco API — only activate if Yoco confirms "completed"
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

    // Not verified yet — tell client to keep polling (webhook will handle it)
    return NextResponse.json({
      status: paymentAge > 5 * 60 * 1000 ? "processing_delayed" : "processing",
      message: attempt < 5
        ? "Confirming payment with Yoco..."
        : "Still confirming — your plan will activate automatically once payment is verified.",
    });

  } catch (error) {
    console.error("[ACTIVATE] Error:", error);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
