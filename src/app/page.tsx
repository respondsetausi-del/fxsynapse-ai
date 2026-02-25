"use client";
import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import ChatWidget from "@/components/ChatWidget";

// ═══ Scroll-triggered visibility hook ═══
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, vis };
}

// ═══ Animated counter ═══
function Counter({ end, suffix = "", duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const { ref, vis } = useReveal(0.3);
  useEffect(() => {
    if (!vis) return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(Math.round(ease * end));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [vis, end, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

const FEATURES = [
  { icon: "📊", title: "AI Chart Annotations", desc: "Upload any chart — get support, resistance, trendlines, and zones drawn directly on your chart.", color: "#00e5a0" },
  { icon: "🎯", title: "Trade Setups", desc: "Entry zones, take profit, stop loss, and risk:reward ratios from price action.", color: "#4da0ff" },
  { icon: "⚡", title: "Instant Analysis", desc: "Results in under 10 seconds. No guesswork — AI reads your chart like a pro.", color: "#f0b90b" },
  { icon: "📈", title: "Market Structure", desc: "Trend direction, higher highs/lows, breakout patterns, and confluence zones.", color: "#00e5a0" },
  { icon: "🔍", title: "Multi-Platform", desc: "MT4, MT5, TradingView, cTrader — any chart, any pair, any timeframe.", color: "#4da0ff" },
  { icon: "🧠", title: "AI Fundamentals", desc: "Get news impact analysis and macro context alongside your technical scan.", color: "#a855f7" },
];

const PLANS = [
  { name: "Starter", price: "R49", period: "/mo", scans: "15", features: ["15 scans/month", "Full annotations", "Trade setups", "S/R levels & zones", "Scan history"], cta: "Get Starter" },
  { name: "Pro", price: "R99", period: "/mo", scans: "50", features: ["50 scans/month", "Full annotations", "Trade setups", "AI News & Fundamentals", "Confluence grading", "Full history"], cta: "Get Pro", popular: true },
  { name: "Premium", price: "R199", period: "/mo", scans: "∞", features: ["Unlimited scans", "All Pro features", "AI Fundamentals", "Priority processing", "Priority support"], cta: "Go Premium" },
];

// ═══ Glass component ═══
const G = ({ children, className = "", style = {}, glow = "" }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; glow?: string }) => (
  <div className={className} style={{ background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)", backdropFilter: "blur(40px) saturate(1.5)", WebkitBackdropFilter: "blur(40px) saturate(1.5)", borderRadius: 24, boxShadow: `0 8px 32px rgba(0,0,0,.25)${glow ? `, 0 0 60px ${glow}` : ""}`, ...style }}>{children}</div>
);

export default function LandingPage() {
  const [visible, setVisible] = useState(false);
  const [showBrokerPopup, setShowBrokerPopup] = useState(false);
  const [chartDrawn, setChartDrawn] = useState(false);
  const [heroWord, setHeroWord] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const BL = "https://track.deriv.com/_oJ-a7wvPzFJB4VdSfJsOp2Nd7ZgqdRLk/1/";

  const heroWords = ["intelligence.", "precision.", "confidence.", "edge."];

  // Scroll hooks for each section
  const sec1 = useReveal(); const sec2 = useReveal(); const sec3 = useReveal();
  const sec4 = useReveal(); const sec5 = useReveal(); const sec6 = useReveal();

  const getVisitorId = () => { if (typeof window === "undefined") return null; let v = localStorage.getItem("fxs_vid"); if (!v) { v = crypto.randomUUID(); localStorage.setItem("fxs_vid", v); } return v; };
  const trackEvent = useCallback((t: string, s?: string) => { fetch("/api/tracking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_type: t, source: s, visitor_id: getVisitorId() }) }).catch(() => {}); }, []);

  useEffect(() => {
    setVisible(true); trackEvent("landing_visit");
    setTimeout(() => setChartDrawn(true), 800);
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) { localStorage.setItem("fxs_ref", ref); localStorage.setItem("fxs_ref_at", Date.now().toString()); fetch("/api/affiliate/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refCode: ref }) }).catch(() => {}); trackEvent("affiliate_click", ref); }
  }, [trackEvent]);

  // Rotating hero words
  useEffect(() => { const i = setInterval(() => setHeroWord(p => (p + 1) % heroWords.length), 3000); return () => clearInterval(i); }, [heroWords.length]);

  const bc = (s: string) => trackEvent("broker_click", s);
  const sc = (s: string) => trackEvent("signup_click", s);
  const dp = () => { setShowBrokerPopup(false); trackEvent("broker_popup_dismissed"); };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#050507" }}>
      {/* ═══ AMBIENT — Layered depth ═══ */}
      <div className="fixed inset-0 z-0">
        <div className="absolute" style={{ top: "-15%", left: "-8%", width: 700, height: 700, background: "radial-gradient(circle,rgba(0,229,160,.08) 0%,transparent 60%)", filter: "blur(100px)", animation: "orbF 18s ease-in-out infinite" }} />
        <div className="absolute" style={{ bottom: "-12%", right: "-10%", width: 650, height: 650, background: "radial-gradient(circle,rgba(77,160,255,.07) 0%,transparent 60%)", filter: "blur(100px)", animation: "orbF 24s ease-in-out infinite reverse" }} />
        <div className="absolute" style={{ top: "30%", left: "50%", width: 500, height: 500, background: "radial-gradient(circle,rgba(168,85,247,.05) 0%,transparent 55%)", filter: "blur(100px)", animation: "orbF 20s 3s ease-in-out infinite" }} />
        <div className="absolute" style={{ top: "60%", right: "20%", width: 300, height: 300, background: "radial-gradient(circle,rgba(240,185,11,.04) 0%,transparent 60%)", filter: "blur(80px)", animation: "orbF 15s 8s ease-in-out infinite" }} />
        {/* Noise */}
        <div className="absolute inset-0" style={{ opacity: 0.018, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      <div className="relative z-[1]">
        {/* ═══ NAV — Floating Glass ═══ */}
        <nav className="flex items-center justify-between mx-auto" style={{ maxWidth: 1100, margin: "16px auto 0", padding: "12px 20px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", backdropFilter: "blur(40px) saturate(1.4)", WebkitBackdropFilter: "blur(40px) saturate(1.4)", borderRadius: 22, boxShadow: "0 8px 32px rgba(0,0,0,.2)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(-20px)", transition: "all .8s cubic-bezier(.16,1,.3,1)" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 20px rgba(0,229,160,.3)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div className="text-[18px] font-bold text-white" style={{ letterSpacing: "-.5px" }}>FXSynapse<span className="font-extrabold" style={{ color: "#00e5a0" }}> AI</span></div>
          </div>
          <div className="flex items-center gap-2">
            <a href={BL} target="_blank" rel="noopener noreferrer" onClick={() => bc("nav")} className="hidden sm:flex text-[11px] font-semibold no-underline px-3 py-1.5 rounded-xl items-center gap-1.5 transition-all hover:scale-105" style={{ background: "rgba(240,185,11,.08)", border: "1px solid rgba(240,185,11,.1)", color: "#f0b90b" }}>📈 Trade</a>
            <Link href="/pricing" className="hidden sm:block text-[11px] font-semibold no-underline px-3 py-1.5 rounded-xl" style={{ color: "rgba(255,255,255,.45)" }}>Pricing</Link>
            <Link href="/login" className="text-[11px] font-semibold no-underline px-4 py-2 rounded-xl transition-all hover:bg-white/10" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", color: "#fff" }}>Sign In</Link>
            <Link href="/login" onClick={() => sc("nav")} className="text-[11px] font-bold no-underline px-5 py-2 rounded-xl transition-all hover:scale-105" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", boxShadow: "0 2px 14px rgba(0,229,160,.3)" }}>Try Free →</Link>
          </div>
        </nav>

        {/* ═══ HERO — Cinematic ═══ */}
        <section className="flex flex-col items-center text-center relative" style={{ padding: "90px 24px 50px" }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMousePos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
          }}>
          {/* Mouse-follow aurora */}
          <div className="absolute pointer-events-none" style={{
            left: `${mousePos.x}%`, top: `${mousePos.y}%`,
            width: 500, height: 500, transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(0,229,160,.06) 0%, rgba(77,160,255,.03) 30%, transparent 65%)",
            filter: "blur(60px)", transition: "left 0.8s ease-out, top 0.8s ease-out",
            animation: "auroraShift 6s ease infinite",
          }} />
          <div style={{ transition: "all 1.2s cubic-bezier(.16,1,.3,1)", transitionDelay: ".1s", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(50px)" }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.1)", backdropFilter: "blur(20px)" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 12px #00e5a0", animation: "pulse 2s infinite" }} />
              <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color: "#00e5a0" }}>CHART INTELLIGENCE ENGINE</span>
            </div>
          </div>

          <h1 style={{ transition: "all 1.2s cubic-bezier(.16,1,.3,1)", transitionDelay: ".25s", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(50px)" }}>
            <span className="block font-extrabold text-white leading-[1.02] mb-2" style={{ fontSize: "clamp(36px,7vw,68px)", letterSpacing: "-3px" }}>
              Scan any chart.
            </span>
            <span className="block font-extrabold leading-[1.02]" style={{ fontSize: "clamp(36px,7vw,68px)", letterSpacing: "-3px" }}>
              <span className="inline-block" style={{ background: "linear-gradient(135deg,#00e5a0 0%,#4da0ff 40%,#a855f7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "200% 200%", animation: "gradientShift 4s ease infinite" }}>
                Get annotated {heroWords[heroWord]}
              </span>
            </span>
          </h1>

          <p className="text-[16px] max-w-[520px] mx-auto mt-7 mb-10" style={{ color: "rgba(255,255,255,.42)", lineHeight: 1.8, transition: "all 1.2s cubic-bezier(.16,1,.3,1)", transitionDelay: ".4s", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)" }}>
            Upload any forex chart — AI draws support, resistance, trendlines, entry/TP/SL, and gives you a trade-ready annotated chart in seconds.
          </p>

          <div style={{ transition: "all 1.2s cubic-bezier(.16,1,.3,1)", transitionDelay: ".55s", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)" }}>
            <div className="flex items-center gap-3 mb-4">
              <Link href="/login" onClick={() => sc("hero")} className="group no-underline px-9 py-4 rounded-2xl text-[15px] font-bold relative overflow-hidden transition-all hover:scale-[1.03]" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", boxShadow: "0 6px 35px rgba(0,229,160,.35), inset 0 1px 0 rgba(255,255,255,.2)" }}>
                <span className="relative z-[1]">Try Free — It&apos;s Instant</span>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(135deg,#00f5b0,#00c88d)" }} />
              </Link>
              <Link href="/login" className="no-underline px-8 py-4 rounded-2xl text-[15px] font-semibold transition-all hover:bg-white/[.08]" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#fff", backdropFilter: "blur(20px)" }}>Sign In</Link>
            </div>
            <p className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>No card required • 1 free scan • Plans from R49/mo</p>
          </div>

          {/* Platform trust bar */}
          <div className="flex gap-3 mt-10 flex-wrap justify-center" style={{ transition: "all 1.2s cubic-bezier(.16,1,.3,1)", transitionDelay: ".7s", opacity: visible ? 1 : 0 }}>
            {["MetaTrader 4", "MetaTrader 5", "TradingView", "cTrader"].map((p, i) => (
              <span key={p} className="px-4 py-2 rounded-2xl text-[11px] font-mono transition-all hover:scale-105" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)", color: "rgba(255,255,255,.3)", backdropFilter: "blur(10px)", animationDelay: `${i * 100}ms` }}>{p}</span>
            ))}
          </div>
        </section>

        {/* ═══ CHART PREVIEW — Self-drawing ═══ */}
        <section ref={sec1.ref} className="flex justify-center" style={{ padding: "20px 24px 100px", transition: "all 1s cubic-bezier(.16,1,.3,1)", opacity: sec1.vis ? 1 : 0, transform: sec1.vis ? "translateY(0) scale(1)" : "translateY(60px) scale(.96)" }}>
          <G className="w-full max-w-[820px] overflow-hidden" glow="rgba(0,229,160,.05)" style={{ boxShadow: "0 20px 80px rgba(0,0,0,.4), 0 0 80px rgba(0,229,160,.05)" }}>
            <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,77,106,.7)" }} /><div className="w-3 h-3 rounded-full" style={{ background: "rgba(240,185,11,.7)" }} /><div className="w-3 h-3 rounded-full" style={{ background: "rgba(0,229,160,.7)" }} /></div>
              <span className="text-[10px] font-mono ml-3" style={{ color: "rgba(255,255,255,.25)" }}>FXSynapse AI — Live Analysis</span>
              <div className="ml-auto flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00e5a0", animation: "pulse 2s infinite" }} /><span className="text-[9px] font-mono" style={{ color: "#00e5a0" }}>SCANNING</span></div>
            </div>
            <div className="relative" style={{ height: 360, background: "linear-gradient(180deg,rgba(0,229,160,.015) 0%,rgba(77,160,255,.015) 100%)" }}>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 360" preserveAspectRatio="none">
                {/* Self-drawing price line */}
                <path d="M0 280 L80 260 L160 230 L220 245 L280 215 L360 195 L420 205 L480 170 L540 150 L600 160 L660 125 L720 135 L800 100"
                  fill="none" stroke="rgba(0,229,160,.5)" strokeWidth="2.5"
                  style={{ strokeDasharray: 1200, strokeDashoffset: chartDrawn ? 0 : 1200, transition: "stroke-dashoffset 2.5s cubic-bezier(.4,0,.2,1)" }} />
                {/* Area fill */}
                <path d="M0 280 L80 260 L160 230 L220 245 L280 215 L360 195 L420 205 L480 170 L540 150 L600 160 L660 125 L720 135 L800 100 L800 360 L0 360 Z"
                  fill="url(#areaGrad)" style={{ opacity: chartDrawn ? 1 : 0, transition: "opacity 1.5s ease 1.5s" }} />
                <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(0,229,160,.08)" /><stop offset="100%" stopColor="transparent" /></linearGradient></defs>
                {/* Resistance zone */}
                <rect x="0" y="105" width="800" height="35" fill="rgba(255,77,106,.04)" style={{ opacity: chartDrawn ? 1 : 0, transition: "opacity .8s ease 2s" }} />
                <line x1="0" y1="120" x2="800" y2="120" stroke="rgba(255,77,106,.25)" strokeWidth="1" strokeDasharray="8 5" style={{ opacity: chartDrawn ? 1 : 0, transition: "opacity .8s ease 2s" }} />
                {/* Support zone */}
                <rect x="0" y="230" width="800" height="35" fill="rgba(0,229,160,.04)" style={{ opacity: chartDrawn ? 1 : 0, transition: "opacity .8s ease 2.2s" }} />
                <line x1="0" y1="245" x2="800" y2="245" stroke="rgba(0,229,160,.25)" strokeWidth="1" strokeDasharray="8 5" style={{ opacity: chartDrawn ? 1 : 0, transition: "opacity .8s ease 2.2s" }} />
              </svg>

              {/* Animated labels that appear after chart draws */}
              <div className="absolute top-[108px] right-4 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold transition-all" style={{ background: "rgba(255,77,106,.12)", color: "#ff4d6a", backdropFilter: "blur(12px)", opacity: chartDrawn ? 1 : 0, transform: chartDrawn ? "translateX(0)" : "translateX(20px)", transition: "all .6s ease 2.2s" }}>
                Resistance — 2,048.50
              </div>
              <div className="absolute top-[238px] right-4 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold" style={{ background: "rgba(0,229,160,.12)", color: "#00e5a0", backdropFilter: "blur(12px)", opacity: chartDrawn ? 1 : 0, transform: chartDrawn ? "translateX(0)" : "translateX(20px)", transition: "all .6s ease 2.4s" }}>
                Support — 1,982.30
              </div>
              <div className="absolute top-3 left-3 px-3 py-2 rounded-xl text-[11px] font-mono font-bold" style={{ background: "rgba(0,0,0,.5)", backdropFilter: "blur(16px)", color: "#fff", border: "1px solid rgba(255,255,255,.06)" }}>XAUUSD • H1</div>

              {/* Entry/TP/SL markers — appear with bounce */}
              {[
                { label: "Entry", top: 145, left: "62%", color: "#00e5a0", delay: "2.6s" },
                { label: "TP", top: 85, left: "76%", color: "#4da0ff", delay: "2.8s" },
                { label: "SL", top: 250, left: "55%", color: "#ff4d6a", delay: "3s" },
              ].map((m) => (
                <div key={m.label} className="absolute" style={{ top: m.top, left: m.left, opacity: chartDrawn ? 1 : 0, transform: chartDrawn ? "scale(1)" : "scale(0)", transition: `all .5s cubic-bezier(.34,1.56,.64,1) ${m.delay}` }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${m.color}`, background: `${m.color}20`, boxShadow: `0 0 15px ${m.color}40` }} />
                  <span className="absolute -top-5 left-5 text-[10px] font-mono font-bold whitespace-nowrap" style={{ color: m.color }}>{m.label}</span>
                </div>
              ))}

              {/* Confidence badge */}
              <div className="absolute top-3 right-3 flex gap-1.5">
                <span className="px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold" style={{ background: "rgba(0,229,160,.12)", color: "#00e5a0", backdropFilter: "blur(10px)", opacity: chartDrawn ? 1 : 0, transition: "opacity .6s ease 3.2s" }}>BULLISH</span>
                <span className="px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold" style={{ background: "rgba(77,160,255,.12)", color: "#4da0ff", backdropFilter: "blur(10px)", opacity: chartDrawn ? 1 : 0, transition: "opacity .6s ease 3.4s" }}>87% Confidence</span>
              </div>

              <div className="absolute bottom-3 right-4 text-[11px] font-mono font-bold" style={{ color: "rgba(0,229,160,.25)" }}>FXSynapse AI</div>

              {/* Scanning beam — sweeps across chart */}
              <div className="absolute top-0 h-full" style={{ width: "2px", background: "linear-gradient(180deg, transparent, #00e5a0, transparent)", boxShadow: "0 0 20px rgba(0,229,160,.4), 0 0 60px rgba(0,229,160,.15)", animation: "scanBeam 4s ease-in-out infinite", animationDelay: "3.5s", opacity: 0 }} />
              <div className="absolute top-0 h-full" style={{ width: "40px", background: "linear-gradient(90deg, transparent, rgba(0,229,160,.03), transparent)", animation: "scanBeam 4s ease-in-out infinite", animationDelay: "3.5s", opacity: 0 }} />
            </div>

            {/* Live Activity Ticker */}
            <div className="overflow-hidden" style={{ borderTop: "1px solid rgba(255,255,255,.04)", padding: "8px 0" }}>
              <div className="flex items-center gap-8 whitespace-nowrap" style={{ animation: "tickerScroll 30s linear infinite" }}>
                {[...Array(2)].map((_, copy) => (
                  <div key={copy} className="flex items-center gap-8">
                    {[
                      { pair: "XAUUSD", tf: "H1", bias: "Bullish", conf: "87%", time: "2s ago", color: "#00e5a0" },
                      { pair: "EURUSD", tf: "H4", bias: "Bearish", conf: "74%", time: "18s ago", color: "#ff4d6a" },
                      { pair: "GBPJPY", tf: "M15", bias: "Bullish", conf: "91%", time: "45s ago", color: "#00e5a0" },
                      { pair: "BTCUSD", tf: "D1", bias: "Bullish", conf: "82%", time: "1m ago", color: "#00e5a0" },
                      { pair: "USDJPY", tf: "H1", bias: "Bearish", conf: "68%", time: "2m ago", color: "#ff4d6a" },
                      { pair: "NAS100", tf: "H4", bias: "Bullish", conf: "79%", time: "3m ago", color: "#00e5a0" },
                    ].map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
                        <span className="text-[10px] font-mono font-bold text-white">{t.pair}</span>
                        <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{t.tf}</span>
                        <span className="text-[9px] font-mono font-bold" style={{ color: t.color }}>{t.bias} {t.conf}</span>
                        <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{t.time}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex gap-5">
                {[{ c: "#00e5a0", l: "Support / Entry" }, { c: "#ff4d6a", l: "Resistance / SL" }, { c: "#4da0ff", l: "Trend / TP" }].map((x, i) => (
                  <div key={i} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: x.c, boxShadow: `0 0 8px ${x.c}50` }} /><span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{x.l}</span></div>
                ))}
              </div>
              <span className="text-[9px] font-mono tracking-wider" style={{ color: "rgba(255,255,255,.15)" }}>AI-ANNOTATED</span>
            </div>
          </G>
        </section>

        {/* ═══ SOCIAL PROOF — Animated Counters ═══ */}
        <section className="text-center" style={{ padding: "0 24px 80px" }}>
          <G className="max-w-2xl mx-auto px-8 py-8" style={{ background: "rgba(255,255,255,.025)" }}>
            <div className="grid grid-cols-3 gap-6">
              {[
                { end: 40, suffix: "+", label: "Active Traders", color: "#00e5a0" },
                { end: 500, suffix: "+", label: "Charts Analyzed", color: "#4da0ff" },
                { end: 10, suffix: "s", label: "Avg Analysis", color: "#f0b90b", prefix: "<" },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-[32px] font-extrabold" style={{ color: s.color, textShadow: `0 0 40px ${s.color}25` }}>
                    {s.prefix || ""}<Counter end={s.end} suffix={s.suffix} />
                  </div>
                  <div className="text-[10px] font-mono mt-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.25)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </G>
        </section>

        {/* ═══ HOW IT WORKS ═══ */}
        <section ref={sec2.ref} style={{ padding: "40px 24px 80px" }}>
          <div className="text-center mb-14" style={{ transition: "all .8s ease", opacity: sec2.vis ? 1 : 0, transform: sec2.vis ? "translateY(0)" : "translateY(30px)" }}>
            <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color: "#4da0ff" }}>HOW IT WORKS</span>
            <h2 className="text-[32px] font-extrabold text-white mt-3 mb-2" style={{ letterSpacing: "-2px" }}>Three steps. Ten seconds.</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.35)" }}>From chart screenshot to trade-ready analysis</p>
          </div>
          <div className="max-w-3xl mx-auto grid md:grid-cols-3 gap-6">
            {[
              { n: "01", title: "Upload", desc: "Drop any forex chart — PNG or JPG from MT4, MT5, TradingView, or cTrader.", icon: "📤" },
              { n: "02", title: "AI Analyzes", desc: "Neural engine reads price action, detects patterns, maps structure & levels.", icon: "🧠" },
              { n: "03", title: "Trade", desc: "Get annotated chart with entry, TP, SL, zones, confluence grading, and bias.", icon: "🎯" },
            ].map((s, i) => (
              <div key={s.n} style={{ transition: "all .8s cubic-bezier(.16,1,.3,1)", transitionDelay: `${i * 150}ms`, opacity: sec2.vis ? 1 : 0, transform: sec2.vis ? "translateY(0)" : "translateY(40px)" }}>
                <G className="p-7 text-center relative overflow-hidden group cursor-default mag-lift glass-shimmer">
                  {/* Hover glow */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(circle at 50% 0%, rgba(0,229,160,.06) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="text-3xl mb-3">{s.icon}</div>
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl mb-3 text-[11px] font-extrabold font-mono" style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.15)", color: "#00e5a0" }}>{s.n}</div>
                    <h3 className="text-[16px] font-bold text-white mb-2">{s.title}</h3>
                    <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,.4)" }}>{s.desc}</p>
                  </div>
                </G>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ FEATURES ═══ */}
        <section ref={sec3.ref} style={{ padding: "40px 24px 80px" }}>
          <div className="text-center mb-14" style={{ transition: "all .8s ease", opacity: sec3.vis ? 1 : 0, transform: sec3.vis ? "translateY(0)" : "translateY(30px)" }}>
            <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color: "#a855f7" }}>FEATURES</span>
            <h2 className="text-[32px] font-extrabold text-white mt-3 mb-2" style={{ letterSpacing: "-2px" }}>Built for serious traders</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.35)" }}>Professional-grade analysis, instant delivery</p>
          </div>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} style={{ transition: "all .7s cubic-bezier(.16,1,.3,1)", transitionDelay: `${i * 80}ms`, opacity: sec3.vis ? 1 : 0, transform: sec3.vis ? "translateY(0)" : "translateY(30px)" }}>
                <G className="p-6 group cursor-default relative overflow-hidden h-full mag-lift glass-shimmer">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle at 30% 0%, ${f.color}08 0%, transparent 60%)` }} />
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-xl" style={{ background: `${f.color}10`, border: `1px solid ${f.color}18` }}>{f.icon}</div>
                    <h3 className="text-[15px] font-bold text-white mb-2">{f.title}</h3>
                    <p className="text-[12px] leading-[1.7]" style={{ color: "rgba(255,255,255,.4)" }}>{f.desc}</p>
                  </div>
                </G>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ PRICING ═══ */}
        <section ref={sec4.ref} style={{ padding: "40px 24px 80px" }}>
          <div className="text-center mb-14" style={{ transition: "all .8s ease", opacity: sec4.vis ? 1 : 0, transform: sec4.vis ? "translateY(0)" : "translateY(30px)" }}>
            <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color: "#00e5a0" }}>PRICING</span>
            <h2 className="text-[32px] font-extrabold text-white mt-3 mb-2" style={{ letterSpacing: "-2px" }}>Start free. Scale when ready.</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.35)" }}>Each scan costs less than a cup of coffee</p>
          </div>
          <div className="max-w-[900px] mx-auto grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <div key={plan.name} style={{ transition: "all .8s cubic-bezier(.16,1,.3,1)", transitionDelay: `${i * 120}ms`, opacity: sec4.vis ? 1 : 0, transform: sec4.vis ? "translateY(0) scale(1)" : "translateY(40px) scale(.95)" }}>
                <G className={`p-7 relative group cursor-default mag-lift glass-shimmer ${plan.popular ? "ring-1 ring-[rgba(0,229,160,.2)]" : ""}`}
                  glow={plan.popular ? "rgba(0,229,160,.08)" : ""}
                  style={{ background: plan.popular ? "rgba(0,229,160,.03)" : undefined, transform: plan.popular ? "scale(1.03)" : undefined }}>
                  {plan.popular && <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-bold font-mono" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", boxShadow: "0 4px 15px rgba(0,229,160,.35)" }}>MOST POPULAR</div>}
                  <h3 className="text-[17px] font-bold text-white">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2 mb-1">
                    <span className="text-[34px] font-extrabold" style={{ color: plan.popular ? "#00e5a0" : "#fff", letterSpacing: "-1px" }}>{plan.price}</span>
                    <span className="text-sm font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{plan.period}</span>
                  </div>
                  <div className="text-[11px] font-mono mb-5 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5" style={{ background: "rgba(77,160,255,.06)", color: "#4da0ff", border: "1px solid rgba(77,160,255,.1)" }}>
                    <span className="font-bold">{plan.scans}</span> scans/month
                  </div>
                  <div className="flex flex-col gap-2.5 mb-6">
                    {plan.features.map((f, j) => (
                      <div key={j} className="flex items-center gap-2.5 text-[12px]" style={{ color: "rgba(255,255,255,.45)" }}>
                        <div className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,229,160,.1)" }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        {f}
                      </div>
                    ))}
                  </div>
                  <Link href="/pricing" className="block w-full py-3.5 rounded-2xl text-[13px] font-bold no-underline text-center transition-all hover:scale-[1.02]" style={{
                    background: plan.popular ? "linear-gradient(135deg,#00e5a0,#00b87d)" : "rgba(255,255,255,.06)",
                    color: plan.popular ? "#050507" : "#fff",
                    border: plan.popular ? "none" : "1px solid rgba(255,255,255,.08)",
                    boxShadow: plan.popular ? "0 6px 25px rgba(0,229,160,.3)" : "none",
                  }}>{plan.cta}</Link>
                </G>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section ref={sec5.ref} className="text-center" style={{ padding: "20px 24px 60px" }}>
          <div style={{ transition: "all 1s cubic-bezier(.16,1,.3,1)", opacity: sec5.vis ? 1 : 0, transform: sec5.vis ? "translateY(0) scale(1)" : "translateY(40px) scale(.97)" }}>
            <G className="max-w-lg mx-auto px-8 py-10 text-center relative overflow-hidden" glow="rgba(0,229,160,.06)">
              <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 0%, rgba(0,229,160,.08) 0%, transparent 60%)" }} />
              <div className="relative">
                <div className="text-4xl mb-4">⚡</div>
                <h2 className="text-[26px] font-extrabold text-white mb-3" style={{ letterSpacing: "-1.5px" }}>See what AI sees in your chart</h2>
                <p className="text-[14px] mb-8" style={{ color: "rgba(255,255,255,.38)", lineHeight: 1.7 }}>Upload any chart. Get annotated intelligence in 10 seconds. No card required.</p>
                <Link href="/login" onClick={() => sc("cta")} className="inline-block no-underline px-10 py-4.5 rounded-2xl text-[15px] font-bold transition-all hover:scale-[1.03]" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", boxShadow: "0 8px 40px rgba(0,229,160,.35), inset 0 1px 0 rgba(255,255,255,.2)", padding: "18px 40px" }}>
                  Get Your Free Scan →
                </Link>
                <div className="flex items-center justify-center gap-3 mt-5">
                  <div className="flex -space-x-2">
                    {["🇿🇦", "🇳🇬", "🇬🇧", "🇰🇪"].map((f, i) => (
                      <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: "rgba(255,255,255,.06)", border: "2px solid #050507" }}>{f}</div>
                    ))}
                  </div>
                  <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Trusted by traders across Africa</span>
                </div>
              </div>
            </G>
          </div>
        </section>

        {/* ═══ BROKER + AFFILIATE ═══ */}
        <section ref={sec6.ref} className="space-y-4" style={{ padding: "0 24px 60px", transition: "all .8s ease", opacity: sec6.vis ? 1 : 0, transform: sec6.vis ? "translateY(0)" : "translateY(30px)" }}>
          <a href={BL} target="_blank" rel="noopener noreferrer" onClick={() => bc("banner")} className="block no-underline max-w-2xl mx-auto transition-all hover:scale-[1.01]">
            <G className="overflow-hidden" glow="rgba(240,185,11,.03)">
              <div className="flex items-center justify-between px-6 py-5 gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(240,185,11,.1)", border: "1px solid rgba(240,185,11,.15)" }}><span className="text-xl">📊</span></div>
                  <div><div className="text-[14px] font-semibold text-white">Recommended Broker</div><div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Forex, Synthetics & Crypto • Regulated • Fast Execution</div></div>
                </div>
                <div className="px-5 py-2.5 rounded-2xl text-[12px] font-bold" style={{ background: "linear-gradient(135deg,#f0b90b,#e6a800)", color: "#050507", boxShadow: "0 4px 15px rgba(240,185,11,.25)" }}>Open Account →</div>
              </div>
            </G>
          </a>
          <G className="max-w-2xl mx-auto overflow-hidden transition-all hover:scale-[1.01]" glow="rgba(168,85,247,.03)">
            <div className="flex items-center justify-between px-6 py-5 gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(168,85,247,.1)", border: "1px solid rgba(168,85,247,.15)" }}><span className="text-xl">💰</span></div>
                <div><div className="text-[14px] font-semibold text-white">Earn 20% Recurring Commission</div><div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Refer traders to FXSynapse AI • Earn every month they stay</div></div>
              </div>
              <Link href="/affiliate" className="px-5 py-2.5 rounded-2xl text-[12px] font-bold no-underline" style={{ background: "linear-gradient(135deg,#a855f7,#7c3aed)", color: "#fff", boxShadow: "0 4px 15px rgba(168,85,247,.25)" }}>Become an Affiliate →</Link>
            </div>
          </G>
          {/* Android Download */}
          <div className="max-w-2xl mx-auto text-center pt-4">
            <a href="/FXSynapse-AI.apk" download onClick={() => trackEvent("apk_download")} className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl no-underline transition-all hover:scale-[1.02]" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", backdropFilter: "blur(20px)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#3ddc84"><path d="M17.523 2.248a.75.75 0 0 0-1.046.224l-1.3 2.044A7.96 7.96 0 0 0 12 3.75a7.96 7.96 0 0 0-3.177.766l-1.3-2.044a.75.75 0 1 0-1.27.808l1.2 1.886A8.004 8.004 0 0 0 4 12v.75h16V12a8.004 8.004 0 0 0-3.453-6.584l1.2-1.886a.75.75 0 0 0-.224-1.046V2.248zM9.5 9.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm5 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM4 14.25h16v4A3.75 3.75 0 0 1 16.25 22h-8.5A3.75 3.75 0 0 1 4 18.25v-4z"/></svg>
              <div className="text-left"><div className="text-[12px] font-bold text-white">Download Android App</div><div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>FXSynapse-AI.apk</div></div>
            </a>
          </div>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer className="text-center" style={{ padding: "32px 24px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <span className="text-[13px] font-bold text-white">FXSynapse AI</span>
          </div>
          <div className="flex items-center justify-center gap-5 mb-3">
            <Link href="/pricing" className="text-[11px] font-mono no-underline transition-colors hover:text-white" style={{ color: "rgba(255,255,255,.3)" }}>Pricing</Link>
            <Link href="/affiliate" className="text-[11px] font-mono no-underline transition-colors hover:text-white" style={{ color: "rgba(255,255,255,.3)" }}>Affiliate</Link>
            <Link href="/login" className="text-[11px] font-mono no-underline transition-colors hover:text-white" style={{ color: "rgba(255,255,255,.3)" }}>Sign In</Link>
          </div>
          <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>Chart analysis for educational purposes only. Not financial advice. Always manage your risk.</p>
        </footer>
      </div>

      {/* ═══ BROKER POPUP ═══ */}
      {showBrokerPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,.7)", backdropFilter: "blur(24px)" }} onClick={dp}>
          <div className="relative w-full max-w-[460px] mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,21,30,.88)", border: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(60px) saturate(1.6)", borderRadius: 28, boxShadow: "0 25px 80px rgba(0,0,0,.5), 0 0 60px rgba(240,185,11,.06)", animation: "gSU .5s cubic-bezier(.16,1,.3,1)" }}>
            <button onClick={dp} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer z-10" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.4)", fontSize: 14 }}>✕</button>
            <div className="relative px-7 pt-8 pb-6 text-center" style={{ background: "linear-gradient(180deg,rgba(240,185,11,.08) 0%,transparent 100%)" }}>
              <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#f0b90b,#e6a800)", boxShadow: "0 8px 30px rgba(240,185,11,.3)" }}><span className="text-3xl">📈</span></div>
              <h2 className="text-[22px] font-extrabold text-white mb-1.5" style={{ letterSpacing: "-.5px" }}>Start Trading Today</h2>
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,.4)" }}>Our recommended broker</p>
            </div>
            <div className="px-7 pb-2 flex flex-col gap-3">
              {[{ i: "⚡", t: "Instant Execution", d: "Lightning-fast fills" }, { i: "📊", t: "All Markets", d: "Forex, Synthetics, Crypto" }, { i: "💰", t: "Low Spreads", d: "From 0.0 pips" }, { i: "🔒", t: "Regulated", d: "Licensed & secure" }].map((x, i) => (
                <div key={i} className="flex items-start gap-3"><div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(240,185,11,.08)", border: "1px solid rgba(240,185,11,.1)" }}><span>{x.i}</span></div><div><div className="text-[13px] font-semibold text-white">{x.t}</div><div className="text-[11px]" style={{ color: "rgba(255,255,255,.3)" }}>{x.d}</div></div></div>
              ))}
            </div>
            <div className="px-7 pt-5 pb-6">
              <a href={BL} target="_blank" rel="noopener noreferrer" onClick={() => { bc("popup"); dp(); }} className="block w-full py-4 rounded-2xl text-[15px] font-bold no-underline text-center" style={{ background: "linear-gradient(135deg,#f0b90b,#e6a800)", color: "#050507", boxShadow: "0 6px 25px rgba(240,185,11,.3)" }}>Open Free Account →</a>
              <button onClick={dp} className="w-full py-2.5 mt-3 text-[12px] cursor-pointer" style={{ background: "none", border: "none", color: "rgba(255,255,255,.25)" }}>Maybe later</button>
            </div>
          </div>
        </div>
      )}

      <ChatWidget />
      <style jsx global>{`
        @keyframes orbF { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-20px) scale(1.05)} 66%{transform:translate(-20px,15px) scale(.95)} }
        @keyframes gSU { from{opacity:0;transform:translateY(40px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.3)} }
        @keyframes gradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      `}</style>
    </div>
  );
}
