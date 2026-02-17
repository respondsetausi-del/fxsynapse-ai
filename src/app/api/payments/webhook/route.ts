import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role for webhook (no user context)
function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, payload } = body;

    if (type !== "payment.succeeded") {
      return NextResponse.json({ received: true });
    }

    const checkoutId = payload?.metadata?.checkoutId || payload?.checkoutId;
    const metadata = payload?.metadata || {};
    const supabase = getAdminSupabase();

    // Find the pending payment
    const { data: payment } = await supabase
      .from("payments")
      .select("*")
      .eq("yoco_checkout_id", checkoutId)
      .eq("status", "pending")
      .single();

    if (!payment) {
      // Try matching by metadata userId + amount
      const userId = metadata.userId;
      if (!userId) {
        console.warn("Webhook: no matching payment found for", checkoutId);
        return NextResponse.json({ received: true });
      }
    }

    const userId = payment?.user_id || metadata.userId;
    const paymentType = payment?.type || metadata.type;

    // Mark payment completed
    if (payment) {
      await supabase.from("payments").update({ status: "completed" }).eq("id", payment.id);
    }

    if (paymentType === "subscription") {
      const planId = payment?.plan_id || metadata.planId;
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      await supabase.from("profiles").update({
        plan_id: planId,
        subscription_status: "active",
        subscription_expires_at: expiry.toISOString(),
      }).eq("id", userId);

    } else if (paymentType === "credits") {
      const creditsAmount = payment?.credits_amount || parseInt(metadata.credits || "0");

      // Get current balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits_balance")
        .eq("id", userId)
        .single();

      if (profile) {
        await supabase.from("profiles").update({
          credits_balance: profile.credits_balance + creditsAmount,
        }).eq("id", userId);

        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: creditsAmount,
          type: "purchase",
          description: `Purchased ${creditsAmount} credits`,
        });
      }
    }

    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
