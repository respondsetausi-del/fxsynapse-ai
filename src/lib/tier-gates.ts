/* ─── Tier Gating Logic ───
 * Centralized checks for what each tier can access.
 * Import this anywhere you need to gate a feature.
 */

import { getTier, getTierOrder, type TierId, type TierConfig } from "@/lib/tier-config";

export interface UserTierInfo {
  planId: string;
  subscriptionStatus: string | null;
  tier: TierConfig;
  isPaid: boolean;
  tierOrder: number;
}

export function getUserTierInfo(planId?: string | null, subscriptionStatus?: string | null): UserTierInfo {
  const effectivePlan = (subscriptionStatus === "active" && planId) ? planId : "free";
  const tier = getTier(effectivePlan);
  return {
    planId: effectivePlan,
    subscriptionStatus: subscriptionStatus || null,
    tier,
    isPaid: effectivePlan !== "free",
    tierOrder: getTierOrder(effectivePlan),
  };
}

/* ─── Feature Checks ─── */

export function canScanChart(info: UserTierInfo, dailyUsed: number): { allowed: boolean; reason?: string } {
  const limit = info.tier.limits.chartScansPerDay;
  if (limit === -1) return { allowed: true };
  if (dailyUsed >= limit) {
    return { allowed: false, reason: `Daily scan limit reached (${limit}/${limit}). Upgrade for more.` };
  }
  return { allowed: true };
}

export function canSendChat(info: UserTierInfo, dailyUsed: number): { allowed: boolean; reason?: string } {
  const limit = info.tier.limits.aiChatPerDay;
  if (limit === -1) return { allowed: true };
  if (dailyUsed >= limit) {
    return { allowed: false, reason: `Daily chat limit reached (${limit}/${limit}). Upgrade for more.` };
  }
  return { allowed: true };
}

export function canUseVoice(info: UserTierInfo): boolean {
  return info.tier.limits.voiceAssistant;
}

export function canAccessFundamentals(info: UserTierInfo): boolean {
  return info.tier.limits.fundamentals;
}

export function canViewSignalTrackRecord(info: UserTierInfo): boolean {
  return info.tier.limits.signalTrackRecord;
}

export function canUseWatchlist(info: UserTierInfo): { allowed: boolean; maxPairs: number } {
  const max = info.tier.limits.watchlistPairs;
  return { allowed: max > 0, maxPairs: max };
}

export function canViewAiReasoning(info: UserTierInfo): boolean {
  return info.tier.limits.aiReasoning;
}

/* ─── Signal Access ─── */

export type SignalVisibility = "full" | "delayed" | "blurred";

export function getSignalVisibility(
  info: UserTierInfo,
  signalGrade: "A" | "B" | "C" | "D"
): SignalVisibility {
  const access = info.tier.limits.signalAccess;

  switch (access) {
    case "all_priority":
    case "all":
      return "full";

    case "grade_bc_a_delayed":
      if (signalGrade === "A") return "delayed";
      if (signalGrade === "B" || signalGrade === "C") return "full";
      return "blurred";

    case "grade_bc":
      if (signalGrade === "B" || signalGrade === "C") return "full";
      return "blurred";

    case "blurred":
    default:
      return "blurred";
  }
}

export function getSignalDelay(info: UserTierInfo): number {
  return info.tier.limits.signalDelay;
}

/* ─── Smart Money Access ─── */

export type SmartMoneyVisibility = "full" | "basic" | "locked";

export function getSmartMoneyVisibility(info: UserTierInfo): SmartMoneyVisibility {
  return info.tier.limits.smartMoney;
}

/* ─── Briefing Access ─── */

export function getBriefingAccess(info: UserTierInfo): "full" | "headline" | "none" {
  return info.tier.limits.morningBriefing;
}

/* ─── Minimum Tier Required ─── */

export function getMinimumTierFor(feature: string): TierId {
  const requirements: Record<string, TierId> = {
    "chart_scan": "free",
    "signal_feed": "free",
    "signal_details_bc": "basic",
    "signal_details_a": "starter",
    "signal_instant": "pro",
    "smart_money_basic": "basic",
    "smart_money_full": "pro",
    "voice_assistant": "pro",
    "fundamentals": "pro",
    "track_record": "pro",
    "watchlist": "pro",
    "ai_reasoning": "starter",
    "trade_journal": "unlimited",
    "priority_delivery": "unlimited",
    "export_history": "unlimited",
    "morning_briefing": "basic",
  };
  return requirements[feature] || "basic";
}

/* ─── Upgrade Suggestion ─── */

export function getUpgradeSuggestion(info: UserTierInfo, feature: string): {
  requiredTier: TierId;
  tierName: string;
  price: number;
  message: string;
} {
  const required = getMinimumTierFor(feature);
  const tier = getTier(required);
  return {
    requiredTier: required,
    tierName: tier.name,
    price: tier.monthlyPrice,
    message: `Upgrade to ${tier.name} (R${tier.monthlyPrice}/mo) to unlock this feature.`,
  };
}
