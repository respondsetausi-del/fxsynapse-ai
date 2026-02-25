"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import ChatWidget from "@/components/ChatWidget";

const PX = Array.from({ length: 30 }, (_, i) => ({
  id: i, x: Math.random() * 100, y: Math.random() * 100,
  s: Math.random() * 2.5 + 1, d: Math.random() * 20 + 12, dl: Math.random() * 8,
}));

const FEATURES = [
  { icon: "📊", title: "AI Chart Annotations", desc: "Upload any forex chart — get support, resistance, trendlines, and zones drawn directly on your chart." },
  { icon: "🎯", title: "Trade Setups", desc: "Get entry zones, take profit, stop loss, and risk:reward ratios calculated from your chart's price action." },
  { icon: "⚡", title: "Instant Analysis", desc: "Results in under 10 seconds. No manual charting, no guesswork — AI reads your chart like a pro trader." },
  { icon: "📈", title: "Market Structure", desc: "Detect trend direction, higher highs/lows, breakout patterns, and confluence zones automatically." },
  { icon: "🔍", title: "Multi-Platform", desc: "Works with MT4, MT5, TradingView, cTrader — any chart screenshot, any pair, any timeframe." },
  { icon: "🔒", title: "Fullscreen View", desc: "Click to expand your annotated chart in fullscreen with all levels, zones, and a professional legend overlay." },
];

const PLANS = [
  { name: "Starter", price: "R49", period: "/month", scans: "15/month", features: ["15 scans per month", "Full annotations", "Trade setups (Entry/TP/SL)", "S/R levels & zones", "Scan history"], cta: "Get Starter" },
  { name: "Pro", price: "R99", period: "/month", scans: "50/month", features: ["50 scans per month", "Full annotations", "Trade setups (Entry/TP/SL)", "AI Fundamentals & News", "Confluence grading", "Full scan history"], cta: "Get Pro", popular: true },
  { name: "Premium", price: "R199", period: "/month", scans: "Unlimited", features: ["Unlimited scans", "All Pro features", "AI Fundamentals & News", "Priority processing", "Priority support"], cta: "Go Premium" },
];

const STEPS = [
  { n: "01", title: "Upload", desc: "Drop any forex chart screenshot — PNG or JPG from any platform." },
  { n: "02", title: "Analyze", desc: "AI reads your chart visually — detecting patterns, levels, and structure." },
  { n: "03", title: "Trade", desc: "Get annotated chart with key levels, zones, entry/TP/SL, and trade bias." },
];

