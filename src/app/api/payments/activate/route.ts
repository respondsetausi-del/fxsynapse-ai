import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Payment Activation Endpoint (called from /payment/success page)
 * 
 * This endpoint does NOT activate payments. Only the webhook does.
 * This endpoint POLLS to see if the webhook has already processed it.
 * 
 * Flow:
 * 1. User pays on Yoco → redirected to /payment/success
 * 2. Success page calls this endpoint
 * 3. We check if webhook already processed the payment
 * 4. If yes → return "activated"
 * 5. If no → return "processing" (success page will retry)
 */
export async function POST() {
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

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if user already has an active subscription (webhook processed it)
    const { data: profile } = await service
      .from("profiles")
      .select("plan_id, subscription_status, credits_balance")
      .eq("id", user.id)
      .single();

    if (profile?.subscription_status === "active" && profile?.plan_id !== "free") {
      return NextResponse.json({ 
        status: "activated", 
        plan: profile.plan_id, 
        type: "subscription",
        method: "webhook_processed"
      });
    }

    // Check if there's a recently completed payment (webhook processed it)
    const { data: completedPayment } = await service
      .from("payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (completedPayment) {
      const completedAt = new Date(completedPayment.completed_at || completedPayment.updated_at || completedPayment.created_at);
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      if (completedAt > tenMinAgo) {
        return NextResponse.json({
          status: "activated",
          plan: completedPayment.plan_id,
          type: completedPayment.type,
          method: "webhook_processed",
        });
      }
    }

    // Check if there's a pending payment (webhook hasn't processed yet)
    const { data: pendingPayment } = await service
      .from("payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (pendingPayment) {
      // Payment exists but webhook hasn't fired yet — tell frontend to wait
      const createdAt = new Date(pendingPayment.created_at);
      const minutesAgo = (Date.now() - createdAt.getTime()) / (1000 * 60);

      if (minutesAgo < 5) {
        // Recent payment — webhook should arrive soon
        return NextResponse.json({ 
          status: "processing",
          message: "Payment is being confirmed. This usually takes a few seconds.",
        });
      } else {
        // Old pending payment — webhook may have failed
        return NextResponse.json({ 
          status: "processing_delayed",
          message: "Payment confirmation is taking longer than usual. If you were charged, your plan will activate shortly.",
        });
      }
    }

    // No pending or completed payment found
    return NextResponse.json({ status: "no_pending_payment" });
  } catch (error) {
    console.error("[ACTIVATE] Error:", error);
    return NextResponse.json({ error: "Failed to check payment status" }, { status: 500 });
  }
}
