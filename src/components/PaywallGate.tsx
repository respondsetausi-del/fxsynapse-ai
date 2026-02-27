"use client";
import Link from "next/link";
import { type TierId } from "@/lib/tier-config";

interface PaywallGateProps {
  /** Is the user allowed to see this content? */
  locked: boolean;
  /** What feature is being gated (for messaging) */
  feature?: string;
  /** Minimum tier needed to unlock */
  requiredTier?: TierId;
  /** Custom CTA text */
  ctaText?: string;
  /** Custom message */
  message?: string;
  /** Compact mode (inline, no big modal feel) */
  compact?: boolean;
  /** The content to show (blurred if locked) */
  children: React.ReactNode;
  /** Optional: show a teaser above the blur */
  teaser?: React.ReactNode;
}

const TIER_LABELS: Record<string, { name: string; price: string; color: string }> = {
  basic:     { name: "Basic",     price: "R79/mo",  color: "#4da0ff" },
  starter:   { name: "Starter",   price: "R199/mo", color: "#00e5a0" },
  pro:       { name: "Pro",       price: "R349/mo", color: "#f59e0b" },
  unlimited: { name: "Unlimited", price: "R499/mo", color: "#a855f7" },
};

export default function PaywallGate({
  locked,
  feature,
  requiredTier = "basic",
  ctaText,
  message,
  compact = false,
  children,
  teaser,
}: PaywallGateProps) {
  if (!locked) return <>{children}</>;

  const tierInfo = TIER_LABELS[requiredTier] || TIER_LABELS.basic;

  /* ─── Compact Inline Gate ─── */
  if (compact) {
    return (
      <div className="relative">
        {/* Blurred content */}
        <div className="select-none pointer-events-none" style={{ filter: "blur(12px)", opacity: 0.4 }}>
          {children}
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: "rgba(10,11,16,.6)", backdropFilter: "blur(4px)" }}>
          <Link href="/pricing" className="flex items-center gap-2 px-4 py-2 rounded-xl no-underline transition-all hover:scale-105" style={{ background: `${tierInfo.color}12`, border: `1px solid ${tierInfo.color}25` }}>
            <span className="text-sm">🔒</span>
            <span className="text-[11px] font-bold" style={{ color: tierInfo.color }}>
              {ctaText || `Unlock with ${tierInfo.name} — ${tierInfo.price}`}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  /* ─── Full Gate ─── */
  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Teaser (visible above blur) */}
      {teaser && <div className="relative z-[1]">{teaser}</div>}

      {/* Blurred content */}
      <div className="select-none pointer-events-none" style={{ filter: "blur(14px)", opacity: 0.35, userSelect: "none" }}>
        {children}
      </div>

      {/* Gate overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 rounded-2xl" style={{
        background: "rgba(10,11,16,.75)",
        backdropFilter: "blur(8px) saturate(0.5)",
        WebkitBackdropFilter: "blur(8px) saturate(0.5)",
      }}>
        {/* Noise layer */}
        <div className="absolute inset-0 rounded-2xl" style={{
          background: "repeating-linear-gradient(0deg, rgba(10,11,16,.12) 0px, transparent 1px, transparent 2px)",
          opacity: 0.5,
        }} />

        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-xs">
          {/* Lock icon */}
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{
            background: `${tierInfo.color}10`,
            border: `2px solid ${tierInfo.color}25`,
            boxShadow: `0 0 30px ${tierInfo.color}10`,
          }}>
            <span className="text-2xl">🔒</span>
          </div>

          {/* Message */}
          <div className="text-sm font-bold text-white mb-1">
            {message || getFeatureMessage(feature)}
          </div>
          <div className="text-[10px] mb-4" style={{ color: "rgba(255,255,255,.4)" }}>
            Available on {tierInfo.name} and above
          </div>

          {/* Feature pills */}
          {feature && (
            <div className="flex flex-wrap gap-1.5 justify-center mb-4">
              {getFeaturePills(feature).map((pill, i) => (
                <span key={i} className="text-[8px] font-mono px-2 py-0.5 rounded-full" style={{
                  background: `${tierInfo.color}08`,
                  border: `1px solid ${tierInfo.color}15`,
                  color: tierInfo.color,
                }}>
                  {pill}
                </span>
              ))}
            </div>
          )}

          {/* CTA Button */}
          <Link href="/pricing" className="px-6 py-2.5 rounded-xl text-[11px] font-bold no-underline transition-all hover:scale-105" style={{
            background: `linear-gradient(135deg, ${tierInfo.color}, ${tierInfo.color}cc)`,
            color: "#0a0b0f",
            boxShadow: `0 4px 20px ${tierInfo.color}30`,
          }}>
            {ctaText || `Upgrade to ${tierInfo.name} — ${tierInfo.price}`}
          </Link>

          {/* View all plans */}
          <Link href="/pricing" className="text-[9px] font-mono mt-2 no-underline" style={{ color: "rgba(255,255,255,.25)" }}>
            View all plans →
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Blurred Value Display ─── */
export function BlurredValue({ locked, value, color = "#fff" }: { locked: boolean; value: string | number; color?: string }) {
  if (!locked) return <span style={{ color }}>{value}</span>;
  return (
    <span className="font-mono select-none inline-flex items-center gap-1" style={{ color, filter: "blur(10px)", userSelect: "none", pointerEvents: "none" }}>
      ●●●●●
    </span>
  );
}

