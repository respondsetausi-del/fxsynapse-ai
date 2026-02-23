"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const PLANS = [
  {
    id: "free", name: "Free", price: 0, period: "forever",
    scans: "1 / day",
    features: [
      { text: "1 scan per day", included: true },
      { text: "Basic trend & S/R levels", included: true },
      { text: "Standard processing", included: true },
      { text: "Last 3 scans in history", included: true },
      { text: "Trade setups (Entry/TP/SL)", included: false },
      { text: "Confluence grading", included: false },
      { text: "AI Fundamentals & News", included: false },
      { text: "Chart download", included: false },
    ],
    cta: "Current Plan",
  },
  {
    id: "pro", name: "Pro", price: 99, period: "/month",
    scans: "15 / day",
    features: [
      { text: "15 scans per day", included: true },
      { text: "Full annotations & analysis", included: true },
      { text: "Trade setups (Entry/TP/SL/R:R)", included: true },
      { text: "Confluence grading", included: true },
      { text: "Full scan history", included: true },
      { text: "AI Fundamentals & Market Brief", included: true },
      { text: "Credit top-ups available", included: true },
      { text: "Priority support", included: false },
    ],
    cta: "Upgrade to Pro",
    popular: true,
  },
  {
    id: "premium", name: "Premium", price: 249, period: "/month",
    scans: "Unlimited",
    features: [
      { text: "Unlimited scans", included: true },
      { text: "Full annotations & analysis", included: true },
      { text: "Trade setups (Entry/TP/SL/R:R)", included: true },
      { text: "Confluence grading", included: true },
      { text: "Full scan history", included: true },
      { text: "AI Fundamentals & Market Brief", included: true },
      { text: "Chart download with watermark", included: true },
      { text: "Priority processing & support", included: true },
    ],
    cta: "Go Premium",
  },
];

const CREDIT_PACKS = [
  { id: "pack_10", credits: 10, price: 15, perScan: "R1.50" },
  { id: "pack_50", credits: 50, price: 49, perScan: "R0.98" },
  { id: "pack_100", credits: 100, price: 79, perScan: "R0.79", popular: true },
  { id: "pack_500", credits: 500, price: 299, perScan: "R0.60" },
];

