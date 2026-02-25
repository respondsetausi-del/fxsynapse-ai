"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import ChatWidget from "@/components/ChatWidget";

const FEATURES = [
  { icon: "📊", title: "AI Chart Annotations", desc: "Upload any chart — get support, resistance, trendlines, and zones drawn directly on your chart." },
  { icon: "🎯", title: "Trade Setups", desc: "Get entry zones, take profit, stop loss, and risk:reward ratios calculated from price action." },
  { icon: "⚡", title: "Instant Analysis", desc: "Results in under 10 seconds. No guesswork — AI reads your chart like a pro." },
  { icon: "📈", title: "Market Structure", desc: "Detect trend direction, higher highs/lows, breakout patterns, and confluence zones." },
  { icon: "🔍", title: "Multi-Platform", desc: "Works with MT4, MT5, TradingView, cTrader — any chart, any pair, any timeframe." },
  { icon: "🔒", title: "Fullscreen View", desc: "Expand annotated charts in fullscreen with all levels, zones, and a professional overlay." },
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

const G = ({ children, className = "", style = {}, glow = "" }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; glow?: string }) => (
  <div className={className} style={{ background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)", backdropFilter: "blur(40px) saturate(1.5)", WebkitBackdropFilter: "blur(40px) saturate(1.5)", borderRadius: 24, boxShadow: `0 8px 32px rgba(0,0,0,.25)${glow ? `, 0 0 60px ${glow}` : ""}`, ...style }}>{children}</div>
);

export default function LandingPage() {
  const [visible, setVisible] = useState(false);
  const [showBrokerPopup, setShowBrokerPopup] = useState(false);
  const BL = "https://track.deriv.com/_oJ-a7wvPzFJB4VdSfJsOp2Nd7ZgqdRLk/1/";

  const getVisitorId = () => { if (typeof window === "undefined") return null; let v = localStorage.getItem("fxs_vid"); if (!v) { v = crypto.randomUUID(); localStorage.setItem("fxs_vid", v); } return v; };
  const trackEvent = (t: string, s?: string) => { fetch("/api/tracking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_type: t, source: s, visitor_id: getVisitorId() }) }).catch(() => {}); };

  useEffect(() => {
    setVisible(true); trackEvent("landing_visit");
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) { localStorage.setItem("fxs_ref", ref); localStorage.setItem("fxs_ref_at", Date.now().toString()); fetch("/api/affiliate/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refCode: ref }) }).catch(() => {}); trackEvent("affiliate_click", ref); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bc = (s: string) => trackEvent("broker_click", s);
  const sc = (s: string) => trackEvent("signup_click", s);
  const dp = () => { setShowBrokerPopup(false); trackEvent("broker_popup_dismissed"); };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#050507" }}>
      {/* ═══ AMBIENT ═══ */}
      <div className="fixed inset-0 z-0">
        <div className="absolute" style={{ top: "-15%", left: "-8%", width: 700, height: 700, background: "radial-gradient(circle,rgba(0,229,160,.07) 0%,transparent 65%)", filter: "blur(100px)", animation: "orbF 20s ease-in-out infinite" }} />
        <div className="absolute" style={{ bottom: "-10%", right: "-8%", width: 600, height: 600, background: "radial-gradient(circle,rgba(77,160,255,.06) 0%,transparent 65%)", filter: "blur(100px)", animation: "orbF 25s ease-in-out infinite reverse" }} />
        <div className="absolute" style={{ top: "35%", left: "45%", width: 500, height: 500, background: "radial-gradient(circle,rgba(168,85,247,.04) 0%,transparent 60%)", filter: "blur(100px)", animation: "orbF 22s 5s ease-in-out infinite" }} />
        <div className="absolute inset-0" style={{ opacity: 0.015, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      <div className="relative z-[1]">
        {/* ═══ NAV ═══ */}
        <nav className="flex items-center justify-between mx-auto" style={{ maxWidth: 1100, margin: "16px auto 0", padding: "12px 20px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", backdropFilter: "blur(40px) saturate(1.4)", WebkitBackdropFilter: "blur(40px) saturate(1.4)", borderRadius: 20, boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 18px rgba(0,229,160,.3)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div className="text-[17px] font-bold text-white" style={{ letterSpacing: "-.5px" }}>FXSynapse<span className="font-extrabold" style={{ color: "#00e5a0" }}> AI</span></div>
          </div>
          <div className="flex items-center gap-2">
            <a href={BL} target="_blank" rel="noopener noreferrer" onClick={() => bc("nav")} className="hidden sm:flex text-[11px] font-semibold no-underline px-3 py-1.5 rounded-xl items-center gap-1.5" style={{ background: "rgba(240,185,11,.08)", border: "1px solid rgba(240,185,11,.1)", color: "#f0b90b" }}>📈 Trade</a>
            <Link href="/pricing" className="hidden sm:block text-[11px] font-semibold no-underline px-3 py-1.5 rounded-xl" style={{ color: "rgba(255,255,255,.45)" }}>Pricing</Link>
            <Link href="/login" className="text-[11px] font-semibold no-underline px-4 py-2 rounded-xl" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", color: "#fff" }}>Sign In</Link>
            <Link href="/login" onClick={() => sc("nav")} className="text-[11px] font-bold no-underline px-4 py-2 rounded-xl" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", boxShadow: "0 2px 12px rgba(0,229,160,.25)" }}>Try Free</Link>
          </div>
        </nav>

        {/* ═══ HERO ═══ */}
        <section className="flex flex-col items-center text-center" style={{ padding: "80px 24px 48px", transition: "all 1s cubic-bezier(.16,1,.3,1)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(40px)" }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-7" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.1)", backdropFilter: "blur(20px)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 10px #00e5a0" }} />
            <span className="text-[11px] font-mono font-semibold tracking-wider" style={{ color: "#00e5a0" }}>AI-POWERED CHART ANALYSIS</span>
          </div>
          <h1 className="font-extrabold text-white leading-[1.05] mb-6" style={{ fontSize: "clamp(34px,6.5vw,60px)", letterSpacing: "-2.5px", maxWidth: 720 }}>
            Scan any chart.<br /><span style={{ background: "linear-gradient(135deg,#00e5a0 0%,#4da0ff 50%,#a855f7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Get annotated intelligence.</span>
          </h1>
          <p className="text-[15px] max-w-lg mb-9" style={{ color: "rgba(255,255,255,.45)", lineHeight: 1.75 }}>Upload any forex chart screenshot and get instant AI analysis — key levels, support &amp; resistance zones, trade setups, and annotations drawn right on your chart.</p>
          <div className="flex items-center gap-3 mb-4">
            <Link href="/login" onClick={() => sc("hero")} className="no-underline px-8 py-4 rounded-2xl text-sm font-bold" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", boxShadow: "0 6px 30px rgba(0,229,160,.3), inset 0 1px 0 rgba(255,255,255,.2)" }}>Try Free</Link>
            <Link href="/login" className="no-underline px-8 py-4 rounded-2xl text-sm font-semibold" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", color: "#fff", backdropFilter: "blur(20px)" }}>Sign In</Link>
          </div>
          <p className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>1 free scan • No card required • Plans from R49/month</p>
          <div className="flex gap-2 mt-8 flex-wrap justify-center">
            {["MetaTrader 4", "MetaTrader 5", "TradingView", "cTrader"].map((p) => (
              <span key={p} className="px-3 py-1.5 rounded-2xl text-[10px] font-mono" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)", color: "rgba(255,255,255,.3)", backdropFilter: "blur(10px)" }}>{p}</span>
            ))}
          </div>
          <a href="/FXSynapse-AI.apk" download onClick={() => trackEvent("apk_download")} className="mt-6 inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl no-underline transition-all hover:scale-[1.02]" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", backdropFilter: "blur(20px)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#3ddc84"><path d="M17.523 2.248a.75.75 0 0 0-1.046.224l-1.3 2.044A7.96 7.96 0 0 0 12 3.75a7.96 7.96 0 0 0-3.177.766l-1.3-2.044a.75.75 0 1 0-1.27.808l1.2 1.886A8.004 8.004 0 0 0 4 12v.75h16V12a8.004 8.004 0 0 0-3.453-6.584l1.2-1.886a.75.75 0 0 0-.224-1.046V2.248zM9.5 9.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm5 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM4 14.25h16v4A3.75 3.75 0 0 1 16.25 22h-8.5A3.75 3.75 0 0 1 4 18.25v-4z"/></svg>
            <div className="text-left"><div className="text-[11px] font-bold text-white">Download Android App</div><div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>FXSynapse-AI.apk • 6.7 MB</div></div>
          </a>
        </section>

        {/* ═══ CHART PREVIEW ═══ */}
        <section className="flex justify-center" style={{ padding: "0 24px 80px" }}>
          <G className="w-full max-w-3xl overflow-hidden" glow="rgba(0,229,160,.04)">
            <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,77,106,.6)" }} /><div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(240,185,11,.6)" }} /><div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(0,229,160,.6)" }} /></div>
              <span className="text-[10px] font-mono ml-2" style={{ color: "rgba(255,255,255,.25)" }}>FXSynapse AI — Chart Analysis</span>
            </div>
            <div className="relative" style={{ height: 320, background: "linear-gradient(180deg,rgba(0,229,160,.02) 0%,rgba(77,160,255,.02) 100%)" }}>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 320" preserveAspectRatio="none">
                <path d="M0 240 L100 220 L200 190 L250 210 L300 180 L400 160 L450 175 L500 140 L550 120 L600 130 L650 100 L700 110 L800 80" fill="none" stroke="rgba(0,229,160,.35)" strokeWidth="2" />
                <line x1="0" y1="100" x2="800" y2="100" stroke="rgba(255,77,106,.2)" strokeWidth="1" strokeDasharray="8 5" />
                <line x1="0" y1="200" x2="800" y2="200" stroke="rgba(0,229,160,.2)" strokeWidth="1" strokeDasharray="8 5" />
                <rect x="0" y="85" width="800" height="30" fill="rgba(255,77,106,.03)" /><rect x="0" y="190" width="800" height="30" fill="rgba(0,229,160,.03)" />
              </svg>
              <div className="absolute top-[88px] right-4 px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold" style={{ background: "rgba(255,77,106,.12)", color: "#ff4d6a", backdropFilter: "blur(10px)" }}>R — 2,048.50</div>
              <div className="absolute top-[195px] right-4 px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold" style={{ background: "rgba(0,229,160,.12)", color: "#00e5a0", backdropFilter: "blur(10px)" }}>S — 1,982.30</div>
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold" style={{ background: "rgba(0,0,0,.5)", backdropFilter: "blur(16px)", color: "#fff", border: "1px solid rgba(255,255,255,.06)" }}>XAUUSD • H1</div>
              <div className="absolute top-3 right-3 flex gap-1.5">
                <span className="px-2.5 py-1 rounded-xl text-[9px] font-mono font-bold" style={{ background: "rgba(0,229,160,.12)", color: "#00e5a0" }}>BULLISH</span>
                <span className="px-2.5 py-1 rounded-xl text-[9px] font-mono font-bold" style={{ background: "rgba(77,160,255,.12)", color: "#4da0ff" }}>87%</span>
              </div>
              <div className="absolute" style={{ top: 115, left: "65%", width: 12, height: 12, borderRadius: "50%", border: "2px solid #00e5a0", background: "rgba(0,229,160,.15)", boxShadow: "0 0 12px rgba(0,229,160,.3)" }} />
              <div className="absolute text-[9px] font-mono font-bold" style={{ top: 108, left: "68%", color: "#00e5a0" }}>Entry</div>
              <div className="absolute" style={{ top: 75, left: "75%", width: 12, height: 12, borderRadius: "50%", border: "2px solid #4da0ff", background: "rgba(77,160,255,.15)", boxShadow: "0 0 12px rgba(77,160,255,.3)" }} />
              <div className="absolute text-[9px] font-mono font-bold" style={{ top: 68, left: "78%", color: "#4da0ff" }}>TP</div>
              <div className="absolute" style={{ top: 205, left: "58%", width: 12, height: 12, borderRadius: "50%", border: "2px solid #ff4d6a", background: "rgba(255,77,106,.15)", boxShadow: "0 0 12px rgba(255,77,106,.3)" }} />
              <div className="absolute text-[9px] font-mono font-bold" style={{ top: 198, left: "61%", color: "#ff4d6a" }}>SL</div>
              <div className="absolute bottom-3 right-3 text-[11px] font-mono font-bold" style={{ color: "rgba(0,229,160,.3)" }}>FXSynapse AI</div>
            </div>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex gap-4">
                {[{ c: "#00e5a0", l: "Support / Entry" }, { c: "#ff4d6a", l: "Resistance / SL" }, { c: "#4da0ff", l: "Trend / TP" }].map((x, i) => (
                  <div key={i} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: x.c, boxShadow: `0 0 6px ${x.c}40` }} /><span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{x.l}</span></div>
                ))}
              </div>
              <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>ANNOTATED BY AI</span>
            </div>
          </G>
        </section>

        {/* ═══ HOW IT WORKS ═══ */}
        <section style={{ padding: "60px 24px" }}>
          <div className="text-center mb-12"><h2 className="text-[28px] font-extrabold text-white mb-2" style={{ letterSpacing: "-1.5px" }}>How it works</h2><p className="text-sm" style={{ color: "rgba(255,255,255,.35)" }}>Three steps to chart intelligence</p></div>
          <div className="max-w-3xl mx-auto grid md:grid-cols-3 gap-5">
            {STEPS.map((s) => (
              <G key={s.n} className="p-6 text-center transition-all duration-300 hover:scale-[1.03] hover:border-[rgba(255,255,255,.12)]" style={{ cursor: "default" }}>
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-4 text-sm font-extrabold" style={{ background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.12)", color: "#00e5a0" }}>{s.n}</div>
                <h3 className="text-[15px] font-bold text-white mb-2">{s.title}</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,.4)" }}>{s.desc}</p>
              </G>
            ))}
          </div>
        </section>

        {/* ═══ FEATURES ═══ */}
        <section style={{ padding: "40px 24px 60px" }}>
          <div className="text-center mb-12"><h2 className="text-[28px] font-extrabold text-white mb-2" style={{ letterSpacing: "-1.5px" }}>Powerful features</h2><p className="text-sm" style={{ color: "rgba(255,255,255,.35)" }}>Everything you need for chart analysis</p></div>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <G key={i} className="p-5 transition-all duration-300 hover:scale-[1.03]" style={{ cursor: "default" }}>
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-[14px] font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,.38)" }}>{f.desc}</p>
              </G>
            ))}
          </div>
        </section>

        {/* ═══ PRICING ═══ */}
        <section style={{ padding: "60px 24px" }}>
          <div className="text-center mb-12"><h2 className="text-[28px] font-extrabold text-white mb-2" style={{ letterSpacing: "-1.5px" }}>Simple pricing</h2><p className="text-sm" style={{ color: "rgba(255,255,255,.35)" }}>Start free, upgrade when ready</p></div>
          <div className="max-w-3xl mx-auto grid md:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <G key={plan.name} className="p-6 relative transition-all duration-300 hover:scale-[1.03]" glow={plan.popular ? "rgba(0,229,160,.06)" : ""} style={{ cursor: "default", background: plan.popular ? "rgba(255,255,255,.055)" : undefined, borderColor: plan.popular ? "rgba(0,229,160,.15)" : undefined }}>
                {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold font-mono" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", boxShadow: "0 4px 12px rgba(0,229,160,.3)" }}>MOST POPULAR</div>}
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1 mb-3"><span className="text-[26px] font-extrabold" style={{ color: plan.popular ? "#00e5a0" : "#fff" }}>{plan.price}</span><span className="text-xs font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{plan.period}</span></div>
                <div className="text-xs font-mono mb-4 px-2.5 py-1 rounded-xl inline-block" style={{ background: "rgba(77,160,255,.08)", color: "#4da0ff", border: "1px solid rgba(77,160,255,.1)" }}>{plan.scans} scans</div>
                <div className="flex flex-col gap-2 mb-5">
                  {plan.features.map((f, j) => <div key={j} className="flex items-start gap-2 text-[11px]" style={{ color: "rgba(255,255,255,.45)" }}><span style={{ color: "#00e5a0" }}>✓</span>{f}</div>)}
                </div>
                <Link href="/pricing" className="block w-full py-3 rounded-2xl text-xs font-bold no-underline text-center" style={{ background: plan.popular ? "linear-gradient(135deg,#00e5a0,#00b87d)" : "rgba(255,255,255,.06)", color: plan.popular ? "#050507" : "#fff", border: plan.popular ? "none" : "1px solid rgba(255,255,255,.08)", boxShadow: plan.popular ? "0 4px 18px rgba(0,229,160,.25)" : "none" }}>{plan.cta}</Link>
              </G>
            ))}
          </div>
        </section>

        {/* ═══ SOCIAL PROOF ═══ */}
        <section className="text-center" style={{ padding: "40px 24px 0" }}>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            {[{ v: "40+", l: "Active Traders", c: "#00e5a0" }, { v: "500+", l: "Charts Analyzed", c: "#4da0ff" }, { v: "<10s", l: "Avg Analysis", c: "#f0b90b" }].map((s, i) => (
              <div key={i} className="text-center"><div className="text-[28px] font-extrabold" style={{ color: s.c, textShadow: `0 0 30px ${s.c}30` }}>{s.v}</div><div className="text-[10px] font-mono mt-1" style={{ color: "rgba(255,255,255,.25)" }}>{s.l}</div></div>
            ))}
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="text-center" style={{ padding: "60px 24px 40px" }}>
          <G className="max-w-lg mx-auto px-7 py-9 text-center" glow="rgba(0,229,160,.04)">
            <div className="text-[10px] font-mono font-bold mb-3 tracking-wider" style={{ color: "#00e5a0" }}>🎯 TRY BEFORE YOU BUY</div>
            <h2 className="text-[24px] font-extrabold text-white mb-3" style={{ letterSpacing: "-1px" }}>See what AI sees in your chart</h2>
            <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,.35)" }}>Upload any chart, get instant analysis. 1 free scan — no card needed.</p>
            <Link href="/login" onClick={() => sc("cta")} className="inline-block no-underline px-9 py-4 rounded-2xl text-sm font-bold" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", boxShadow: "0 6px 30px rgba(0,229,160,.3), inset 0 1px 0 rgba(255,255,255,.2)" }}>Get Your Free Scan →</Link>
            <p className="text-[10px] font-mono mt-4" style={{ color: "rgba(255,255,255,.2)" }}>No credit card required • Plans from R49/mo</p>
          </G>
        </section>

        {/* ═══ BROKER ═══ */}
        <section style={{ padding: "0 24px 60px" }}>
          <a href={BL} target="_blank" rel="noopener noreferrer" onClick={() => bc("banner")} className="block no-underline max-w-2xl mx-auto">
            <G className="overflow-hidden" glow="rgba(240,185,11,.03)">
              <div className="flex items-center justify-between px-5 py-4 gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(240,185,11,.1)", border: "1px solid rgba(240,185,11,.15)" }}><span className="text-lg">📊</span></div>
                  <div><div className="text-[13px] font-semibold text-white">Recommended Broker</div><div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Forex, Synthetics & Crypto • Regulated</div></div>
                </div>
                <div className="px-4 py-2.5 rounded-2xl text-[11px] font-bold" style={{ background: "linear-gradient(135deg,#f0b90b,#e6a800)", color: "#050507", boxShadow: "0 4px 12px rgba(240,185,11,.25)" }}>Open Account →</div>
              </div>
            </G>
          </a>
        </section>

        {/* ═══ AFFILIATE ═══ */}
        <section style={{ padding: "0 24px 60px" }}>
          <G className="max-w-2xl mx-auto overflow-hidden" glow="rgba(168,85,247,.03)">
            <div className="flex items-center justify-between px-5 py-5 gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(168,85,247,.1)", border: "1px solid rgba(168,85,247,.15)" }}><span className="text-lg">💰</span></div>
                <div><div className="text-[13px] font-semibold text-white">Earn 20% Recurring Commission</div><div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Refer traders • Earn every month</div></div>
              </div>
              <Link href="/affiliate" className="px-4 py-2.5 rounded-2xl text-[11px] font-bold no-underline" style={{ background: "linear-gradient(135deg,#a855f7,#7c3aed)", color: "#fff", boxShadow: "0 4px 12px rgba(168,85,247,.25)" }}>Become an Affiliate →</Link>
            </div>
          </G>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer className="text-center" style={{ padding: "24px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg></div>
            <span className="text-xs font-bold text-white">FXSynapse AI</span>
          </div>
          <div className="flex items-center justify-center gap-4 mb-2">
            <Link href="/pricing" className="text-[10px] font-mono no-underline" style={{ color: "rgba(255,255,255,.25)" }}>Pricing</Link>
            <Link href="/affiliate" className="text-[10px] font-mono no-underline" style={{ color: "rgba(255,255,255,.25)" }}>Affiliate</Link>
            <Link href="/login" className="text-[10px] font-mono no-underline" style={{ color: "rgba(255,255,255,.25)" }}>Sign In</Link>
          </div>
          <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>Chart analysis for educational purposes only. Not financial advice.</p>
        </footer>
      </div>

      {/* ═══ BROKER POPUP ═══ */}
      {showBrokerPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,.7)", backdropFilter: "blur(24px)" }} onClick={dp}>
          <div className="relative w-full max-w-[460px] mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,21,30,.85)", border: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(60px) saturate(1.6)", borderRadius: 28, boxShadow: "0 25px 80px rgba(0,0,0,.5), 0 0 60px rgba(240,185,11,.06)", animation: "gSU .5s cubic-bezier(.16,1,.3,1)" }}>
            <button onClick={dp} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer z-10" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.4)", fontSize: 14 }}>✕</button>
            <div className="relative px-7 pt-8 pb-6 text-center" style={{ background: "linear-gradient(180deg,rgba(240,185,11,.08) 0%,transparent 100%)" }}>
              <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#f0b90b,#e6a800)", boxShadow: "0 8px 30px rgba(240,185,11,.3)" }}><span className="text-3xl">📈</span></div>
              <h2 className="text-[22px] font-extrabold text-white mb-1.5" style={{ letterSpacing: "-.5px" }}>Start Trading Today</h2>
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,.4)" }}>Our recommended broker for FXSynapse traders</p>
            </div>
            <div className="px-7 pb-2 flex flex-col gap-3">
              {[{ i: "⚡", t: "Instant Execution", d: "Lightning-fast order fills" }, { i: "📊", t: "All Markets", d: "Forex, Synthetics, Crypto & Commodities" }, { i: "💰", t: "Low Spreads", d: "From 0.0 pips" }, { i: "🔒", t: "Regulated & Secure", d: "Licensed broker" }].map((x, i) => (
                <div key={i} className="flex items-start gap-3"><div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(240,185,11,.08)", border: "1px solid rgba(240,185,11,.1)" }}><span className="text-base">{x.i}</span></div><div><div className="text-[13px] font-semibold text-white">{x.t}</div><div className="text-[11px]" style={{ color: "rgba(255,255,255,.3)" }}>{x.d}</div></div></div>
              ))}
            </div>
            <div className="px-7 pt-5 pb-6">
              <a href={BL} target="_blank" rel="noopener noreferrer" onClick={() => { bc("popup"); dp(); }} className="block w-full py-4 rounded-2xl text-[15px] font-bold no-underline text-center" style={{ background: "linear-gradient(135deg,#f0b90b,#e6a800)", color: "#050507", boxShadow: "0 6px 25px rgba(240,185,11,.3)" }}>Open Free Account →</a>
              <div className="flex items-center justify-center gap-4 mt-3"><span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>Free to register</span><span className="text-[10px]" style={{ color: "rgba(255,255,255,.08)" }}>•</span><span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>No minimum deposit</span></div>
              <button onClick={dp} className="w-full py-2.5 mt-2 text-[12px] cursor-pointer" style={{ background: "none", border: "none", color: "rgba(255,255,255,.25)" }}>Maybe later</button>
            </div>
          </div>
        </div>
      )}

      <ChatWidget />
      <style jsx global>{`
        @keyframes orbF { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-20px) scale(1.05)} 66%{transform:translate(-20px,15px) scale(.95)} }
        @keyframes gSU { from{opacity:0;transform:translateY(40px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes float { 0%,100%{transform:translateY(0);opacity:.5} 50%{transform:translateY(-20px);opacity:1} }
      `}</style>
    </div>
  );
}