/* ─── Signal Card Gate ─── */
export function SignalGate({
  locked,
  visibility,
  requiredTier = "basic",
  children,
}: {
  locked: boolean;
  visibility: "full" | "delayed" | "blurred";
  requiredTier?: TierId;
  children: React.ReactNode;
}) {
  if (visibility === "full" && !locked) return <>{children}</>;

  const tierInfo = TIER_LABELS[requiredTier] || TIER_LABELS.basic;

  if (visibility === "delayed") {
    return (
      <div className="relative">
        <div className="relative">{children}</div>
        <div className="absolute top-2 right-2 px-2 py-1 rounded-lg text-[8px] font-mono font-bold" style={{
          background: "rgba(245,158,11,.1)",
          border: "1px solid rgba(245,158,11,.15)",
          color: "#f59e0b",
        }}>
          ⏱ 15 MIN DELAYED
        </div>
      </div>
    );
  }

  // Blurred
  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="select-none pointer-events-none" style={{ filter: "blur(12px)", opacity: 0.3, userSelect: "none" }}>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(10,11,16,.7)", backdropFilter: "blur(4px)" }}>
        <Link href="/pricing" className="flex flex-col items-center gap-1.5 no-underline group">
          <span className="text-lg">🔒</span>
          <span className="text-[10px] font-bold transition-all group-hover:scale-105" style={{ color: tierInfo.color }}>
            Unlock — {tierInfo.price}
          </span>
        </Link>
      </div>
    </div>
  );
}

/* ─── Smart Money Gate ─── */
export function SmartMoneyGate({
  access,
  type,
  children,
}: {
  access: "full" | "basic" | "locked";
  type: "ob" | "sr" | "fvg" | "liquidity" | "supply_demand" | "bos";
  children: React.ReactNode;
}) {
  // S/R and OBs are available from Basic tier
  const basicFeatures = ["ob", "sr"];
  // Everything else needs Pro
  const proFeatures = ["fvg", "liquidity", "supply_demand", "bos"];

  if (access === "full") return <>{children}</>;
  if (access === "basic" && basicFeatures.includes(type)) return <>{children}</>;

  // Locked
  const requiredTier = access === "locked" ? "basic" : "pro";
  const tierInfo = TIER_LABELS[requiredTier] || TIER_LABELS.pro;

  return (
    <div className="relative rounded-lg overflow-hidden">
      <div className="select-none pointer-events-none" style={{ filter: "blur(10px)", opacity: 0.25 }}>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(10,11,16,.65)" }}>
        <Link href="/pricing" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg no-underline" style={{ background: `${tierInfo.color}10`, border: `1px solid ${tierInfo.color}15` }}>
          <span className="text-[10px]">🔒</span>
          <span className="text-[9px] font-bold" style={{ color: tierInfo.color }}>
            {tierInfo.name} — {tierInfo.price}
          </span>
        </Link>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function getFeatureMessage(feature?: string): string {
  const messages: Record<string, string> = {
    "signal_details": "Full Signal Details Locked",
    "smart_money": "Smart Money Analysis Locked",
    "voice_assistant": "Voice Assistant Locked",
    "fundamentals": "AI Fundamentals Locked",
    "track_record": "Signal Track Record Locked",
    "watchlist": "Custom Watchlist Locked",
    "ai_reasoning": "AI Reasoning Locked",
    "trade_journal": "Trade Journal Locked",
    "chart_scan": "More Scans Needed",
    "chat": "Chat Limit Reached",
  };
  return messages[feature || ""] || "Feature Locked";
}

function getFeaturePills(feature: string): string[] {
  const pills: Record<string, string[]> = {
    "signal_details": ["Entry Price", "Stop Loss", "Take Profit", "R:R Ratio"],
    "smart_money": ["FVGs", "Liquidity", "Supply/Demand", "BOS/CHoCH"],
    "voice_assistant": ["Voice Commands", "Audio Analysis", "Hands-Free Trading"],
    "fundamentals": ["Economic Calendar", "News Impact", "Market Brief"],
    "track_record": ["Win Rate", "Pip History", "Performance Stats"],
    "watchlist": ["24/7 Monitoring", "Breakout Alerts", "Custom Pairs"],
    "ai_reasoning": ["Setup Logic", "Confluence Analysis", "Risk Assessment"],
    "chart_scan": ["15 Scans/Day", "50 Scans/Day", "Unlimited"],
  };
  return pills[feature] || [];
}
