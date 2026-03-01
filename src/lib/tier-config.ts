/* ─── FXSynapse AI — Tier Configuration ───
 * Single source of truth for ALL plan details.
 * Used by: pricing page, payment routes, credits system, feature gating.
 */

export type TierId = "free" | "basic" | "starter" | "pro" | "unlimited";
export type BillingPeriod = "monthly" | "yearly";

export interface TierConfig {
  id: TierId;
  name: string;
  tagline: string;
  monthlyPrice: number;       // ZAR
  yearlyPrice: number;        // ZAR total per year
  yearlyMonthly: number;      // ZAR effective monthly when yearly
  yearlySavings: number;      // ZAR saved vs monthly
  color: string;
  badge: string | null;
  popular?: boolean;

  // Limits
  limits: {
    chartScansPerDay: number;     // -1 = unlimited
    aiChatPerDay: number;         // -1 = unlimited
    signalAccess: "none" | "blurred" | "grade_bc" | "grade_bc_a_delayed" | "all" | "all_priority";
    signalDelay: number;          // minutes delay for signals (0 = instant)
    smartMoney: "locked" | "basic" | "full";
    voiceAssistant: boolean;
    morningBriefing: "headline" | "full" | "none";
    fundamentals: boolean;
    signalTrackRecord: boolean;
    watchlistPairs: number;       // 0 = no watchlist
    aiReasoning: boolean;
    priorityDelivery: boolean;
    tradeJournal: boolean;
    exportHistory: boolean;
    watermark: boolean;
  };

  // Features list for pricing page
  features: { text: string; included: boolean }[];
}

/* ═══ THE PLANS ═══ */

export const TIERS: Record<TierId, TierConfig> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Taste the power",
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyMonthly: 0,
    yearlySavings: 0,
    color: "rgba(255,255,255,.4)",
    badge: null,
    limits: {
      chartScansPerDay: 1,
      aiChatPerDay: 0,
      signalAccess: "none",
      signalDelay: 0,
      smartMoney: "locked",
      voiceAssistant: false,
      morningBriefing: "none",
      fundamentals: false,
      signalTrackRecord: false,
      watchlistPairs: 0,
      aiReasoning: false,
      priorityDelivery: false,
      tradeJournal: false,
      exportHistory: false,
      watermark: true,
    },
    features: [
      { text: "1 free AI chart scan", included: true },
      { text: "Trend & structure analysis", included: true },
      { text: "Annotated chart with levels", included: true },
      { text: "Entry, SL, TP & R:R", included: false },
      { text: "Smart money levels", included: false },
    ],
  },

  basic: {
    id: "basic",
    name: "Basic",
    tagline: "Get started",
    monthlyPrice: 79,
    yearlyPrice: 749,
    yearlyMonthly: 62,
    yearlySavings: 199,
    color: "#4da0ff",
    badge: null,
    limits: {
      chartScansPerDay: 5,
      aiChatPerDay: 15,
      signalAccess: "grade_bc",
      signalDelay: 15,
      smartMoney: "basic",
      voiceAssistant: false,
      morningBriefing: "full",
      fundamentals: false,
      signalTrackRecord: false,
      watchlistPairs: 0,
      aiReasoning: false,
      priorityDelivery: false,
      tradeJournal: false,
      exportHistory: false,
      watermark: false,
    },
    features: [
      { text: "5 AI chart scans per day", included: true },
      { text: "Full analysis unblurred", included: true },
      { text: "Entry, SL, TP & R:R on every scan", included: true },
      { text: "S/R levels + Order blocks", included: true },
      { text: "AI fundamentals", included: false },
      { text: "AI reasoning on scans", included: false },
    ],
  },

  starter: {
    id: "starter",
    name: "Starter",
    tagline: "Serious trader",
    monthlyPrice: 199,
    yearlyPrice: 1899,
    yearlyMonthly: 158,
    yearlySavings: 489,
    color: "#00e5a0",
    badge: "POPULAR",
    popular: true,
    limits: {
      chartScansPerDay: 15,
      aiChatPerDay: 30,
      signalAccess: "grade_bc_a_delayed",
      signalDelay: 15,
      smartMoney: "basic",
      voiceAssistant: false,
      morningBriefing: "full",
      fundamentals: false,
      signalTrackRecord: false,
      watchlistPairs: 0,
      aiReasoning: true,
      priorityDelivery: false,
      tradeJournal: false,
      exportHistory: false,
      watermark: false,
    },
    features: [
      { text: "15 AI chart scans per day", included: true },
      { text: "Full analysis unblurred", included: true },
      { text: "Entry, SL, TP & R:R on every scan", included: true },
      { text: "S/R levels + Order blocks", included: true },
      { text: "AI reasoning on each scan", included: true },
      { text: "AI fundamentals", included: false },
      { text: "Full smart money (FVGs, liquidity)", included: false },
    ],
  },

  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Active trader",
    monthlyPrice: 349,
    yearlyPrice: 3349,
    yearlyMonthly: 279,
    yearlySavings: 839,
    color: "#f59e0b",
    badge: "BEST VALUE",
    limits: {
      chartScansPerDay: 50,
      aiChatPerDay: 100,
      signalAccess: "all",
      signalDelay: 0,
      smartMoney: "full",
      voiceAssistant: true,
      morningBriefing: "full",
      fundamentals: true,
      signalTrackRecord: true,
      watchlistPairs: 5,
      aiReasoning: true,
      priorityDelivery: false,
      tradeJournal: false,
      exportHistory: false,
      watermark: false,
    },
    features: [
      { text: "50 AI chart scans per day", included: true },
      { text: "Full analysis unblurred", included: true },
      { text: "Entry, SL, TP & R:R on every scan", included: true },
      { text: "Full smart money (OBs, FVGs, liquidity, S/D)", included: true },
      { text: "AI reasoning on each scan", included: true },
      { text: "AI fundamentals access", included: true },
    ],
  },

  unlimited: {
    id: "unlimited",
    name: "Unlimited",
    tagline: "Full power",
    monthlyPrice: 499,
    yearlyPrice: 4799,
    yearlyMonthly: 400,
    yearlySavings: 1189,
    color: "#a855f7",
    badge: "FULL POWER",
    limits: {
      chartScansPerDay: -1,
      aiChatPerDay: -1,
      signalAccess: "all_priority",
      signalDelay: 0,
      smartMoney: "full",
      voiceAssistant: true,
      morningBriefing: "full",
      fundamentals: true,
      signalTrackRecord: true,
      watchlistPairs: 15,
      aiReasoning: true,
      priorityDelivery: true,
      tradeJournal: true,
      exportHistory: true,
      watermark: false,
    },
    features: [
      { text: "Unlimited AI chart scans", included: true },
      { text: "Full analysis unblurred", included: true },
      { text: "Entry, SL, TP & R:R on every scan", included: true },
      { text: "Full smart money + AI reasoning", included: true },
      { text: "AI fundamentals access", included: true },
      { text: "Everything included, no limits", included: true },
    ],
  },
};