export default function LandingPage() {
  const [visible, setVisible] = useState(false);
  const [showBrokerPopup, setShowBrokerPopup] = useState(false);

  const BROKER_LINK = "https://track.deriv.com/_oJ-a7wvPzFJB4VdSfJsOp2Nd7ZgqdRLk/1/";

  // Generate/retrieve visitor ID
  const getVisitorId = () => {
    if (typeof window === "undefined") return null;
    let vid = localStorage.getItem("fxs_vid");
    if (!vid) { vid = crypto.randomUUID(); localStorage.setItem("fxs_vid", vid); }
    return vid;
  };

  const trackEvent = (event_type: string, source?: string) => {
    fetch("/api/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type, source, visitor_id: getVisitorId() }),
    }).catch(() => {});
  };

  useEffect(() => {
    setVisible(true);
    trackEvent("landing_visit");

    // ═══ AFFILIATE REF CODE CAPTURE ═══
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      // Store ref code in localStorage (30-day effective via check on signup)
      localStorage.setItem("fxs_ref", ref);
      localStorage.setItem("fxs_ref_at", Date.now().toString());
      // Track the click
      fetch("/api/affiliate/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refCode: ref }),
      }).catch(() => {});
      trackEvent("affiliate_click", ref);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBrokerClick = (source: string) => {
    trackEvent("broker_click", source);
  };

  const handleSignupClick = (source: string) => {
    trackEvent("signup_click", source);
  };

  const dismissPopup = () => {
    setShowBrokerPopup(false);
    trackEvent("broker_popup_dismissed", "landing");
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#0a0b0f" }}>
      {/* BG */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 600, height: 600, background: "radial-gradient(circle,rgba(0,229,160,.08) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ bottom: "-15%", right: "-10%", width: 500, height: 500, background: "radial-gradient(circle,rgba(77,160,255,.06) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ top: "40%", left: "50%", width: 400, height: 400, background: "radial-gradient(circle,rgba(240,185,11,.04) 0%,transparent 70%)", filter: "blur(80px)" }} />
        {PX.map((p) => (
          <div key={p.id} className="absolute rounded-full" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, background: p.id % 3 === 0 ? "#00e5a0" : "#4da0ff", animation: `float ${p.d}s ${p.dl}s infinite ease-in-out` }} />
        ))}
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
      </div>

      <div className="relative z-[1]">
        {/* NAV */}
        <nav className="flex items-center justify-between" style={{ padding: "16px 28px", paddingTop: 48, borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 18px rgba(0,229,160,.25)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div className="text-lg font-bold text-white" style={{ letterSpacing: "-.5px" }}>FXSynapse<span className="font-extrabold" style={{ color: "#00e5a0" }}> AI</span></div>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://track.deriv.com/_oJ-a7wvPzFJB4VdSfJsOp2Nd7ZgqdRLk/1/" target="_blank" rel="noopener noreferrer" onClick={() => handleBrokerClick("landing_nav")} className="text-xs font-semibold no-underline px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: "rgba(240,185,11,.08)", border: "1px solid rgba(240,185,11,.12)", color: "#f0b90b" }}>
              📈 Trade Now
            </a>
            <Link href="/pricing" className="text-xs font-semibold no-underline px-3 py-1.5 rounded-lg" style={{ color: "rgba(255,255,255,.5)" }}>
              Pricing
            </Link>
            <Link href="/login" className="text-xs font-semibold no-underline px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "#fff" }}>
              Sign In
            </Link>
            <Link href="/login" onClick={() => handleSignupClick("nav")} className="text-xs font-bold no-underline px-4 py-2 rounded-lg" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
              Try Free
            </Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="flex flex-col items-center text-center" style={{ padding: "80px 24px 60px", transition: "all 0.8s ease", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)" }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6" style={{ background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.15)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 8px #00e5a0" }} />
            <span className="text-[11px] font-mono font-semibold" style={{ color: "#00e5a0" }}>AI-POWERED CHART ANALYSIS</span>
          </div>

          <h1 className="font-extrabold text-white leading-[1.1] mb-5" style={{ fontSize: "clamp(32px,6vw,56px)", letterSpacing: "-2px", maxWidth: 700 }}>
            Scan any chart.<br />
            <span style={{ background: "linear-gradient(90deg,#00e5a0,#4da0ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Get annotated intelligence.
            </span>
          </h1>

          <p className="text-base max-w-lg mb-8" style={{ color: "rgba(255,255,255,.5)", lineHeight: 1.7 }}>
            Upload any forex chart screenshot and get instant AI analysis — key levels, support &amp; resistance zones, trade setups, and annotations drawn right on your chart.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <Link href="/login" onClick={() => handleSignupClick("hero")} className="no-underline px-7 py-3.5 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f", boxShadow: "0 4px 25px rgba(0,229,160,.35)" }}>
              Try Free
            </Link>
            <Link href="/login" className="no-underline px-7 py-3.5 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#fff" }}>
              Sign In
            </Link>
          </div>
          <p className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>1 free scan • No card required • Plans from R49/month</p>

          {/* Platform badges */}
          <div className="flex gap-2 mt-8 flex-wrap justify-center">
            {["MetaTrader 4", "MetaTrader 5", "TradingView", "cTrader"].map((p) => (
              <span key={p} className="px-3 py-1 rounded-full text-[10px] font-mono" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.3)" }}>{p}</span>
            ))}
          </div>

          {/* Android Download */}
          <a href="/FXSynapse-AI.apk" download onClick={() => trackEvent("apk_download", "landing")} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl no-underline transition-all hover:opacity-90" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#3ddc84"><path d="M17.523 2.248a.75.75 0 0 0-1.046.224l-1.3 2.044A7.96 7.96 0 0 0 12 3.75a7.96 7.96 0 0 0-3.177.766l-1.3-2.044a.75.75 0 1 0-1.27.808l1.2 1.886A8.004 8.004 0 0 0 4 12v.75h16V12a8.004 8.004 0 0 0-3.453-6.584l1.2-1.886a.75.75 0 0 0-.224-1.046V2.248zM9.5 9.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm5 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM4 14.25h16v4A3.75 3.75 0 0 1 16.25 22h-8.5A3.75 3.75 0 0 1 4 18.25v-4z"/></svg>
            <div className="text-left">
              <div className="text-[11px] font-bold text-white">Download Android App</div>
              <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>FXSynapse-AI.apk • 6.7 MB</div>
            </div>
          </a>
        </section>
        <section className="flex justify-center" style={{ padding: "0 24px 80px" }}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden relative" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", boxShadow: "0 20px 80px rgba(0,0,0,.4)" }}>
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,77,106,.6)" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(240,185,11,.6)" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(0,229,160,.6)" }} />
              </div>
              <span className="text-[10px] font-mono ml-2" style={{ color: "rgba(255,255,255,.3)" }}>FXSynapse AI — Chart Analysis</span>
            </div>
            <div className="relative" style={{ height: 320, background: "linear-gradient(180deg,rgba(0,229,160,.03) 0%,rgba(77,160,255,.03) 100%)" }}>
              {/* Fake chart lines */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 320" preserveAspectRatio="none">
                <path d="M0 240 L100 220 L200 190 L250 210 L300 180 L400 160 L450 175 L500 140 L550 120 L600 130 L650 100 L700 110 L800 80" fill="none" stroke="rgba(0,229,160,.4)" strokeWidth="2" />
                <line x1="0" y1="100" x2="800" y2="100" stroke="rgba(255,77,106,.25)" strokeWidth="1" strokeDasharray="8 5" />
                <line x1="0" y1="200" x2="800" y2="200" stroke="rgba(0,229,160,.25)" strokeWidth="1" strokeDasharray="8 5" />
                <rect x="0" y="85" width="800" height="30" fill="rgba(255,77,106,.04)" />
                <rect x="0" y="190" width="800" height="30" fill="rgba(0,229,160,.04)" />
              </svg>
              {/* Labels */}
              <div className="absolute top-[88px] right-4 px-2 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: "rgba(255,77,106,.15)", color: "#ff4d6a" }}>R — 2,048.50</div>
              <div className="absolute top-[195px] right-4 px-2 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: "rgba(0,229,160,.15)", color: "#00e5a0" }}>S — 1,982.30</div>
              <div className="absolute top-3 left-3 px-2 py-1 rounded-lg text-[10px] font-mono font-bold" style={{ background: "rgba(0,0,0,.6)", backdropFilter: "blur(8px)", color: "#fff" }}>XAUUSD • H1</div>
              <div className="absolute top-3 right-3 flex gap-1.5">
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold" style={{ background: "rgba(0,229,160,.15)", color: "#00e5a0" }}>BULLISH</span>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold" style={{ background: "rgba(77,160,255,.15)", color: "#4da0ff" }}>87%</span>
              </div>
              {/* Point markers */}
              <div className="absolute" style={{ top: 115, left: "65%", width: 12, height: 12, borderRadius: "50%", border: "2px solid #00e5a0", background: "rgba(0,229,160,.15)" }} />
              <div className="absolute text-[9px] font-mono font-bold" style={{ top: 108, left: "68%", color: "#00e5a0" }}>Entry</div>
              <div className="absolute" style={{ top: 75, left: "75%", width: 12, height: 12, borderRadius: "50%", border: "2px solid #4da0ff", background: "rgba(77,160,255,.15)" }} />
              <div className="absolute text-[9px] font-mono font-bold" style={{ top: 68, left: "78%", color: "#4da0ff" }}>TP</div>
              <div className="absolute" style={{ top: 205, left: "58%", width: 12, height: 12, borderRadius: "50%", border: "2px solid #ff4d6a", background: "rgba(255,77,106,.15)" }} />
              <div className="absolute text-[9px] font-mono font-bold" style={{ top: 198, left: "61%", color: "#ff4d6a" }}>SL</div>
              {/* Watermark */}
              <div className="absolute bottom-3 right-3 text-[11px] font-mono font-bold" style={{ color: "rgba(0,229,160,.35)" }}>FXSynapse AI</div>
            </div>
            {/* Legend bar */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex gap-3">
                {[{ c: "#00e5a0", l: "Support / Entry" }, { c: "#ff4d6a", l: "Resistance / SL" }, { c: "#4da0ff", l: "Trend / TP" }].map((x, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm" style={{ background: x.c }} />
                    <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{x.l}</span>
                  </div>
                ))}
              </div>
              <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>ANNOTATED BY AI</span>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ padding: "60px 24px" }}>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-extrabold text-white mb-2" style={{ letterSpacing: "-1px" }}>How it works</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.4)" }}>Three steps to annotated chart intelligence</p>
          </div>
          <div className="max-w-3xl mx-auto grid md:grid-cols-3 gap-5">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl p-5 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3 text-sm font-extrabold" style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.15)", color: "#00e5a0" }}>{s.n}</div>
                <h3 className="text-base font-bold text-white mb-1.5">{s.title}</h3>
                <p className="text-xs" style={{ color: "rgba(255,255,255,.45)", lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section style={{ padding: "60px 24px" }}>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-extrabold text-white mb-2" style={{ letterSpacing: "-1px" }}>Built for traders</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.4)" }}>Everything you need to analyze charts faster</p>
          </div>
          <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="rounded-xl p-5 transition-all" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-sm font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-xs" style={{ color: "rgba(255,255,255,.4)", lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section style={{ padding: "60px 24px" }}>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-extrabold text-white mb-2" style={{ letterSpacing: "-1px" }}>Simple pricing</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.4)" }}>Professional AI chart analysis from R49/month</p>
          </div>
          <div className="max-w-3xl mx-auto grid md:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <div key={plan.name} className="rounded-xl p-5 relative" style={{
                background: plan.popular ? "rgba(0,229,160,.04)" : "rgba(255,255,255,.02)",
                border: `1px solid ${plan.popular ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
              }}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold font-mono" style={{ background: "#00e5a0", color: "#0a0b0f" }}>MOST POPULAR</div>
                )}
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1 mb-3">
                  <span className="text-2xl font-extrabold" style={{ color: plan.popular ? "#00e5a0" : "#fff" }}>{plan.price}</span>
                  <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{plan.period}</span>
                </div>
                <div className="text-xs font-mono mb-3 px-2 py-1 rounded inline-block" style={{ background: "rgba(77,160,255,.1)", color: "#4da0ff" }}>{plan.scans} scans</div>
                <ul className="flex flex-col gap-1.5 mb-4">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-[11px]" style={{ color: "rgba(255,255,255,.5)" }}>
                      <span style={{ color: "#00e5a0" }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <Link href="/pricing" className="block w-full py-2.5 rounded-lg text-xs font-bold no-underline text-center" style={{
                  background: plan.popular ? "linear-gradient(135deg,#00e5a0,#00b87d)" : "rgba(255,255,255,.06)",
                  color: plan.popular ? "#0a0b0f" : "#fff",
                }}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="text-center" style={{ padding: "40px 24px 0" }}>
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-center gap-6 flex-wrap mb-4">
              <div className="text-center">
                <div className="text-2xl font-extrabold" style={{ color: "#00e5a0" }}>40+</div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Active Traders</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-extrabold" style={{ color: "#4da0ff" }}>500+</div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Charts Analyzed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-extrabold" style={{ color: "#f0b90b" }}>&lt;10s</div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Avg Analysis Time</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center" style={{ padding: "60px 24px 40px" }}>
          <div className="max-w-lg mx-auto rounded-2xl px-6 py-8" style={{ background: "linear-gradient(135deg, rgba(0,229,160,.06), rgba(77,160,255,.04))", border: "1px solid rgba(0,229,160,.12)" }}>
            <div className="text-[10px] font-mono font-bold mb-2" style={{ color: "#00e5a0" }}>🎯 TRY BEFORE YOU BUY</div>
            <h2 className="text-2xl font-extrabold text-white mb-3" style={{ letterSpacing: "-1px" }}>See what AI sees in your chart</h2>
            <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,.4)" }}>Upload any chart, get instant annotated analysis. 1 free scan — no card needed.</p>
            <Link href="/login" onClick={() => handleSignupClick("cta")} className="inline-block no-underline px-8 py-4 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f", boxShadow: "0 4px 25px rgba(0,229,160,.35)" }}>
              Get Your Free Scan →
            </Link>
            <p className="text-[10px] font-mono mt-3" style={{ color: "rgba(255,255,255,.25)" }}>No credit card required • Plans from R49/mo after</p>
          </div>
        </section>

        {/* Recommended Broker */}
        <section style={{ padding: "0 24px 60px" }}>
          <a href="https://track.deriv.com/_oJ-a7wvPzFJB4VdSfJsOp2Nd7ZgqdRLk/1/" target="_blank" rel="noopener noreferrer" onClick={() => handleBrokerClick("landing_banner")} className="block no-underline max-w-2xl mx-auto">
            <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(240,185,11,.05), rgba(0,229,160,.03))", border: "1px solid rgba(240,185,11,.1)" }}>
              <div className="flex items-center justify-between px-5 py-4 gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, rgba(240,185,11,.15), rgba(240,185,11,.08))", border: "1px solid rgba(240,185,11,.2)" }}>
                    <span className="text-lg">📊</span>
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-white">Recommended Broker</div>
                    <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>Trade Forex, Synthetics & Crypto • Regulated • Fast Execution</div>
                  </div>
                </div>
                <div className="px-4 py-2 rounded-lg text-[11px] font-bold" style={{ background: "linear-gradient(135deg, #f0b90b, #e6a800)", color: "#0a0b0f" }}>
                  Open Account →
                </div>
              </div>
            </div>
          </a>
        </section>

        {/* FOOTER */}
        <footer className="text-center" style={{ padding: "24px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <span className="text-xs font-bold text-white">FXSynapse AI</span>
          </div>
          <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>
            Chart analysis for educational purposes only. Not financial advice. Always manage your risk.
          </p>
        </footer>
      </div>

      {/* ─── BIG BROKER POPUP ─── */}
      {showBrokerPopup && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(16px)", animation: "fadeUp 0.5s ease" }}
          onClick={dismissPopup}
        >
          <div
            className="relative w-full max-w-[480px] mx-4 rounded-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#12131a",
              border: "1px solid rgba(240,185,11,.15)",
              boxShadow: "0 25px 80px rgba(0,0,0,.6), 0 0 60px rgba(240,185,11,.08)",
              animation: "scaleIn 0.5s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            {/* Close button */}
            <button
              onClick={dismissPopup}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer z-10"
              style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "rgba(255,255,255,.5)", fontSize: 14 }}
            >
              ✕
            </button>

            {/* Gold gradient header */}
            <div className="relative px-7 pt-8 pb-6 text-center" style={{ background: "linear-gradient(180deg, rgba(240,185,11,.1) 0%, transparent 100%)" }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full" style={{ background: "radial-gradient(circle, rgba(240,185,11,.12) 0%, transparent 70%)", filter: "blur(40px)" }} />
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0b90b, #e6a800)", boxShadow: "0 8px 30px rgba(240,185,11,.35)" }}>
                  <span className="text-3xl">📈</span>
                </div>
                <h2 className="text-[22px] font-extrabold text-white mb-1.5" style={{ letterSpacing: "-.5px" }}>
                  Start Trading Today
                </h2>
                <p className="text-[13px]" style={{ color: "rgba(255,255,255,.45)" }}>
                  Our recommended broker for FXSynapse traders
                </p>
              </div>
            </div>

            {/* Benefits */}
            <div className="px-7 pb-2">
              <div className="flex flex-col gap-3">
                {[
                  { icon: "⚡", title: "Instant Execution", desc: "Lightning-fast order fills with minimal slippage" },
                  { icon: "📊", title: "All Markets", desc: "Forex, Synthetics, Crypto & Commodities" },
                  { icon: "💰", title: "Low Spreads", desc: "Competitive spreads from 0.0 pips" },
                  { icon: "🔒", title: "Regulated & Secure", desc: "Licensed broker with segregated client funds" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(240,185,11,.08)", border: "1px solid rgba(240,185,11,.1)" }}>
                      <span className="text-base">{item.icon}</span>
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-white">{item.title}</div>
                      <div className="text-[11px]" style={{ color: "rgba(255,255,255,.35)" }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="px-7 pt-5 pb-6">
              <a
                href={BROKER_LINK}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { handleBrokerClick("popup"); dismissPopup(); }}
                className="block w-full py-4 rounded-xl text-[15px] font-bold no-underline text-center"
                style={{
                  background: "linear-gradient(135deg, #f0b90b, #e6a800)",
                  color: "#0a0b0f",
                  boxShadow: "0 6px 25px rgba(240,185,11,.3)",
                  letterSpacing: "-.3px",
                }}
              >
                Open Free Account →
              </a>
              <div className="flex items-center justify-center gap-4 mt-3">
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>Free to register</span>
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.1)" }}>•</span>
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>No minimum deposit</span>
              </div>
              <button
                onClick={dismissPopup}
                className="w-full py-2.5 mt-2 text-[12px] cursor-pointer"
                style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)" }}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  );
}
