import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { activatePayment } from "@/lib/payment-activate";

/**
 * Link Guest Payment — /api/payments/link-guest
 *
 * After a guest pays → signs up, this links the payment to their new account.
 * 1. Finds payment by guestToken
 * 2. Sets user_id on the payment
 * 3. If Yoco already confirmed (webhook fired), activates the payment
 * 4. If still pending, the webhook will activate when it fires
 */

function getService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  try {
    const { userId, guestToken } = await req.json();

    if (!userId || !guestToken) {
      return NextResponse.json({ error: "Missing userId or guestToken" }, { status: 400 });
    }

    const supabase = getService();

    // Find payment by guest token (check metadata)
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(50);

    // Match by guestToken in metadata
    const payment = payments?.find(
      (p: any) => p.metadata?.guestToken === guestToken
    );

    if (!payment) {
      console.error("Guest payment not found for token:", guestToken);
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Link payment to user
    const { error: linkErr } = await supabase
      .from("payments")
      .update({ user_id: userId })
      .eq("id", payment.id);

    if (linkErr) {
      console.error("Link error:", linkErr);
      return NextResponse.json({ error: "Failed to link payment" }, { status: 500 });
    }

    // If payment is already completed by webhook, activate now
    if (payment.status === "completed") {
      // Payment was already marked completed by webhook but couldn't apply
      // (user_id was null). Now apply to profile directly.
      await applyToProfile(supabase, payment, userId);
      return NextResponse.json({ success: true, activated: true, status: "completed" });
    }

    // If still pending, try to verify with Yoco and activate
    if (payment.status === "pending" && payment.yoco_checkout_id) {
      const yocoKey = process.env.YOCO_SECRET_KEY;
      if (yocoKey) {
        try {
          const res = await fetch(
            `https://payments.yoco.com/api/checkouts/${payment.yoco_checkout_id}`,
            { headers: { Authorization: `Bearer ${yocoKey}` } }
          );
          if (res.ok) {
            const checkout = await res.json();
            if (checkout.status?.toLowerCase() === "completed") {
              const result = await activatePayment(payment.id, "guest_link");
              return NextResponse.json({ success: true, activated: result.success, status: "completed" });
            }
          }
        } catch (e) {
          console.error("Yoco verify during link:", e);
        }
      }
    }

    // Payment linked but not yet completed — webhook will handle it
    return NextResponse.json({ success: true, activated: false, status: payment.status });
  } catch (error) {
    console.error("Link guest payment error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Apply a completed payment to a user's profile.
 * Used when webhook fired before user existed (user_id was null).
 */
async function applyToProfile(
  supabase: ReturnType<typeof getService>,
  payment: any,
  userId: string
) {
  if (payment.type === "subscription") {
    const planId = payment.plan_id || payment.metadata?.planId;
    const months = parseInt(payment.metadata?.months || "1");
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + months);

    await supabase.from("profiles").update({
      plan_id: planId,
      subscription_status: "active",
      subscription_expires_at: expiry.toISOString(),
      billing_cycle_start: new Date().toISOString(),
      billing_period: payment.metadata?.period || "monthly",
      monthly_scans_used: 0,
      monthly_scans_reset_at: new Date().toISOString(),
      daily_scans_used: 0,
      daily_scans_reset_at: new Date().toISOString(),
    }).eq("id", userId);
  } else if (payment.type === "credits" || payment.type === "topup") {
    const credits = payment.credits_amount || parseInt(payment.metadata?.credits || "0");
    if (credits > 0) {
      const { data: profile } = await supabase
        .from("profiles").select("credits_balance").eq("id", userId).single();
      if (profile) {
        await supabase.from("profiles").update({
          credits_balance: (profile.credits_balance || 0) + credits,
        }).eq("id", userId);
        await supabase.from("credit_transactions").insert({
          user_id: userId, amount: credits, type: "purchase",
          description: `Purchased ${credits} credits (guest checkout)`,
        });
      }
    }
  }
}
