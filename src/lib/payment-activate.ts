/**
 * Payment Activation — Single Source of Truth
 * 
 * This module handles ALL payment activations. Every path that activates
 * a payment goes through activatePayment() to prevent inconsistencies.
 * 
 * Used by:
 * - Webhook (Layer 1: instant)
 * - Success page polling (Layer 2: auto-activate if webhook missed)
 * - Cron sweep (Layer 3: catches anything that fell through)
 */

import { createClient } from "@supabase/supabase-js";
import { sendPaymentSuccessToUser, sendPaymentNotificationToAdmin } from "@/lib/email";
import { processAffiliateCommission } from "@/lib/affiliate";

function getService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface ActivationResult {
  success: boolean;
  alreadyCompleted: boolean;
  method: string;
  error?: string;
}

/**
 * Activate a payment — marks it completed and updates user profile.
 * Idempotent: calling multiple times on same payment is safe.
 */
export async function activatePayment(
  paymentId: string,
  method: string // "webhook" | "auto_verify" | "success_page" | "cron_sweep" | "admin"
): Promise<ActivationResult> {
  const supabase = getService();

  // 1. Get payment record
  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .single();

  if (fetchErr || !payment) {
    return { success: false, alreadyCompleted: false, method, error: "Payment not found" };
  }

  // 2. Idempotency — already completed
  if (payment.status === "completed") {
    console.log(`[ACTIVATE] Payment ${paymentId} already completed — skipping (${method})`);
    return { success: true, alreadyCompleted: true, method };
  }

  // 3. Mark payment completed
  const { error: updateErr } = await supabase.from("payments").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    metadata: { ...(payment.metadata || {}), activation_method: method },
  }).eq("id", paymentId);

  if (updateErr) {
    console.error(`[ACTIVATE] Failed to update payment ${paymentId}:`, updateErr);
    return { success: false, alreadyCompleted: false, method, error: updateErr.message };
  }

  const userId = payment.user_id;
  const paymentType = payment.type;

  // 4. Activate subscription or credits
  if (paymentType === "subscription") {
    const planId = payment.plan_id || payment.metadata?.planId;
    const period = payment.metadata?.period || "monthly";
    const months = parseInt(payment.metadata?.months || "1");
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + months);

    const { error: profileErr } = await supabase.from("profiles").update({
      plan_id: planId,
      subscription_status: "active",
      subscription_expires_at: expiry.toISOString(),
      billing_cycle_start: new Date().toISOString(),
      billing_period: period,
      monthly_scans_used: 0,
      monthly_scans_reset_at: new Date().toISOString(),
      daily_scans_used: 0,
      daily_scans_reset_at: new Date().toISOString(),
      daily_chats_used: 0,
      daily_chats_reset_at: new Date().toISOString(),
    }).eq("id", userId);

    if (profileErr) {
      console.error(`[ACTIVATE] Profile update failed for ${userId}:`, profileErr);
      return { success: false, alreadyCompleted: false, method, error: profileErr.message };
    }

    console.log(`[ACTIVATE] ✅ Subscription activated: user=${userId}, plan=${planId}, period=${period}, months=${months}, method=${method}`);

    // Send emails (non-blocking)
    sendActivationEmails(supabase, userId, planId, period, payment.amount_cents).catch(console.error);

  } else if (paymentType === "credits" || paymentType === "topup") {
    const creditsAmount = payment.credits_amount || parseInt(payment.metadata?.credits || "0");

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
        description: `Purchased ${creditsAmount} credits (${method})`,
      });

      console.log(`[ACTIVATE] ✅ Credits added: user=${userId}, credits=${creditsAmount}, method=${method}`);
    }
  }

  // 5. Affiliate commission (non-blocking)
  if (userId && payment.amount_cents) {
    processAffiliateCommission(userId, paymentId, payment.amount_cents).catch(err => {
      console.error(`[ACTIVATE] Affiliate commission error (non-blocking):`, err);
    });
  }

  return { success: true, alreadyCompleted: false, method };
}

