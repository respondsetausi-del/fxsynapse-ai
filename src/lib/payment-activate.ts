/**
 * Payment Activation — Single Source of Truth (v2 Hardened)
 *
 * LIFECYCLE:
 *   pending → completed   (success)
 *   pending → expired     (checkout abandoned / timed out)
 *   pending → failed      (card declined / admin revert)
 *   completed → (terminal, never changes)
 *
 * IDEMPOTENCY:
 *   Uses conditional UPDATE (WHERE status = 'pending') as atomic lock.
 *   If two processes race, only one can transition pending→completed.
 *   The loser sees 0 rows updated and returns alreadyCompleted: true.
 *
 * CALLERS:
 *   Layer 1: Webhook           (instant, 0-5s)
 *   Layer 2: Success page poll (user-driven, Yoco API verify)
 *   Layer 3: Cron sweep        (2x daily, catches stragglers)
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
  paymentId?: string;
  error?: string;
}

// ─── Structured log ───
function log(level: "info" | "warn" | "error", action: string, data: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), sys: "PAY", action, ...data };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/**
 * Activate a payment — marks completed, updates profile.
 * ATOMIC: WHERE status='pending' prevents race conditions.
 */
export async function activatePayment(
  paymentId: string,
  method: string
): Promise<ActivationResult> {
  const supabase = getService();

  // 1. Fetch payment
  const { data: payment, error: fetchErr } = await supabase
    .from("payments").select("*").eq("id", paymentId).single();

  if (fetchErr || !payment) {
    log("error", "ACTIVATE_NOT_FOUND", { paymentId, method });
    return { success: false, alreadyCompleted: false, method, paymentId, error: "Payment not found" };
  }

  // 2. Already completed — idempotent return
  if (payment.status === "completed") {
    log("info", "ACTIVATE_IDEMPOTENT", { paymentId, method });
    return { success: true, alreadyCompleted: true, method, paymentId };
  }

  // 3. Only from "pending"
  if (payment.status !== "pending") {
    log("warn", "ACTIVATE_WRONG_STATUS", { paymentId, method, status: payment.status });
    return { success: false, alreadyCompleted: false, method, paymentId, error: `Cannot activate: ${payment.status}` };
  }

  // 4. ATOMIC transition: pending → completed
  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from("payments")
    .update({
      status: "completed",
      completed_at: now,
      metadata: { ...(payment.metadata || {}), activation_method: method, activated_at: now },
    })
    .eq("id", paymentId)
    .eq("status", "pending")  // ATOMIC LOCK
    .select("id")
    .single();

  if (updateErr || !updated) {
    log("info", "ACTIVATE_RACE_LOST", { paymentId, method });
    return { success: true, alreadyCompleted: true, method, paymentId };
  }

  log("info", "ACTIVATE_OK", {
    paymentId, method, userId: payment.user_id,
    type: payment.type, plan: payment.plan_id, amount: payment.amount_cents,
  });

  // 5. Apply to profile
  if (payment.type === "subscription") {
    const planId = payment.plan_id || payment.metadata?.planId;
    const period = payment.metadata?.period || "monthly";
    const months = parseInt(payment.metadata?.months || "1");
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + months);

    const { error } = await supabase.from("profiles").update({
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
    }).eq("id", payment.user_id);

    if (error) log("error", "PROFILE_UPDATE_FAIL", { paymentId, error: error.message });
    else log("info", "SUBSCRIPTION_ON", { userId: payment.user_id, planId, period, months, expires: expiry.toISOString() });

  } else if (payment.type === "credits" || payment.type === "topup") {
    const credits = payment.credits_amount || parseInt(payment.metadata?.credits || "0");
    if (credits > 0) {
      const { data: profile } = await supabase.from("profiles").select("credits_balance").eq("id", payment.user_id).single();
      if (profile) {
        await supabase.from("profiles").update({ credits_balance: (profile.credits_balance || 0) + credits }).eq("id", payment.user_id);
        await supabase.from("credit_transactions").insert({ user_id: payment.user_id, amount: credits, type: "purchase", description: `Purchased ${credits} credits (${method})` });
        log("info", "CREDITS_ADDED", { userId: payment.user_id, credits, method });
      }
    }
  }

  // 6. Side effects (non-blocking)
  sendActivationEmails(supabase, payment).catch(e => log("error", "EMAIL_FAIL", { paymentId, e: String(e) }));
  if (payment.user_id && payment.amount_cents) {
    processAffiliateCommission(payment.user_id, paymentId, payment.amount_cents).catch(e => log("error", "AFF_FAIL", { paymentId, e: String(e) }));
  }

  return { success: true, alreadyCompleted: false, method, paymentId };
}

