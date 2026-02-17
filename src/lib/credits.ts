import { createServiceSupabase } from "@/lib/supabase/server";

export interface CreditCheck {
  canScan: boolean;
  source: "daily" | "credits" | "unlimited";
  dailyRemaining: number;
  creditsBalance: number;
  reason?: string;
}

export async function checkCredits(userId: string): Promise<CreditCheck> {
  const supabase = createServiceSupabase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, plans(*)")
    .eq("id", userId)
    .single();

  if (!profile) {
    return { canScan: false, source: "daily", dailyRemaining: 0, creditsBalance: 0, reason: "Profile not found" };
  }

  const plan = profile.plans;
  const now = new Date();
  const resetAt = new Date(profile.daily_scans_reset_at);

  // Check if daily counter needs reset (new day)
  if (now.toDateString() !== resetAt.toDateString()) {
    await supabase
      .from("profiles")
      .update({ daily_scans_used: 0, daily_scans_reset_at: now.toISOString() })
      .eq("id", userId);
    profile.daily_scans_used = 0;
  }

  // Premium unlimited
  if (plan.daily_scans === -1 && profile.subscription_status === "active") {
    return {
      canScan: true,
      source: "unlimited",
      dailyRemaining: -1,
      creditsBalance: profile.credits_balance,
    };
  }

  // Check daily scans
  const dailyLimit = plan.daily_scans;
  const dailyUsed = profile.daily_scans_used;
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

  if (dailyRemaining > 0) {
    return {
      canScan: true,
      source: "daily",
      dailyRemaining,
      creditsBalance: profile.credits_balance,
    };
  }

  // Check purchased credits
  if (profile.credits_balance > 0) {
    return {
      canScan: true,
      source: "credits",
      dailyRemaining: 0,
      creditsBalance: profile.credits_balance,
    };
  }

  return {
    canScan: false,
    source: "daily",
    dailyRemaining: 0,
    creditsBalance: 0,
    reason: "No scans remaining. Upgrade your plan or purchase credits.",
  };
}

export async function deductCredit(
  userId: string,
  source: "daily" | "credits" | "unlimited"
): Promise<boolean> {
  const supabase = createServiceSupabase();

  if (source === "unlimited") return true;

  if (source === "daily") {
    // Get current count and increment
    const { data: profile } = await supabase
      .from("profiles")
      .select("daily_scans_used")
      .eq("id", userId)
      .single();

    if (!profile) return false;

    const { error } = await supabase
      .from("profiles")
      .update({ daily_scans_used: profile.daily_scans_used + 1 })
      .eq("id", userId);

    if (error) {
      console.error("Deduct daily scan error:", error);
      return false;
    }
    return true;
  }

  if (source === "credits") {
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

    if (error) {
      console.error("Deduct credit error:", error);
      return false;
    }

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: -1,
      type: "scan_debit",
      description: "Chart analysis scan",
    });

    return true;
  }

  return false;
}

export async function recordScan(
  userId: string,
  source: "daily" | "credits" | "unlimited",
  analysis: Record<string, unknown>
) {
  const supabase = createServiceSupabase();

  await supabase.from("scans").insert({
    user_id: userId,
    pair: (analysis.pair as string) || null,
    timeframe: (analysis.timeframe as string) || null,
    trend: (analysis.trend as string) || null,
    bias: (analysis.bias as string) || null,
    confidence: (analysis.confidence as number) || null,
    analysis,
    credit_source: source,
  });
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
