import { createServiceSupabase } from "@/lib/supabase/server";

export interface CreditCheck {
  canScan: boolean;
  source: "monthly" | "topup" | "unlimited";
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  topupBalance: number;
  reason?: string;
  planId: string;
  planName: string;
}

// Backwards compat for dashboard display
export interface LegacyCreditDisplay {
  dailyRemaining: number;
  creditsBalance: number;
}

export function toLegacyDisplay(c: CreditCheck): LegacyCreditDisplay {
  return {
    dailyRemaining: c.monthlyRemaining,
    creditsBalance: c.topupBalance,
  };
}

export async function checkCredits(userId: string): Promise<CreditCheck> {
  const supabase = createServiceSupabase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, plans(*)")
    .eq("id", userId)
    .single();

  if (!profile) {
    return {
      canScan: false, source: "monthly", monthlyUsed: 0, monthlyLimit: 0,
      monthlyRemaining: 0, topupBalance: 0, reason: "Profile not found",
      planId: "none", planName: "None",
    };
  }

  const plan = profile.plans;
  const now = new Date();

  // Check if monthly cycle needs reset
  const cycleStart = profile.billing_cycle_start ? new Date(profile.billing_cycle_start) : null;
  if (cycleStart) {
    const nextReset = new Date(cycleStart);
    nextReset.setMonth(now.getMonth());
    nextReset.setFullYear(now.getFullYear());
    if (nextReset > now) {
      nextReset.setMonth(nextReset.getMonth() - 1);
    }
    const lastReset = profile.monthly_scans_reset_at ? new Date(profile.monthly_scans_reset_at) : null;
    if (!lastReset || lastReset < nextReset) {
      await supabase
        .from("profiles")
        .update({ monthly_scans_used: 0, monthly_scans_reset_at: now.toISOString() })
        .eq("id", userId);
      profile.monthly_scans_used = 0;
    }
  }

  // No active subscription — free tier daily reset + topup credits
  if (!profile.subscription_status || profile.subscription_status !== "active") {
    // ── FREE TIER: 1 scan per day with daily reset ──
    const lastReset = profile.daily_scans_reset_at ? new Date(profile.daily_scans_reset_at) : null;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Reset daily counter if last reset was before today
    if (!lastReset || lastReset < todayStart) {
      await supabase
        .from("profiles")
        .update({ daily_scans_used: 0, daily_scans_reset_at: now.toISOString() })
        .eq("id", userId);
      profile.daily_scans_used = 0;
    }

    const dailyUsed = profile.daily_scans_used || 0;
    const dailyFreeLimit = 1;
    const hasFreeDaily = dailyUsed < dailyFreeLimit;
    const topupBalance = profile.credits_balance || 0;

    if (hasFreeDaily) {
      return {
        canScan: true, source: "monthly" as const,
        monthlyUsed: dailyUsed, monthlyLimit: dailyFreeLimit, monthlyRemaining: dailyFreeLimit - dailyUsed,
        topupBalance,
        planId: profile.plan_id || "free", planName: "Free",
      };
    }

    // Daily free scan used — check topup credits
    if (topupBalance > 0) {
      return {
        canScan: true, source: "topup",
        monthlyUsed: dailyUsed, monthlyLimit: dailyFreeLimit, monthlyRemaining: 0,
        topupBalance,
        planId: profile.plan_id || "free", planName: "Free",
      };
    }

    return {
      canScan: false, source: "monthly",
      monthlyUsed: dailyUsed, monthlyLimit: dailyFreeLimit, monthlyRemaining: 0,
      topupBalance: 0,
      reason: "Your free daily scan is used. Come back tomorrow or unlock more scans.",
      planId: profile.plan_id || "free", planName: "Free",
    };
  }

  // Check expiry
  if (profile.subscription_expires_at && new Date(profile.subscription_expires_at) < now) {
    await supabase.from("profiles").update({ subscription_status: "expired" }).eq("id", userId);
    return {
      canScan: false, source: "monthly",
      monthlyUsed: 0, monthlyLimit: 0, monthlyRemaining: 0,
      topupBalance: profile.credits_balance || 0,
      reason: "Your subscription has expired. Renew to continue scanning.",
      planId: profile.plan_id || "none", planName: plan?.name || "None",
    };
  }

  // Use monthly_scans from plan (new field), fall back to daily_scans for backwards compat
  const monthlyLimit = plan?.monthly_scans ?? plan?.daily_scans ?? 0;

  // Premium unlimited
  if (monthlyLimit === -1) {
    return {
      canScan: true, source: "unlimited",
      monthlyUsed: profile.monthly_scans_used || 0, monthlyLimit: -1,
      monthlyRemaining: -1, topupBalance: profile.credits_balance || 0,
      planId: profile.plan_id, planName: plan?.name || "Premium",
    };
  }

  const used = profile.monthly_scans_used || 0;
  const remaining = Math.max(0, monthlyLimit - used);

  if (remaining > 0) {
    return {
      canScan: true, source: "monthly",
      monthlyUsed: used, monthlyLimit, monthlyRemaining: remaining,
      topupBalance: profile.credits_balance || 0,
      planId: profile.plan_id, planName: plan?.name || "Starter",
    };
  }

  // Monthly exhausted — check top-up
  if (profile.credits_balance > 0) {
    return {
      canScan: true, source: "topup",
      monthlyUsed: used, monthlyLimit, monthlyRemaining: 0,
      topupBalance: profile.credits_balance,
      planId: profile.plan_id, planName: plan?.name || "Starter",
    };
  }

  return {
    canScan: false, source: "monthly",
    monthlyUsed: used, monthlyLimit, monthlyRemaining: 0,
    topupBalance: 0,
    reason: "Monthly scans used up. Buy top-up credits or upgrade your plan.",
    planId: profile.plan_id, planName: plan?.name || "Starter",
  };
}