async function sendActivationEmails(supabase: ReturnType<typeof getService>, payment: any) {
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", payment.user_id).single();
  if (!profile?.email) return;
  const names: Record<string, string> = { basic: "Basic", starter: "Starter", pro: "Pro", unlimited: "Unlimited" };
  const prices: Record<string, string> = { basic: "R79", starter: "R199", pro: "R349", unlimited: "R499" };
  const planId = payment.plan_id || "unknown";
  const pName = names[planId] || planId;
  const pPrice = payment.metadata?.period === "yearly" ? `${prices[planId]}/mo (yearly)` : (prices[planId] || `R${(payment.amount_cents || 0) / 100}`);
  await sendPaymentSuccessToUser(profile.email, pName, pPrice).catch(() => {});
  await sendPaymentNotificationToAdmin(profile.email, pName, pPrice).catch(() => {});
}

/**
 * Verify via Yoco API → activate if confirmed.
 */
export async function verifyAndActivate(paymentId: string, checkoutId: string): Promise<boolean> {
  const yocoKey = process.env.YOCO_SECRET_KEY;
  if (!yocoKey || !checkoutId) return false;

  try {
    const res = await fetch(`https://payments.yoco.com/api/checkouts/${checkoutId}`, {
      headers: { Authorization: `Bearer ${yocoKey}` },
    });
    if (!res.ok) { log("warn", "YOCO_VERIFY_HTTP", { paymentId, checkoutId, status: res.status }); return false; }

    const checkout = await res.json();
    const yocoStatus = (checkout.status || "").toLowerCase();
    log("info", "YOCO_VERIFY", { paymentId, checkoutId, yocoStatus });

    if (yocoStatus === "completed") {
      const result = await activatePayment(paymentId, "auto_verify");
      return result.success;
    }
    return false;
  } catch (err) {
    log("error", "YOCO_VERIFY_ERR", { paymentId, checkoutId, err: String(err) });
    return false;
  }
}

/**
 * Sweep pending payments — expire stale, verify & activate valid.
 */
export async function sweepPendingPayments(): Promise<{
  checked: number; activated: number; expired: number;
  results: Array<{ id: string; status: string; reason?: string }>;
}> {
  const supabase = getService();
  const yocoKey = process.env.YOCO_SECRET_KEY;

  const { data: pending } = await supabase
    .from("payments").select("*").eq("status", "pending").order("created_at", { ascending: false });

  if (!pending?.length) return { checked: 0, activated: 0, expired: 0, results: [] };

  log("info", "SWEEP_START", { count: pending.length });
  const results: Array<{ id: string; status: string; reason?: string }> = [];
  let activated = 0, expiredCount = 0;

  for (const p of pending) {
    const age = Date.now() - new Date(p.created_at).getTime();

    // < 2 min: give webhook a chance
    if (age < 2 * 60 * 1000) { results.push({ id: p.id, status: "too_recent" }); continue; }

    // > 1h: expire (Yoco checkouts die ~30min)
    if (age > 60 * 60 * 1000) {
      await supabase.from("payments").update({
        status: "expired",
        metadata: { ...(p.metadata || {}), expired_by: "sweep", expired_at: new Date().toISOString() },
      }).eq("id", p.id).eq("status", "pending");
      expiredCount++;
      results.push({ id: p.id, status: "expired", reason: `${Math.round(age / 60000)}m old` });
      continue;
    }

    if (!p.yoco_checkout_id || !yocoKey) {
      results.push({ id: p.id, status: "skipped", reason: !p.yoco_checkout_id ? "no_checkout_id" : "no_yoco_key" });
      continue;
    }

    try {
      if (await verifyAndActivate(p.id, p.yoco_checkout_id)) {
        activated++;
        results.push({ id: p.id, status: "activated" });
      } else {
        results.push({ id: p.id, status: "not_completed" });
      }
    } catch (err) {
      results.push({ id: p.id, status: "error", reason: String(err) });
    }

    await new Promise(r => setTimeout(r, 300)); // rate limit
  }

  log("info", "SWEEP_DONE", { checked: pending.length, activated, expired: expiredCount });
  return { checked: pending.length, activated, expired: expiredCount, results };
}