/* ═══ CREDIT PACKS ═══ */

export interface CreditPack {
  id: string;
  credits: number;
  price: number;        // ZAR
  priceCents: number;   // ZAR cents for Yoco
  perScan: string;
  popular?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_5", credits: 5, price: 49, priceCents: 4900, perScan: "R9.80" },
  { id: "pack_12", credits: 12, price: 99, priceCents: 9900, perScan: "R8.25", popular: true },
  { id: "pack_30", credits: 30, price: 199, priceCents: 19900, perScan: "R6.63" },
];

/* ═══ HELPERS ═══ */

export function getTier(tierId: string | null | undefined): TierConfig {
  if (!tierId || !(tierId in TIERS)) return TIERS.free;
  return TIERS[tierId as TierId];
}

export function getTierOrder(tierId: string): number {
  const order: Record<string, number> = { free: 0, basic: 1, starter: 2, pro: 3, unlimited: 4 };
  return order[tierId] ?? 0;
}

export function isUpgrade(from: string, to: string): boolean {
  return getTierOrder(to) > getTierOrder(from);
}

export function canAccess(userTier: string, requiredTier: TierId): boolean {
  return getTierOrder(userTier) >= getTierOrder(requiredTier);
}

export function getPlanPriceCents(planId: string, period: BillingPeriod): number {
  const tier = getTier(planId);
  if (period === "yearly") return tier.yearlyPrice * 100;
  return tier.monthlyPrice * 100;
}

export function getAllPaidTiers(): TierConfig[] {
  return [TIERS.basic, TIERS.starter, TIERS.pro, TIERS.unlimited];
}

export function getSubscriptionMonths(period: BillingPeriod): number {
  return period === "yearly" ? 12 : 1;
}