export async function deductCredit(
  userId: string,
  source: "monthly" | "topup" | "unlimited"
): Promise<boolean> {
  const supabase = createServiceSupabase();

  if (source === "unlimited") return true;

  if (source === "monthly") {
    // For paid users: increment monthly_scans_used
    // For free users: increment daily_scans_used
    const { data: profile } = await supabase
      .from("profiles")
      .select("monthly_scans_used, daily_scans_used, subscription_status")
      .eq("id", userId)
      .single();

    if (!profile) return false;

    const isFreeUser = !profile.subscription_status || profile.subscription_status !== "active";
    
    if (isFreeUser) {
      const { error } = await supabase
        .from("profiles")
        .update({ daily_scans_used: (profile.daily_scans_used || 0) + 1 })
        .eq("id", userId);
      return !error;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ monthly_scans_used: (profile.monthly_scans_used || 0) + 1 })
      .eq("id", userId);

    return !error;
  }

  if (source === "topup") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", userId)
      .single();

    if (!profile || profile.credits_balance <= 0) return false;

    const { error } = await supabase
      .from("profiles")
      .update({ credits_balance: profile.credits_balance - 1 })
      .eq("id", userId);

    if (error) return false;

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: -1,
      type: "scan_debit",
      description: "Chart scan (top-up credit)",
    });

    return true;
  }

  return false;
}

export async function recordScan(
  userId: string,
  source: "monthly" | "topup" | "unlimited",
  analysis: Record<string, unknown>,
  chartImageUrl?: string
) {
  const supabase = createServiceSupabase();
  
  // Generate a 10-char share ID
  const shareId = Math.random().toString(36).substring(2, 12);

  const { data: scan } = await supabase.from("scans").insert({
    user_id: userId,
    pair: (analysis.pair as string) || null,
    timeframe: (analysis.timeframe as string) || null,
    trend: (analysis.trend as string) || null,
    bias: (analysis.bias as string) || null,
    confidence: (analysis.confidence as number) || null,
    analysis,
    credit_source: source,
    share_id: shareId,
    chart_image_url: chartImageUrl || null,
  }).select("id, share_id").single();

  // Update last_seen_at for activity tracking
  await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);

  return { scanId: scan?.id, shareId: scan?.share_id || shareId };
}

export async function adminAllocateCredits(
  adminId: string,
  userId: string,
  amount: number,
  description: string
) {
  const supabase = createServiceSupabase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();

  if (!profile) throw new Error("User not found");

  const newBalance = profile.credits_balance + amount;
  if (newBalance < 0) throw new Error("Cannot reduce below 0");

  await supabase
    .from("profiles")
    .update({ credits_balance: newBalance })
    .eq("id", userId);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type: amount > 0 ? "admin_grant" : "admin_revoke",
    description,
    created_by: adminId,
  });

  return newBalance;
}