export default function PricingPage() {
  const [currentPlan, setCurrentPlan] = useState("free");
  const [loading, setLoading] = useState<string | null>(null);
  const [user, setUser] = useState<boolean>(false);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) {
        setUser(true);
        const res = await fetch("/api/user");
        if (res.ok) {
          const data = await res.json();
          setCurrentPlan(data.profile.plan_id);
        }
      }
    })();
  }, [supabase]);

  const handleSubscribe = async (planId: string) => {
    if (!user) { window.location.href = "/login?redirect=/pricing"; return; }
    if (planId === "free" || planId === currentPlan) return;
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

  const handleCredits = async (packId: string) => {
    if (!user) { window.location.href = "/login?redirect=/pricing"; return; }
    setLoading(packId);
    try {
      const res = await fetch("/api/payments/yoco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "credits", packId }),
      });
      const data = await res.json();
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {}
    setLoading(null);
  };

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
        <Link href={user ? "/dashboard?scanner=true" : "/"} className="text-xs font-mono px-3 py-1.5 rounded-lg no-underline" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>
          ← Back
        </Link>
      </header>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {/* Launch Promo */}
        <div className="max-w-lg mx-auto mb-8 rounded-xl px-5 py-3 text-center" style={{ background: "linear-gradient(135deg, rgba(240,185,11,.06), rgba(0,229,160,.06))", border: "1px solid rgba(240,185,11,.15)" }}>
          <div className="text-[10px] font-mono font-bold mb-0.5" style={{ color: "#f0b90b" }}>🔥 EARLY SUPPORTER LAUNCH SPECIAL</div>
          <div className="text-sm font-bold text-white">50% off your first month — limited time</div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>Use code <span className="font-bold" style={{ color: "#00e5a0" }}>LAUNCH50</span> at checkout</div>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-white mb-2" style={{ fontFamily: "'Outfit',sans-serif" }}>
            Choose your plan
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,.5)" }}>
            40+ traders already scanning with FXSynapse AI
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-14">
          {PLANS.map((plan) => (
            <div key={plan.id} className="rounded-2xl p-5 relative transition-all" style={{
              background: plan.popular ? "rgba(0,229,160,.04)" : "rgba(255,255,255,.02)",
              border: `1px solid ${plan.popular ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
            }}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold font-mono" style={{ background: "#00e5a0", color: "#0a0b0f" }}>
                  MOST POPULAR
                </div>
              )}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-extrabold" style={{ color: plan.popular ? "#00e5a0" : "#fff" }}>
                    {plan.price === 0 ? "Free" : `R${plan.price}`}
                  </span>
                  {plan.price > 0 && <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{plan.period}</span>}
                </div>
                <div className="text-xs font-mono mt-2 px-2 py-1 rounded inline-block" style={{ background: "rgba(77,160,255,.1)", color: "#4da0ff" }}>
                  {plan.scans} scans
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
                disabled={plan.id === currentPlan || loading === plan.id}
                className="w-full py-3 rounded-xl text-sm font-bold cursor-pointer transition-opacity"
                style={{
                  background: plan.id === currentPlan ? "rgba(255,255,255,.04)" : plan.popular ? "linear-gradient(135deg,#00e5a0,#00b87d)" : "rgba(255,255,255,.06)",
                  border: plan.id === currentPlan ? "1px solid rgba(255,255,255,.08)" : "none",
                  color: plan.id === currentPlan ? "rgba(255,255,255,.3)" : plan.popular ? "#0a0b0f" : "#fff",
                  opacity: loading === plan.id ? 0.6 : 1,
                }}
              >
                {plan.id === currentPlan ? "Current Plan" : loading === plan.id ? "Loading..." : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Free vs Pro comparison */}
        <div className="max-w-2xl mx-auto mb-14">
          <h2 className="text-xl font-bold text-white text-center mb-6">Free vs Pro — What you&apos;re missing</h2>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.06)" }}>
            {[
              { feature: "Daily scans", free: "1", pro: "15", premium: "∞" },
              { feature: "Trend & S/R analysis", free: "✓", pro: "✓", premium: "✓" },
              { feature: "Trade setups (Entry/TP/SL)", free: "🔒", pro: "✓", premium: "✓" },
              { feature: "Risk:Reward ratio", free: "🔒", pro: "✓", premium: "✓" },
              { feature: "Confluence grading", free: "🔒", pro: "✓", premium: "✓" },
              { feature: "Scan history", free: "Last 3", pro: "Full", premium: "Full" },
              { feature: "Chart download", free: "🔒", pro: "🔒", premium: "✓" },
              { feature: "Priority processing", free: "—", pro: "—", premium: "✓" },
            ].map((row, i) => (
              <div key={i} className="flex items-center px-4 py-2.5" style={{ background: i % 2 === 0 ? "rgba(255,255,255,.01)" : "transparent", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="flex-1 text-xs" style={{ color: "rgba(255,255,255,.55)" }}>{row.feature}</span>
                <span className="w-16 text-center text-[11px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{row.free}</span>
                <span className="w-16 text-center text-[11px] font-mono font-bold" style={{ color: "#00e5a0" }}>{row.pro}</span>
                <span className="w-16 text-center text-[11px] font-mono font-bold" style={{ color: "#f0b90b" }}>{row.premium}</span>
              </div>
            ))}
            <div className="flex items-center px-4 py-1.5" style={{ background: "rgba(255,255,255,.02)" }}>
              <span className="flex-1" />
              <span className="w-16 text-center text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>Free</span>
              <span className="w-16 text-center text-[9px] font-mono" style={{ color: "rgba(0,229,160,.5)" }}>Pro</span>
              <span className="w-16 text-center text-[9px] font-mono" style={{ color: "rgba(240,185,11,.5)" }}>Premium</span>
            </div>
          </div>
        </div>

        {/* Credit Packs */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Credit Top-ups</h2>
          <p className="text-xs" style={{ color: "rgba(255,255,255,.4)" }}>
            Need extra scans? Buy credits that never expire.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
          {CREDIT_PACKS.map((pack) => (
            <div key={pack.id} className="rounded-xl p-4 text-center relative" style={{
              background: pack.popular ? "rgba(77,160,255,.04)" : "rgba(255,255,255,.02)",
              border: `1px solid ${pack.popular ? "rgba(77,160,255,.2)" : "rgba(255,255,255,.06)"}`,
            }}>
              {pack.popular && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono" style={{ background: "#4da0ff", color: "#0a0b0f" }}>
                  BEST VALUE
                </div>
              )}
              <div className="text-2xl font-extrabold text-white">{pack.credits}</div>
              <div className="text-xs font-mono mb-2" style={{ color: "rgba(255,255,255,.35)" }}>credits</div>
              <div className="text-lg font-bold mb-1" style={{ color: "#4da0ff" }}>R{pack.price}</div>
              <div className="text-[10px] font-mono mb-3" style={{ color: "rgba(255,255,255,.3)" }}>{pack.perScan} / scan</div>
              <button
                onClick={() => handleCredits(pack.id)}
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

        <p className="text-center text-[10px] font-mono mt-8" style={{ color: "rgba(255,255,255,.2)" }}>
          Payments securely processed by Yoco. All prices in ZAR. Credits never expire.
        </p>
      </div>
    </div>
  );
}
