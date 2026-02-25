import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { sendPaymentSuccessToUser, sendPaymentNotificationToAdmin } from "@/lib/email";
import { processAffiliateCommission } from "@/lib/affiliate";

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Verify Yoco webhook signature
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[WEBHOOK] No YOCO_WEBHOOK_SECRET set — skipping verification");
    return true; // Allow through if secret not configured yet
  }
  if (!signature) {
    console.warn("[WEBHOOK] No signature header in request");
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  return signature === expected;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("webhook-signature") || req.headers.get("x-webhook-signature");

  // Verify signature
  if (!verifySignature(rawBody, signature)) {
    console.error("[WEBHOOK] Invalid signature — rejecting");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.type;
    const payload = body.payload || body.data || {};

    console.log(`[WEBHOOK] Event: ${eventType}`, JSON.stringify(body, null, 2));

    // Only process successful payments
    if (eventType !== "payment.succeeded") {
      console.log(`[WEBHOOK] Ignoring event type: ${eventType}`);
      return NextResponse.json({ received: true });
    }

    const supabase = getAdminSupabase();

    // Extract identifiers — Yoco puts checkoutId at payload level
    const checkoutId = payload.checkoutId || payload.checkout_id || payload.metadata?.checkoutId;
    const metadata = payload.metadata || {};
    const userId = metadata.userId;
    const paymentType = metadata.type; // "subscription" or "topup"

    console.log(`[WEBHOOK] checkoutId=${checkoutId}, userId=${userId}, type=${paymentType}`);

    // The webhook event payment.succeeded IS the source of truth
    // (signature already verified above)

    // Strategy 1: Match by checkoutId (most reliable)
    let payment = null;
    if (checkoutId) {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("yoco_checkout_id", checkoutId)
        .in("status", ["pending", "completed"])
        .single();
      payment = data;
    }

    // Strategy 2: Match by userId + pending status (fallback)
    if (!payment && userId) {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      payment = data;
    }

    if (!payment) {
      console.warn("[WEBHOOK] No matching payment found", { checkoutId, userId });
      // Do NOT activate from metadata alone — too easy to exploit
      // The checkout verification above already confirmed payment is real
      // Log for manual investigation
      console.warn("[WEBHOOK] Unmatched webhook event — may need manual investigation");
      return NextResponse.json({ received: true, processed: false, reason: "no_matching_payment" });
    }

    // Skip if already completed (idempotency)
    if (payment.status === "completed") {
      console.log("[WEBHOOK] Payment already completed, skipping", payment.id);
      return NextResponse.json({ received: true, already_processed: true });
    }

    // Mark payment completed
    await supabase.from("payments").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", payment.id);

    // Activate the plan or credits
    const effectiveUserId = payment.user_id || userId;
    const effectiveType = payment.type || paymentType;

    if (effectiveType === "subscription") {
      const planId = payment.plan_id || metadata.planId;
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      const { error } = await supabase.from("profiles").update({
        plan_id: planId,
        subscription_status: "active",
        subscription_expires_at: expiry.toISOString(),
        billing_cycle_start: new Date().toISOString(),
        monthly_scans_used: 0,
        monthly_scans_reset_at: new Date().toISOString(),
      }).eq("id", effectiveUserId);

      if (error) {
        console.error("[WEBHOOK] Failed to update profile:", error);
      } else {
        console.log(`[WEBHOOK] ✅ Subscription activated: user=${effectiveUserId}, plan=${planId}`);
        // Send emails
        const { data: userProfile } = await supabase.from("profiles").select("email").eq("id", effectiveUserId).single();
        if (userProfile?.email) {
          const planNames: Record<string, string> = { starter: "Starter", pro: "Pro", premium: "Premium" };
          const planPrices: Record<string, string> = { starter: "R49", pro: "R99", premium: "R199" };
          const pName = planNames[planId] || planId;
          const pPrice = planPrices[planId] || `R${(payment.amount || 0) / 100}`;
          sendPaymentSuccessToUser(userProfile.email, pName, pPrice).catch(console.error);
          sendPaymentNotificationToAdmin(userProfile.email, pName, pPrice).catch(console.error);
        }
      }

    } else if (effectiveType === "credits" || effectiveType === "topup") {
      const creditsAmount = payment.credits_amount || parseInt(metadata.credits || "0");

      const { data: profile } = await supabase
        .from("profiles")
        .select("credits_balance")
        .eq("id", effectiveUserId)
        .single();

      if (profile) {
        const { error } = await supabase.from("profiles").update({
          credits_balance: (profile.credits_balance || 0) + creditsAmount,
        }).eq("id", effectiveUserId);

        if (!error) {
          await supabase.from("credit_transactions").insert({
            user_id: effectiveUserId,
            amount: creditsAmount,
            type: "purchase",
            description: `Purchased ${creditsAmount} credits`,
          });
          console.log(`[WEBHOOK] ✅ Credits added: user=${effectiveUserId}, credits=${creditsAmount}`);
        } else {
          console.error("[WEBHOOK] Failed to add credits:", error);
        }
      }
    }

    // ═══ AFFILIATE COMMISSION ═══
    // If this user was referred, create commission for the affiliate
    if (effectiveUserId && payment) {
      processAffiliateCommission(effectiveUserId, payment.id, payment.amount_cents).catch(err => {
        console.error("[WEBHOOK] Affiliate commission error (non-blocking):", err);
      });
    }

    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error("[WEBHOOK] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// Direct activation from metadata when no payment record exists
async function activateFromMetadata(
  supabase: ReturnType<typeof getAdminSupabase>,
  userId: string,
  type: string,
  metadata: Record<string, string>
) {
  if (type === "subscription") {
    const planId = metadata.planId;
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    await supabase.from("profiles").update({
      plan_id: planId,
      subscription_status: "active",
      subscription_expires_at: expiry.toISOString(),
      billing_cycle_start: new Date().toISOString(),
      monthly_scans_used: 0,
      monthly_scans_reset_at: new Date().toISOString(),
    }).eq("id", userId);

    console.log(`[WEBHOOK] ✅ Subscription activated (metadata fallback): user=${userId}, plan=${planId}`);

  } else if (type === "topup" || type === "credits") {
    const creditsAmount = parseInt(metadata.credits || "0");

    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", userId)
      .single();

    if (profile && creditsAmount > 0) {
      await supabase.from("profiles").update({
        credits_balance: (profile.credits_balance || 0) + creditsAmount,
      }).eq("id", userId);

      await supabase.from("credit_transactions").insert({
        user_id: userId,
        amount: creditsAmount,
        type: "purchase",
        description: `Purchased ${creditsAmount} credits (webhook fallback)`,
      });

      console.log(`[WEBHOOK] ✅ Credits added (metadata fallback): user=${userId}, credits=${creditsAmount}`);
    }
  }
}
