import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * Called when a new user signs up with a ref code.
 * Creates the referral record and increments affiliate signups.
 */
export async function processReferralSignup(userId: string, refCode: string) {
  const supabase = createServiceSupabase();

  try {
    // Find the affiliate
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("id, total_signups, user_id")
      .eq("ref_code", refCode)
      .eq("status", "active")
      .single();

    if (!affiliate) {
      console.log(`[AFFILIATE] Invalid ref code: ${refCode}`);
      return;
    }

    // Prevent self-referral
    if (affiliate.user_id === userId) {
      console.log(`[AFFILIATE] Self-referral blocked: ${userId}`);
      return;
    }

    // Check if referral already exists
    const { data: existing } = await supabase
      .from("referrals")
      .select("id")
      .eq("referred_user_id", userId)
      .single();

    if (existing) {
      console.log(`[AFFILIATE] User already referred: ${userId}`);
      return;
    }

    // Create referral
    await supabase.from("referrals").insert({
      affiliate_id: affiliate.id,
      referred_user_id: userId,
      ref_code_used: refCode,
      status: "signed_up",
    });

    // Store ref code on profile
    await supabase.from("profiles").update({ referred_by: refCode }).eq("id", userId);

    // Increment affiliate signup count
    await supabase.from("affiliates").update({
      total_signups: (affiliate.total_signups || 0) + 1,
    }).eq("id", affiliate.id);

    console.log(`[AFFILIATE] ✅ Referral recorded: ${refCode} → ${userId}`);
  } catch (error) {
    console.error("[AFFILIATE] Error processing signup:", error);
  }
}

/**
 * Called when a referred user makes a payment.
 * Creates commission earning for the affiliate.
 */
export async function processAffiliateCommission(
  userId: string,
  paymentId: string,
  amountCents: number
) {
  const supabase = createServiceSupabase();

  try {
    // Find the referral for this user
    const { data: referral } = await supabase
      .from("referrals")
      .select("id, affiliate_id, status")
      .eq("referred_user_id", userId)
      .single();

    if (!referral) {
      // User was not referred — no commission
      return;
    }

    // Get affiliate details
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("id, commission_rate, total_earned_cents, total_conversions, status")
      .eq("id", referral.affiliate_id)
      .single();

    if (!affiliate || affiliate.status !== "active") {
      console.log(`[AFFILIATE] Affiliate inactive, skipping commission`);
      return;
    }

    // Check for duplicate commission on same payment
    const { data: existingEarning } = await supabase
      .from("affiliate_earnings")
      .select("id")
      .eq("payment_id", paymentId)
      .single();

    if (existingEarning) {
      console.log(`[AFFILIATE] Commission already exists for payment ${paymentId}`);
      return;
    }

    // Calculate commission
    const commissionCents = Math.round(amountCents * affiliate.commission_rate);
    const commissionRand = (commissionCents / 100).toFixed(2);

    // Create earning record
    await supabase.from("affiliate_earnings").insert({
      affiliate_id: affiliate.id,
      referral_id: referral.id,
      payment_id: paymentId,
      amount_cents: commissionCents,
      commission_rate: affiliate.commission_rate,
      description: `R${commissionRand} commission (${Math.round(affiliate.commission_rate * 100)}% of R${(amountCents / 100).toFixed(2)})`,
      status: "pending",
    });

    // Update affiliate totals
    await supabase.from("affiliates").update({
      total_earned_cents: (affiliate.total_earned_cents || 0) + commissionCents,
      total_conversions: referral.status === "signed_up" 
        ? (affiliate.total_conversions || 0) + 1 
        : affiliate.total_conversions,
    }).eq("id", affiliate.id);

    // Mark referral as converted if first payment
    if (referral.status === "signed_up") {
      await supabase.from("referrals").update({
        status: "converted",
        first_payment_at: new Date().toISOString(),
      }).eq("id", referral.id);
    }

    console.log(`[AFFILIATE] ✅ Commission R${commissionRand} for affiliate ${affiliate.id} from payment ${paymentId}`);
  } catch (error) {
    console.error("[AFFILIATE] Error processing commission:", error);
  }
}
