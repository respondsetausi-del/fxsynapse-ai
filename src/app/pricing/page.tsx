"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PLANS = [
  {
    id: "starter", name: "Starter", price: 49, period: "/month",
    scans: "15 scans/month", badge: null,
    features: [
      { text: "15 chart scans per month", included: true },
      { text: "Full annotations & analysis", included: true },
      { text: "Trade setups (Entry/TP/SL/R:R)", included: true },
      { text: "Support & Resistance levels", included: true },
      { text: "Scan history", included: true },
      { text: "AI Fundamentals & News", included: false },
      { text: "Priority processing", included: false },
    ],
    cta: "Get Starter",
    color: "#4da0ff",
  },
  {
    id: "pro", name: "Pro", price: 99, period: "/month",
    scans: "50 scans/month", badge: "MOST POPULAR",
    features: [
      { text: "50 chart scans per month", included: true },
      { text: "Full annotations & analysis", included: true },
      { text: "Trade setups (Entry/TP/SL/R:R)", included: true },
      { text: "Confluence grading", included: true },
      { text: "Full scan history", included: true },
      { text: "AI Fundamentals & Market Brief", included: true },
      { text: "Priority processing", included: false },
    ],
    cta: "Get Pro",
    color: "#00e5a0",
    popular: true,
  },
  {
    id: "premium", name: "Premium", price: 199, period: "/month",
    scans: "Unlimited scans", badge: "BEST VALUE",
    features: [
      { text: "Unlimited chart scans", included: true },
      { text: "Full annotations & analysis", included: true },
      { text: "Trade setups (Entry/TP/SL/R:R)", included: true },
      { text: "Confluence grading", included: true },
      { text: "Full scan history", included: true },
      { text: "AI Fundamentals & Market Brief", included: true },
      { text: "Priority processing & support", included: true },
    ],
    cta: "Go Premium",
    color: "#f0b90b",
  },
];

const TOPUP_PACKS = [
  { id: "topup_5", credits: 5, price: 25, perScan: "R5.00" },
  { id: "topup_10", credits: 10, price: 45, perScan: "R4.50", popular: true },
  { id: "topup_20", credits: 20, price: 80, perScan: "R4.00" },
];

