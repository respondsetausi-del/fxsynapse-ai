"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ChatWidget from "@/components/ChatWidget";
import { TIERS, CREDIT_PACKS, getAllPaidTiers, type TierId } from "@/lib/tier-config";

function PricingContent() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [user, setUser] = useState<boolean>(false);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const supabase = createClient();
  const searchParams = useSearchParams();
  const isGated = searchParams.get("gate") === "1";

  const paidTiers = getAllPaidTiers();

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) {
        setUser(true);
        const res = await fetch("/api/user");
        if (res.ok) {
          const data = await res.json();
          setCurrentPlan(data.profile.plan_id);
          setSubStatus(data.profile.subscription_status);
        }
      }
    })();
  }, [supabase]);

  const handleSubscribe = async (planId: string) => {
    if (!user) { window.location.href = "/signup?redirect=/pricing"; return; }
    if (planId === currentPlan && subStatus === "active") return;
    setLoading(planId);
    try {
      const res = await fetch("/api/payments/yoco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "subscription", planId, period: billing }),
      });
      const data = await res.json();
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {}
    setLoading(null);
  };

  const handleTopup = async (packId: string) => {
    if (!user) { window.location.href = "/signup?redirect=/pricing"; return; }
    setLoading(packId);
    try {
      const res = await fetch("/api/payments/yoco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "topup", packId }),
      });
      const data = await res.json();
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {}
    setLoading(null);
  };

  const isCurrentActive = (planId: string) => planId === currentPlan && subStatus === "active";
  const getDisplayPrice = (tier: typeof paidTiers[0]) => billing === "yearly" ? tier.yearlyMonthly : tier.monthlyPrice;
  const getCtaText = (tier: typeof paidTiers[0]) => {
    if (isCurrentActive(tier.id)) return "Current Plan";
    if (loading === tier.id) return "Loading...";
    return `Get ${tier.name}`;
  };

  return (
    <div className="min-h-screen relative" style={{ background: "#0a0b0f" }}>
      {/* BG */}
      <div className="fixed inset-0 z-0">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.07) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ bottom: "-20%", right: "-10%", width: 450, height: 450, background: "radial-gradient(circle,rgba(168,85,247,.05) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4" style={{ paddingTop: 48, borderBottom: "1px solid rgba(255,255,255,.04)" }}>
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <span className="text-base font-bold text-white">FXSynapse<span style={{ color: "#00e5a0" }}> AI</span></span>
        </Link>
        {user ? (
          <Link href="/dashboard?scanner=true" className="text-xs font-mono px-3 py-1.5 rounded-lg no-underline" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>
            ← Dashboard
          </Link>
        ) : (
          <Link href="/login" className="text-xs font-mono px-3 py-1.5 rounded-lg no-underline" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>
            Sign In
          </Link>
        )}
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12">
        {/* Paywall Gate Banner */}
        {isGated && (
          <div className="max-w-lg mx-auto mb-8 rounded-xl px-5 py-4 text-center" style={{ background: "rgba(240,185,11,.06)", border: "1px solid rgba(240,185,11,.15)" }}>
            <div className="text-lg font-bold text-white mb-1">Choose your plan to continue</div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,.45)" }}>Unlock AI-powered chart analysis, smart money signals, and more</div>
          </div>
        )}

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-white mb-2" style={{ fontFamily: "'Outfit',sans-serif" }}>
            Choose Your Plan
          </h1>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,.5)" }}>
            AI chart analysis • Smart money signals • Trade like the institutions
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center rounded-xl p-1" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
            <button onClick={() => setBilling("monthly")} className="px-5 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all"
              style={{ background: billing === "monthly" ? "rgba(0,229,160,.1)" : "transparent", color: billing === "monthly" ? "#00e5a0" : "rgba(255,255,255,.4)" }}>
              Monthly
            </button>
            <button onClick={() => setBilling("yearly")} className="px-5 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all relative"
              style={{ background: billing === "yearly" ? "rgba(0,229,160,.1)" : "transparent", color: billing === "yearly" ? "#00e5a0" : "rgba(255,255,255,.4)" }}>
              Yearly
              <span className="absolute -top-2.5 -right-2 px-1.5 py-0.5 rounded-full text-[8px] font-bold" style={{ background: "#00e5a0", color: "#0a0b0f" }}>SAVE</span>
            </button>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-4 gap-3 mb-14">
          {paidTiers.map((tier) => (
            <div key={tier.id} className="rounded-2xl p-5 relative transition-all" style={{
              background: tier.popular ? "rgba(0,229,160,.04)" : "rgba(255,255,255,.02)",
              border: `1px solid ${tier.popular ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
              transform: tier.popular ? "scale(1.02)" : "none",
            }}>
              {tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold font-mono" style={{ background: tier.color, color: "#0a0b0f" }}>
                  {tier.badge}
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{tier.tagline}</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-3xl font-extrabold" style={{ color: tier.color }}>
                    R{getDisplayPrice(tier)}
                  </span>
                  <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,.35)" }}>/month</span>
                </div>
                {billing === "yearly" && (
                  <div className="mt-1">
                    <span className="text-[10px] font-mono line-through" style={{ color: "rgba(255,255,255,.2)" }}>R{tier.monthlyPrice}/mo</span>
                    <span className="text-[10px] font-mono font-bold ml-2" style={{ color: "#00e5a0" }}>Save R{tier.yearlySavings}/yr</span>
                  </div>
                )}
                {billing === "yearly" && (
                  <div className="text-[10px] font-mono mt-1" style={{ color: "rgba(255,255,255,.25)" }}>
                    Billed R{tier.yearlyPrice} once per year
                  </div>
                )}
              </div>

              <ul className="flex flex-col gap-2 mb-5">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px]" style={{ color: f.included ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.2)" }}>
                    <span style={{ color: f.included ? "#00e5a0" : "rgba(255,255,255,.12)", marginTop: 1, fontSize: 10 }}>
                      {f.included ? "✓" : "✕"}
                    </span>
                    <span style={{ textDecoration: f.included ? "none" : "line-through" }}>{f.text}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(tier.id)}
                disabled={isCurrentActive(tier.id) || loading === tier.id}
                className="w-full py-3 rounded-xl text-sm font-bold cursor-pointer transition-opacity"
                style={{
                  background: isCurrentActive(tier.id) ? "rgba(255,255,255,.04)" : tier.popular ? "linear-gradient(135deg,#00e5a0,#00b87d)" : `${tier.color}15`,
                  border: isCurrentActive(tier.id) ? "1px solid rgba(255,255,255,.08)" : `1px solid ${tier.color}30`,
                  color: isCurrentActive(tier.id) ? "rgba(255,255,255,.3)" : tier.popular ? "#0a0b0f" : tier.color,
                  opacity: loading === tier.id ? 0.6 : 1,
                }}
              >
                {getCtaText(tier)}
              </button>
            </div>
          ))}
        </div>

        {/* Free Tier Note */}
        <div className="max-w-md mx-auto mb-10 text-center">
          <div className="rounded-xl px-5 py-3" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="text-xs font-bold text-white mb-1">🆓 Free Plan Available</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>
              1 chart scan/day • Signal previews (blurred details) • 3 AI chat messages/day
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="max-w-4xl mx-auto mb-14">
          <h2 className="text-xl font-bold text-white text-center mb-6">Compare All Plans</h2>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.06)" }}>
            {[
              { feature: "AI Chart Scans", free: "1/day", basic: "5/day", starter: "15/day", pro: "50/day", unlimited: "∞" },
              { feature: "AI Chat Messages", free: "3/day", basic: "15/day", starter: "30/day", pro: "100/day", unlimited: "∞" },
              { feature: "Signal Details", free: "🔒", basic: "B+C", starter: "B+C + A delayed", pro: "All instant", unlimited: "All + Priority" },
              { feature: "Smart Money", free: "🔒", basic: "S/R + OBs", starter: "S/R + OBs", pro: "Full SMC", unlimited: "Full SMC" },
              { feature: "AI Reasoning", free: "—", basic: "—", starter: "✓", pro: "✓", unlimited: "✓" },
              { feature: "Voice Assistant", free: "—", basic: "—", starter: "—", pro: "✓", unlimited: "✓" },
              { feature: "AI Fundamentals", free: "—", basic: "—", starter: "—", pro: "✓", unlimited: "✓" },
              { feature: "Morning Briefing", free: "Headline", basic: "Full", starter: "Full", pro: "Full", unlimited: "Full" },
              { feature: "Signal Track Record", free: "—", basic: "—", starter: "—", pro: "✓", unlimited: "✓" },
              { feature: "Custom Watchlist", free: "—", basic: "—", starter: "—", pro: "5 pairs", unlimited: "15 pairs" },
              { feature: "Trade Journal", free: "—", basic: "—", starter: "—", pro: "—", unlimited: "✓" },
              { feature: "Priority Support", free: "—", basic: "—", starter: "—", pro: "—", unlimited: "✓" },
            ].map((row, i) => (
              <div key={i} className="flex items-center px-4 py-2.5 gap-1" style={{ background: i % 2 === 0 ? "rgba(255,255,255,.01)" : "transparent", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="flex-1 text-[11px] font-medium" style={{ color: "rgba(255,255,255,.55)", minWidth: 120 }}>{row.feature}</span>
                <span className="w-14 text-center text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{row.free}</span>
                <span className="w-14 text-center text-[10px] font-mono" style={{ color: "#4da0ff" }}>{row.basic}</span>
                <span className="w-14 text-center text-[10px] font-mono font-bold" style={{ color: "#00e5a0" }}>{row.starter}</span>
                <span className="w-14 text-center text-[10px] font-mono font-bold" style={{ color: "#f59e0b" }}>{row.pro}</span>
                <span className="w-14 text-center text-[10px] font-mono font-bold" style={{ color: "#a855f7" }}>{row.unlimited}</span>
              </div>
            ))}
            <div className="flex items-center px-4 py-1.5" style={{ background: "rgba(255,255,255,.02)" }}>
              <span className="flex-1" />
              <span className="w-14 text-center text-[8px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>Free</span>
              <span className="w-14 text-center text-[8px] font-mono" style={{ color: "rgba(77,160,255,.4)" }}>Basic</span>
              <span className="w-14 text-center text-[8px] font-mono" style={{ color: "rgba(0,229,160,.4)" }}>Starter</span>
              <span className="w-14 text-center text-[8px] font-mono" style={{ color: "rgba(245,158,11,.4)" }}>Pro</span>
              <span className="w-14 text-center text-[8px] font-mono" style={{ color: "rgba(168,85,247,.4)" }}>Unlimited</span>
            </div>
          </div>
        </div>

        {/* Credit Packs */}
        <div className="max-w-xl mx-auto mb-10">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white mb-1">Need Extra Scans?</h2>
            <p className="text-xs" style={{ color: "rgba(255,255,255,.4)" }}>
              Buy credit packs for chart scans. No subscription needed. Credits never expire.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.id} className="rounded-xl p-4 text-center relative" style={{
                background: pack.popular ? "rgba(77,160,255,.04)" : "rgba(255,255,255,.02)",
                border: `1px solid ${pack.popular ? "rgba(77,160,255,.2)" : "rgba(255,255,255,.06)"}`,
              }}>
                {pack.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono" style={{ background: "#4da0ff", color: "#0a0b0f" }}>
                    POPULAR
                  </div>
                )}
                <div className="text-2xl font-extrabold text-white">{pack.credits}</div>
                <div className="text-xs font-mono mb-2" style={{ color: "rgba(255,255,255,.35)" }}>scans</div>
                <div className="text-lg font-bold mb-1" style={{ color: "#4da0ff" }}>R{pack.price}</div>
                <div className="text-[10px] font-mono mb-3" style={{ color: "rgba(255,255,255,.3)" }}>{pack.perScan}/scan</div>
                <button
                  onClick={() => handleTopup(pack.id)}
                  disabled={loading === pack.id}
                  className="w-full py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                  style={{
                    background: pack.popular ? "rgba(77,160,255,.15)" : "rgba(255,255,255,.04)",
                    border: `1px solid ${pack.popular ? "rgba(77,160,255,.25)" : "rgba(255,255,255,.08)"}`,
                    color: pack.popular ? "#4da0ff" : "rgba(255,255,255,.5)",
                    opacity: loading === pack.id ? 0.6 : 1,
                  }}
                >
                  {loading === pack.id ? "Loading..." : "Buy Credits"}
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-[9px] font-mono mt-3" style={{ color: "rgba(255,255,255,.2)" }}>
            Credit packs are for chart scans only. Signal access requires a subscription.
          </p>
        </div>

        {/* R199 value prop */}
        <div className="max-w-md mx-auto mb-10 rounded-xl p-5 text-center" style={{ background: "rgba(0,229,160,.03)", border: "1px solid rgba(0,229,160,.1)" }}>
          <div className="text-sm font-bold text-white mb-2">R199 is less than one bad trade.</div>
          <div className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,.4)" }}>
            The average trader loses R500+ on a single wrong entry. FXSynapse AI helps you avoid those losses with institutional-grade analysis and smart money detection. Pay R199 once, save thousands.
          </div>
        </div>

        <p className="text-center text-[10px] font-mono mt-8" style={{ color: "rgba(255,255,255,.2)" }}>
          Payments securely processed by Yoco. All prices in ZAR. Cancel anytime.
        </p>
      </div>
      <ChatWidget />
    </div>
  );
}

export default function PricingPage() {
  return <Suspense><PricingContent /></Suspense>;
}