/**
 * Try to verify a pending payment via Yoco API, then activate if confirmed.
 * Returns true if payment was activated.
 */
export async function verifyAndActivate(paymentId: string, checkoutId: string): Promise<boolean> {
  const yocoKey = process.env.YOCO_SECRET_KEY;
  if (!yocoKey || !checkoutId) return false;

  try {
    const res = await fetch(
      `https://payments.yoco.com/api/checkouts/${checkoutId}`,
      { headers: { Authorization: `Bearer ${yocoKey}` } }
    );

    if (!res.ok) return false;

    const checkout = await res.json();
    const status = (checkout.status || "").toLowerCase();

    // "completed" from Yoco = definitely paid
    if (status === "completed") {
      const result = await activatePayment(paymentId, "auto_verify");
      return result.success;
    }

    return false;
  } catch (err) {
    console.error(`[VERIFY] Error checking checkout ${checkoutId}:`, err);
    return false;
  }
}

/**
 * Sweep all pending payments and try to activate them.
 * Called by cron or admin. Handles rate limiting.
 */
export async function sweepPendingPayments(): Promise<{
  checked: number;
  activated: number;
  results: Array<{ id: string; status: string; reason?: string }>;
}> {
  const supabase = getService();
  const yocoKey = process.env.YOCO_SECRET_KEY;

  const { data: pending } = await supabase
    .from("payments")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (!pending || pending.length === 0) {
    return { checked: 0, activated: 0, results: [] };
  }

  const results: Array<{ id: string; status: string; reason?: string }> = [];
  let activated = 0;

  for (const payment of pending) {
    const checkoutId = payment.yoco_checkout_id;

    // Skip very recent payments (< 2 min) — give webhook a chance
    const age = Date.now() - new Date(payment.created_at).getTime();
    if (age < 2 * 60 * 1000) {
      results.push({ id: payment.id, status: "too_recent", reason: "< 2 minutes old" });
      continue;
    }

    // Skip very old payments (> 1h) — Yoco checkouts expire in ~30min
    if (age > 60 * 60 * 1000) {
      await supabase.from("payments").update({ status: "expired" }).eq("id", payment.id);
      results.push({ id: payment.id, status: "expired", reason: "> 24 hours old" });
      continue;
    }

    if (!checkoutId) {
      results.push({ id: payment.id, status: "skipped", reason: "no checkout ID" });
      continue;
    }

    if (!yocoKey) {
      results.push({ id: payment.id, status: "skipped", reason: "no YOCO_SECRET_KEY" });
      continue;
    }

    try {
      const verified = await verifyAndActivate(payment.id, checkoutId);
      if (verified) {
        activated++;
        results.push({ id: payment.id, status: "activated" });
      } else {
        results.push({ id: payment.id, status: "not_verified", reason: "Yoco status not completed" });
      }
    } catch (err) {
      results.push({ id: payment.id, status: "error", reason: String(err) });
    }

    // Rate limit — 300ms between Yoco API calls
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[SWEEP] Done: ${pending.length} checked, ${activated} activated`);
  return { checked: pending.length, activated, results };
}

// ─── Helpers ───

async function sendActivationEmails(
  supabase: ReturnType<typeof getService>,
  userId: string,
  planId: string,
  period: string,
  amountCents: number
) {
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).single();
  if (!profile?.email) return;

  const planNames: Record<string, string> = { basic: "Basic", starter: "Starter", pro: "Pro", unlimited: "Unlimited" };
  const planPrices: Record<string, string> = { basic: "R79", starter: "R199", pro: "R349", unlimited: "R499" };
  const pName = planNames[planId] || planId;
  const pPrice = period === "yearly" ? `${planPrices[planId]}/mo (yearly)` : (planPrices[planId] || `R${(amountCents || 0) / 100}`);

  sendPaymentSuccessToUser(profile.email, pName, pPrice).catch(console.error);
  sendPaymentNotificationToAdmin(profile.email, pName, pPrice).catch(console.error);
}
// deploy 1772196602

// deployed Fri Feb 27 13:11:47 UTC 2026