export default function PricingPage() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [user, setUser] = useState<boolean>(false);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const supabase = createClient();
  const searchParams = useSearchParams();
  const isGated = searchParams.get("gate") === "1";

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
        body: JSON.stringify({ type: "subscription", planId }),
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

  return (
    <div className="min-h-screen relative" style={{ background: "#0a0b0f" }}>
      {/* BG */}
      <div className="fixed inset-0 z-0">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.07) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ bottom: "-20%", right: "-10%", width: 450, height: 450, background: "radial-gradient(circle,rgba(77,160,255,.05) 0%,transparent 70%)", filter: "blur(80px)" }} />
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

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Paywall Gate Banner */}
        {isGated && (
          <div className="max-w-lg mx-auto mb-8 rounded-xl px-5 py-4 text-center" style={{ background: "rgba(240,185,11,.06)", border: "1px solid rgba(240,185,11,.15)" }}>
            <div className="text-lg font-bold text-white mb-1">Choose your plan to get started</div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,.45)" }}>Pick a plan below and start scanning charts with AI-powered analysis</div>
          </div>
        )}

        {/* Launch Promo */}
        <div className="max-w-lg mx-auto mb-8 rounded-xl px-5 py-3 text-center" style={{ background: "linear-gradient(135deg, rgba(240,185,11,.06), rgba(0,229,160,.06))", border: "1px solid rgba(240,185,11,.15)" }}>
          <div className="text-[10px] font-mono font-bold mb-0.5" style={{ color: "#f0b90b" }}>🔥 LAUNCH SPECIAL</div>
          <div className="text-sm font-bold text-white">50% off your first month — limited time</div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>Use code <span className="font-bold" style={{ color: "#00e5a0" }}>LAUNCH50</span> at checkout</div>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-white mb-2" style={{ fontFamily: "'Outfit',sans-serif" }}>
            Choose your plan
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,.5)" }}>
            Professional AI chart analysis — pick the scans you need
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-14">
          {PLANS.map((plan) => (
            <div key={plan.id} className="rounded-2xl p-5 relative transition-all" style={{
              background: plan.popular ? "rgba(0,229,160,.04)" : "rgba(255,255,255,.02)",
              border: `1px solid ${plan.popular ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
            }}>
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold font-mono" style={{ background: plan.color, color: "#0a0b0f" }}>
                  {plan.badge}
                </div>
              )}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-extrabold" style={{ color: plan.color }}>
                    R{plan.price}
                  </span>
                  <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{plan.period}</span>
                </div>
                <div className="text-xs font-mono mt-2 px-2 py-1 rounded inline-block" style={{ background: plan.color + "15", color: plan.color }}>
                  {plan.scans}
                </div>
              </div>
              <ul className="flex flex-col gap-2 mb-5">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: f.included ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.2)" }}>
                    <span style={{ color: f.included ? "#00e5a0" : "rgba(255,255,255,.15)", marginTop: 1 }}>
                      {f.included ? "✓" : "✕"}
                    </span>
                    <span style={{ textDecoration: f.included ? "none" : "line-through" }}>{f.text}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={isCurrentActive(plan.id) || loading === plan.id}
                className="w-full py-3 rounded-xl text-sm font-bold cursor-pointer transition-opacity"
                style={{
                  background: isCurrentActive(plan.id) ? "rgba(255,255,255,.04)" : plan.popular ? "linear-gradient(135deg,#00e5a0,#00b87d)" : `${plan.color}15`,
                  border: isCurrentActive(plan.id) ? "1px solid rgba(255,255,255,.08)" : `1px solid ${plan.color}30`,
                  color: isCurrentActive(plan.id) ? "rgba(255,255,255,.3)" : plan.popular ? "#0a0b0f" : plan.color,
                  opacity: loading === plan.id ? 0.6 : 1,
                }}
              >
                {isCurrentActive(plan.id) ? "Current Plan" : loading === plan.id ? "Loading..." : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="max-w-2xl mx-auto mb-14">
          <h2 className="text-xl font-bold text-white text-center mb-6">Compare Plans</h2>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.06)" }}>
            {[
              { feature: "Monthly scans", starter: "15", pro: "50", premium: "∞" },
              { feature: "Chart annotations", starter: "✓", pro: "✓", premium: "✓" },
              { feature: "Trade setups (Entry/TP/SL)", starter: "✓", pro: "✓", premium: "✓" },
              { feature: "Risk:Reward ratio", starter: "✓", pro: "✓", premium: "✓" },
              { feature: "Confluence grading", starter: "—", pro: "✓", premium: "✓" },
              { feature: "AI Fundamentals", starter: "—", pro: "✓", premium: "✓" },
              { feature: "Scan history", starter: "✓", pro: "Full", premium: "Full" },
              { feature: "Priority processing", starter: "—", pro: "—", premium: "✓" },
              { feature: "Top-up credits", starter: "✓", pro: "✓", premium: "✓" },
            ].map((row, i) => (
              <div key={i} className="flex items-center px-4 py-2.5" style={{ background: i % 2 === 0 ? "rgba(255,255,255,.01)" : "transparent", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="flex-1 text-xs" style={{ color: "rgba(255,255,255,.55)" }}>{row.feature}</span>
                <span className="w-16 text-center text-[11px] font-mono" style={{ color: "#4da0ff" }}>{row.starter}</span>
                <span className="w-16 text-center text-[11px] font-mono font-bold" style={{ color: "#00e5a0" }}>{row.pro}</span>
                <span className="w-16 text-center text-[11px] font-mono font-bold" style={{ color: "#f0b90b" }}>{row.premium}</span>
              </div>
            ))}
            <div className="flex items-center px-4 py-1.5" style={{ background: "rgba(255,255,255,.02)" }}>
              <span className="flex-1" />
              <span className="w-16 text-center text-[9px] font-mono" style={{ color: "rgba(77,160,255,.5)" }}>Starter</span>
              <span className="w-16 text-center text-[9px] font-mono" style={{ color: "rgba(0,229,160,.5)" }}>Pro</span>
              <span className="w-16 text-center text-[9px] font-mono" style={{ color: "rgba(240,185,11,.5)" }}>Premium</span>
            </div>
          </div>
        </div>

        {/* Top-up Packs */}
        {user && subStatus === "active" && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white mb-1">Need Extra Scans?</h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,.4)" }}>
                Buy top-up credits when you run out. Credits never expire.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto mb-10">
              {TOPUP_PACKS.map((pack) => (
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
                    {loading === pack.id ? "Loading..." : "Buy Top-up"}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-center text-[10px] font-mono mt-8" style={{ color: "rgba(255,255,255,.2)" }}>
          Payments securely processed by Yoco. All prices in ZAR. Top-up credits never expire.
        </p>
      </div>
    </div>
  );
}
