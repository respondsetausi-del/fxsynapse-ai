"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Stage, ViewMode, AnalysisResult } from "@/lib/types";
import { CreditCheck } from "@/lib/credits";
import AnnotatedChart from "@/components/AnnotatedChart";
import FullscreenModal from "@/components/FullscreenModal";
import Sidebar from "@/components/Sidebar";
import AIFundamentals from "@/components/AIFundamentals";
import LiveMarketEngine from "@/components/LiveMarketEngine";
import SignalFeed from "@/components/SignalFeed";
import AIChat from "@/components/AIChat";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STEPS = [
  { l: "Reading price axis", t: 0 }, { l: "Mapping market structure", t: 14 },
  { l: "Detecting S/R & order blocks", t: 28 }, { l: "Scanning liquidity & FVGs", t: 42 },
  { l: "Annotating chart", t: 58 }, { l: "Generating trade setup", t: 76 },
];

interface UserProfile {
  id: string; email: string; full_name: string; role: string;
  plan_id: string; credits_balance: number; avatar_url: string;
  subscription_status: string;
  plans: { name: string };
}

export default function Dashboard() {
  const [stage, setStage] = useState<Stage>("upload");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [isDrag, setIsDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "indicators">("overview");
  const [dashView, setDashView] = useState<"scanner" | "signals" | "fundamentals" | "markets" | "chat">("scanner");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [fullscreen, setFullscreen] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [credits, setCredits] = useState<CreditCheck | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [showBrokerPopup, setShowBrokerPopup] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [scanPaid, setScanPaid] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showScreenshotGuide, setShowScreenshotGuide] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileObjRef = useRef<File | null>(null);
  const supabase = createClient();
  const router = useRouter();
  const isPaidUser = user?.subscription_status === "active" && user?.plan_id && user.plan_id !== "free" && user.plan_id !== "none";
  const showFull = isPaidUser || false;
  const userTier = user?.plan_id || "free";

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.push("/login"); return; }
      const res = await fetch("/api/user");
      if (res.ok) {
        const data = await res.json();
        setUser(data.profile);
        setCredits(data.credits);

        // ═══ AFFILIATE: Process referral if user signed up via ref link ═══
        if (!data.profile.referred_by) {
          const refCode = localStorage.getItem("fxs_ref");
          const refAt = localStorage.getItem("fxs_ref_at");
          if (refCode && refAt) {
            const daysSince = (Date.now() - parseInt(refAt)) / (1000 * 60 * 60 * 24);
            if (daysSince <= 30) {
              fetch("/api/affiliate/register-referral", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refCode }),
              }).then(() => {
                localStorage.removeItem("fxs_ref");
                localStorage.removeItem("fxs_ref_at");
              }).catch(() => {});
            } else {
              localStorage.removeItem("fxs_ref");
              localStorage.removeItem("fxs_ref_at");
            }
          }
        }

        // No hard paywall redirect — all users can access dashboard
        // Paywall shows when they try to scan without credits or view results
        setAuthLoading(false);

        // First-time onboarding
        const seen = localStorage.getItem("fxs_onboarded");
        if (!seen) { setTimeout(() => setShowOnboarding(true), 600); }
      } else {
        router.push("/login");
      }
    })();
  }, [supabase, router]);

  // Smart broker popup — show once per session after 8 seconds
  useEffect(() => {
    const dismissed = sessionStorage.getItem("broker_popup_seen");
    if (dismissed) return;
    const t = setTimeout(() => {
      setShowBrokerPopup(true);
      sessionStorage.setItem("broker_popup_seen", "1");
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const BROKER_LINK = "https://track.deriv.com/_oJ-a7wvPzFJB4VdSfJsOp2Nd7ZgqdRLk/1/";

  const trackEvent = (event_type: string, source?: string) => {
    fetch("/api/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type, source, user_id: user?.id }),
    }).catch(() => {});
  };

  const submitRating = async (stars: number) => {
    setRating(stars);
    setRatingSubmitted(true);
    try { await fetch("/api/ratings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: stars }) }); } catch {}
  };

  const handleFile = useCallback((file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setFileName(file.name); setError(null);
    fileObjRef.current = file;
    const reader = new FileReader();
    reader.onload = (e) => { setDataUrl(e.target?.result as string); setStage("preview"); };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDrag(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const analyzeChart = async () => {
    if (!fileObjRef.current) return;
    if (credits && !credits.canScan) { setShowPaywall(true); return; }
    setStage("analyzing"); setProgress(0); setError(null);
    const iv = setInterval(() => { setProgress((p) => p >= 90 ? 90 : p + Math.random() * 8 + 2); }, 300);
    try {
      // Retry logic for 529 (Vercel throttling)
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const fd = new FormData();
        fd.append("image", fileObjRef.current!);
        res = await fetch("/api/analyze", { method: "POST", body: fd });
        if (res.status !== 529) break;
        if (attempt < 2) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
      }
      if (!res || res.status === 529) throw new Error("Server is busy — please try again in a moment.");

      // Check status codes BEFORE parsing body (body might not be valid JSON on errors)
      if (res.status === 403) { clearInterval(iv); router.push("/pricing?gate=1"); return; }
      if (res.status === 402) { clearInterval(iv); setShowPaywall(true); setStage("preview"); return; }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      clearInterval(iv); setProgress(100);
      if (data.credits) setCredits((prev) => prev ? { ...prev, ...data.credits } : prev);
      setScanPaid(true);
      setTimeout(() => {
        setAnalysis(data.analysis); setStage("result");
        setTimeout(() => {
          setShowResult(true);
          // Auto-show paywall for free users after they see the chart (the hook)
          if (!showFull) setTimeout(() => setShowPaywall(true), 2500);
        }, 100);
      }, 500);
    } catch (err) {
      clearInterval(iv);
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setStage("preview");
    }
  };

  const reset = () => {
    setStage("upload"); setDataUrl(null); setFileName(""); setProgress(0);
    setShowResult(false); setActiveTab("overview"); setViewMode("split");
    setFullscreen(false); setAnalysis(null); setError(null);
    setRating(0); setRatingHover(0); setRatingSubmitted(false);
    setScanPaid(false);
    fileObjRef.current = null;
  };

  const cc = (v: number) => (v >= 75 ? "#00e5a0" : v >= 50 ? "#f0b90b" : "#ff4d6a");
  const A = analysis;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#050507" }}>
      {/* LOADING WALL — blocks everything until auth + plan verified */}
      {authLoading && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ background: "#050507" }}>
          <div className="text-center">
            <div className="w-12 h-12 rounded-lg mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div className="text-sm font-bold text-white mb-1">FXSynapse AI</div>
            <div className="text-[10px] font-mono animate-pulse" style={{ color: "rgba(255,255,255,.35)" }}>Loading...</div>
          </div>
        </div>
      )}

      {/* BG — Ambient Glass Orbs */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute" style={{ top: "-15%", left: "-8%", width: 650, height: 650, background: "radial-gradient(circle,rgba(0,229,160,.07) 0%,transparent 65%)", filter: "blur(100px)", animation: "orbF 20s ease-in-out infinite" }} />
        <div className="absolute" style={{ bottom: "-10%", right: "-8%", width: 550, height: 550, background: "radial-gradient(circle,rgba(77,160,255,.05) 0%,transparent 65%)", filter: "blur(100px)", animation: "orbF 25s ease-in-out infinite reverse" }} />
        <div className="absolute" style={{ top: "40%", left: "50%", width: 400, height: 400, background: "radial-gradient(circle,rgba(168,85,247,.03) 0%,transparent 60%)", filter: "blur(100px)", animation: "orbF 22s 5s ease-in-out infinite" }} />
        <div className="absolute inset-0" style={{ opacity: 0.015, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      {/* Sidebar */}
      <Sidebar user={user} credits={credits} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-[1] min-h-screen flex flex-col">
        {/* Header — Floating Glass */}
        <header className="flex items-center justify-between mx-3" style={{ padding: "14px 18px", marginTop: 16, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", backdropFilter: "blur(40px) saturate(1.4)", WebkitBackdropFilter: "blur(40px) saturate(1.4)", borderRadius: 20, boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1 cursor-pointer p-1.5 rounded-xl" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ width: 16, height: 2, background: "rgba(255,255,255,.5)", borderRadius: 1 }} />
              <div style={{ width: 16, height: 2, background: "rgba(255,255,255,.5)", borderRadius: 1 }} />
              <div style={{ width: 16, height: 2, background: "rgba(255,255,255,.5)", borderRadius: 1 }} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 18px rgba(0,229,160,.25)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div>
                <div className="text-[17px] font-bold text-white" style={{ letterSpacing: "-.5px" }}>FXSynapse<span className="font-extrabold" style={{ color: "#00e5a0" }}> AI</span></div>
                <div className="text-[9px] uppercase tracking-[1.5px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Chart Intelligence Engine</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Recommended Broker */}
            <a href={BROKER_LINK} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("broker_click", "header")} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full no-underline transition-all hover:opacity-90" style={{ background: "rgba(240,185,11,.1)", border: "1px solid rgba(240,185,11,.15)" }}>
              <span className="text-[10px]">📈</span>
              <span className="text-[10px] font-mono font-medium" style={{ color: "#f0b90b" }}>Trade Now</span>
            </a>
            {/* Admin button */}
            {user?.role === "admin" && (
              <Link href="/admin" className="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold no-underline" style={{
                background: "rgba(255,77,106,.12)", border: "1px solid rgba(255,77,106,.2)", color: "#ff4d6a",
              }}>
                👑 Admin
              </Link>
            )}
            {/* User avatar */}
            {user && (
              <button onClick={() => setSidebarOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer" style={{ background: "rgba(0,229,160,.15)", border: "1px solid rgba(0,229,160,.2)", color: "#00e5a0" }}>
                {(user.full_name || user.email)[0]?.toUpperCase()}
              </button>
            )}
          </div>
        </header>

        {/* ── Dashboard View Toggle ── */}
        <div className="flex items-center gap-1 mx-4 mt-3 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", backdropFilter: "blur(20px)" }}>
          {([
            { id: "scanner", label: "📸 Scanner", color: "#00e5a0", adminOnly: false },
            { id: "fundamentals", label: "📊 Fundamentals", color: "#f0b90b", adminOnly: false },
            { id: "signals", label: "📡 Signals", color: "#4da0ff", adminOnly: true },
            { id: "chat", label: "💬 AI Chat", color: "#a855f7", adminOnly: true },
          ] as const).filter(v => !v.adminOnly || user?.role === "admin").map(v => (
            <button
              key={v.id}
              onClick={() => setDashView(v.id)}
              className="flex-1 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
              style={{
                background: dashView === v.id ? `${v.color}12` : "transparent",
                border: dashView === v.id ? `1px solid ${v.color}25` : "1px solid transparent",
                color: dashView === v.id ? v.color : "rgba(255,255,255,.3)",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* ── AI SIGNALS VIEW — Admin Only ── */}
        {dashView === "signals" && user?.role === "admin" && (
          <div className="px-4 py-4">
            <SignalFeed userTier={userTier} />
          </div>
        )}

        {/* ── AI FUNDAMENTALS VIEW ── */}
        {dashView === "fundamentals" && (
          <div className="px-4 py-4">
            <AIFundamentals userPlan={user?.plan_id || "free"} userRole={user?.role || ""} />
          </div>
        )}

        {/* ── AI CHAT VIEW — Admin Only ── */}
        {dashView === "chat" && user?.role === "admin" && (
          <AIChat userTier={userTier} />
        )}

        {/* ── LIVE MARKETS VIEW ── */}
        {dashView === "markets" && (
          <div className="px-4 py-4">
            <LiveMarketEngine userTier={user?.plan_id === "premium" ? "premium" : user?.plan_id === "pro" ? "pro" : "free"} />
          </div>
        )}

        {/* ── SCANNER VIEW ── */}
        {dashView === "scanner" && (<>

        {/* Upgrade Banner for Free Users */}
        {user?.plan_id === "free" && stage !== "analyzing" && (
          <div className="mx-4 mt-3 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap" style={{ background: "linear-gradient(135deg, rgba(0,229,160,.06), rgba(77,160,255,.04))", border: "1px solid rgba(0,229,160,.12)", backdropFilter: "blur(20px)" }}>
            <div className="flex items-center gap-2">
              <span className="text-sm">⚡</span>
              <div>
                <span className="text-[11px] font-semibold text-white">Unlock full trade setups — Entry, TP, SL, R:R & confluences</span>
                <span className="text-[10px] ml-2 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>From R79/mo</span>
              </div>
            </div>
            <Link href="/pricing" className="px-3 py-1.5 rounded-lg text-[10px] font-bold no-underline whitespace-nowrap" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507" }}>
              Upgrade Now
            </Link>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center" style={{ padding: stage === "result" ? "16px 20px" : "36px 22px" }}>

          {/* UPLOAD */}
          {stage === "upload" && (
            <div className="max-w-[530px] w-full animate-fadeUp">
              <div className="text-center mb-8">
                <h1 className="font-extrabold text-white leading-[1.15] mb-2.5" style={{ fontSize: "clamp(24px,5vw,36px)", letterSpacing: "-1.5px" }}>
                  Upload your chart.<br />
                  <span style={{ background: "linear-gradient(135deg,#00e5a0 0%,#4da0ff 40%,#a855f7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "200% 200%", animation: "gradientShift 4s ease infinite" }}>
                    AI gives you the trade setup.
                  </span>
                </h1>
                <p className="text-[13px] max-w-[400px] mx-auto" style={{ color: "rgba(255,255,255,.4)", lineHeight: 1.7 }}>
                  Screenshot any chart from your trading app — AI tells you where to enter, take profit, and stop loss.
                </p>
                {credits && (
                  <p className="text-[10px] font-mono mt-3 px-3 py-1.5 rounded-full inline-flex items-center gap-2" style={{
                    background: (credits.monthlyRemaining ?? 0) > 0 || credits.monthlyRemaining === -1 ? "rgba(0,229,160,.06)" : "rgba(255,77,106,.06)",
                    border: `1px solid ${(credits.monthlyRemaining ?? 0) > 0 || credits.monthlyRemaining === -1 ? "rgba(0,229,160,.12)" : "rgba(255,77,106,.12)"}`,
                    color: (credits.monthlyRemaining ?? 0) > 0 || credits.monthlyRemaining === -1 ? "#00e5a0" : "#ff4d6a",
                  }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: (credits.monthlyRemaining ?? 0) > 0 || credits.monthlyRemaining === -1 ? "#00e5a0" : "#ff4d6a", boxShadow: `0 0 6px ${(credits.monthlyRemaining ?? 0) > 0 || credits.monthlyRemaining === -1 ? "#00e5a0" : "#ff4d6a"}` }} />
                    {credits.monthlyRemaining === -1 ? "Unlimited scans" :
                     (credits.monthlyRemaining ?? 0) > 0 ? `${credits.monthlyRemaining}/${credits.monthlyLimit} scans remaining` :
                     (credits.topupBalance ?? 0) > 0 ? `${credits.topupBalance} top-up scans remaining` :
                     "No scans remaining"}
                    {(credits.topupBalance ?? 0) > 0 && (credits.monthlyRemaining ?? 0) > 0 ? ` + ${credits.topupBalance} top-up` : ""}
                  </p>
                )}
              </div>
              {/* Upload zone */}
              <div className="relative group">
                <div className="absolute -inset-[1px] rounded-3xl opacity-30 group-hover:opacity-60 transition-opacity duration-500" style={{ background: "linear-gradient(135deg, #00e5a0, #4da0ff, #a855f7)", filter: "blur(3px)" }} />
                <div className="relative text-center cursor-pointer transition-all rounded-3xl overflow-hidden"
                  style={{ padding: "55px 34px", background: isDrag ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.025)", border: "1px solid transparent", backdropFilter: "blur(40px) saturate(1.5)", boxShadow: isDrag ? "0 0 60px rgba(0,229,160,.15), inset 0 0 60px rgba(0,229,160,.05)" : "0 8px 32px rgba(0,0,0,.25)" }}
                  onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }} onDragLeave={() => setIsDrag(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  <div className="mx-auto mb-5 relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
                    {/* Orbit particles */}
                    <div className="absolute w-2 h-2 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 10px #00e5a0", animation: "orbit 3s linear infinite", opacity: 0.7 }} />
                    <div className="absolute w-1.5 h-1.5 rounded-full" style={{ background: "#4da0ff", boxShadow: "0 0 8px #4da0ff", animation: "orbit2 4s linear infinite", opacity: 0.5 }} />
                    <div className="absolute w-1 h-1 rounded-full" style={{ background: "#a855f7", boxShadow: "0 0 6px #a855f7", animation: "orbit3 5s linear infinite", opacity: 0.4 }} />
                    {/* Orbit ring */}
                    <div className="absolute" style={{ inset: -4, borderRadius: "50%", border: "1px solid rgba(0,229,160,.08)", animation: "breathe 3s ease infinite" }} />
                    <div className="flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.12)", boxShadow: "0 0 40px rgba(0,229,160,.1)" }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </div>
                  </div>
                  <p className="text-[17px] font-bold text-white mb-1.5">Upload your chart screenshot</p>
                  <p className="text-[13px] mb-2" style={{ color: "rgba(255,255,255,.45)" }}>Tap here to choose a file • PNG, JPG</p>
                  <p className="text-[10px] font-mono px-3 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.1)", color: "#00e5a0" }}>
                    <span style={{ animation: "breathe 2s ease infinite" }}>⚡</span> AI analyzes in under 10 seconds
                  </p>
                  <div className="flex gap-2 justify-center mt-5 flex-wrap">
                    {["MT4", "MT5", "TradingView", "cTrader"].map((p) => (
                      <span key={p} className="px-3 py-1 rounded-full text-[10px] font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.3)" }}>{p}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── BEGINNER GUIDANCE — What to upload ── */}
              <div className="mt-6 rounded-2xl p-5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "rgba(77,160,255,.1)" }}>
                    <span className="text-[10px]">💡</span>
                  </div>
                  <span className="text-[12px] font-bold text-white">New here? Here&apos;s what to upload:</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {/* DO upload */}
                  <div className="rounded-xl p-3.5" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.08)" }}>
                    <div className="text-[10px] font-mono font-bold mb-2.5" style={{ color: "#00e5a0" }}>✅ UPLOAD THIS</div>
                    <div className="flex flex-col gap-2">
                      {[
                        "A candlestick chart from your trading app",
                        "Any pair — XAUUSD, EURUSD, BTCUSD, etc.",
                        "Any timeframe — M15, H1, H4, Daily",
                        "Screenshot with candles visible",
                      ].map((t, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[9px] mt-0.5" style={{ color: "#00e5a0" }}>●</span>
                          <span className="text-[11px]" style={{ color: "rgba(255,255,255,.5)" }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* DON'T upload */}
                  <div className="rounded-xl p-3.5" style={{ background: "rgba(255,77,106,.04)", border: "1px solid rgba(255,77,106,.08)" }}>
                    <div className="text-[10px] font-mono font-bold mb-2.5" style={{ color: "#ff4d6a" }}>❌ NOT THIS</div>
                    <div className="flex flex-col gap-2">
                      {[
                        "Selfies, memes, or random photos",
                        "Screenshots of text or news articles",
                        "Blurry or cropped charts",
                        "Charts without candles (line charts are OK)",
                      ].map((t, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[9px] mt-0.5" style={{ color: "#ff4d6a" }}>●</span>
                          <span className="text-[11px]" style={{ color: "rgba(255,255,255,.5)" }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Quick tip */}
                <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(240,185,11,.04)", border: "1px solid rgba(240,185,11,.08)" }}>
                  <span className="text-[11px]">📱</span>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,.4)" }}>
                    <strong style={{ color: "rgba(255,255,255,.6)" }}>Pro tip:</strong> Open your chart full screen, then screenshot. The more candles AI can see, the better the analysis.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* PREVIEW */}
          {stage === "preview" && (
            <div className="max-w-[580px] w-full animate-scaleIn">
              <div className="glass overflow-hidden">
                <div className="relative" style={{ background: "#111" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={dataUrl || ""} alt="Chart" className="w-full block" style={{ maxHeight: 380, objectFit: "contain" }} />
                  <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-md text-[11px] font-mono" style={{ background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)", color: "rgba(255,255,255,.55)" }}>{fileName}</div>
                </div>
                {error && (
                  <div className="mx-4 mt-3 px-4 py-2.5 rounded-lg text-xs font-mono" style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.2)", color: "#ff4d6a" }}>⚠ {error}</div>
                )}
                <div className="flex gap-2.5 p-4">
                  <button onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.55)" }}>Cancel</button>
                  <button onClick={analyzeChart} className="flex-[2] py-3 rounded-xl text-sm font-bold cursor-pointer" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", color: "#050507", boxShadow: "0 4px 20px rgba(0,229,160,.3)" }}>⚡ Analyze & Annotate</button>
                </div>
              </div>
            </div>
          )}

          {/* ANALYZING */}
          {stage === "analyzing" && (
            <div className="max-w-[450px] w-full text-center animate-fadeUp">
              <div className="relative overflow-hidden" style={{ padding: "42px 32px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", backdropFilter: "blur(40px) saturate(1.5)", borderRadius: 28, boxShadow: "0 12px 40px rgba(0,0,0,.3), 0 0 80px rgba(0,229,160,.05)" }}>
                {/* Neural grid background */}
                <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,229,160,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,160,.04) 1px,transparent 1px)", backgroundSize: "24px 24px", animation: "gridPulse 3s ease infinite" }} />
                {/* Scanning beam */}
                <div className="absolute left-0 w-full" style={{ height: 2, background: "linear-gradient(90deg, transparent, #00e5a0, transparent)", boxShadow: "0 0 20px rgba(0,229,160,.5), 0 0 60px rgba(0,229,160,.2)", animation: "scanBeam 2.5s ease-in-out infinite", top: `${30 + Math.sin(progress * 0.1) * 20}%` }} />
                {/* Ambient glow */}
                <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 30%, rgba(0,229,160,.06) 0%, transparent 60%)" }} />
                <div className="relative">
                  <div className="relative mx-auto mb-6 flex items-center justify-center" style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(0,229,160,.08)", border: "2px solid rgba(0,229,160,.12)" }}>
                    <div className="absolute" style={{ inset: -5, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#00e5a0", animation: "rotate 1s linear infinite" }} />
                    <div className="absolute" style={{ inset: -10, borderRadius: "50%", border: "1.5px solid transparent", borderBottomColor: "#4da0ff", animation: "rotate 2s linear infinite reverse" }} />
                    <div className="absolute" style={{ inset: -16, borderRadius: "50%", border: "1px solid transparent", borderLeftColor: "#a855f7", animation: "rotate 3s linear infinite" }} />
                    {/* Orbit dots */}
                    <div className="absolute w-1.5 h-1.5 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 8px #00e5a0", animation: "orbit 2s linear infinite" }} />
                    <div className="absolute w-1 h-1 rounded-full" style={{ background: "#4da0ff", boxShadow: "0 0 6px #4da0ff", animation: "orbit2 3s linear infinite" }} />
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
                  </div>
                  <h2 className="text-xl font-extrabold text-white mb-1" style={{ textShadow: "0 0 40px rgba(0,229,160,.15)" }}>Synapse Processing</h2>
                  <p className="text-xs mb-6" style={{ color: "rgba(255,255,255,.45)" }}>Decoding structure, order flow & liquidity...</p>
                  <div className="w-full rounded-full overflow-hidden mb-5" style={{ height: 6, background: "rgba(255,255,255,.04)" }}>
                    <div className="h-full rounded-full transition-[width] duration-300" style={{ background: "linear-gradient(90deg,#00e5a0,#4da0ff,#a855f7)", backgroundSize: "200% 100%", animation: "gradientShift 2s ease infinite", width: `${Math.min(progress, 100)}%`, boxShadow: "0 0 20px rgba(0,229,160,.3)" }} />
                  </div>
                <div className="flex flex-col gap-1.5 items-start">
                  {STEPS.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 transition-opacity" style={{ opacity: progress >= s.t ? 1 : 0.3 }}>
                      <div className="flex items-center justify-center" style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${progress >= s.t + 16 ? "#00e5a0" : "rgba(255,255,255,.15)"}`, background: progress >= s.t + 16 ? "rgba(0,229,160,.15)" : "transparent" }}>
                        {progress >= s.t + 16 && <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <span className="text-[11px] font-mono" style={{ color: progress >= s.t ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.3)" }}>{s.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
          )}

          {/* RESULT */}
          {stage === "result" && A && (
            <div className="max-w-[1080px] w-full transition-all duration-600" style={{ opacity: showResult ? 1 : 0, transform: showResult ? "translateY(0)" : "translateY(20px)" }}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(0,229,160,.15)", border: "1px solid rgba(0,229,160,.2)" }}>
                    <span className="text-lg leading-none">{A.bias === "Long" ? "↑" : A.bias === "Short" ? "↓" : "→"}</span>
                    <div>
                      <div className="text-[17px] font-extrabold text-white" style={{ letterSpacing: "-.5px" }}>{A.pair}</div>
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{A.timeframe} • {A.bias.toUpperCase()} BIAS</span>
                    </div>
                  </div>
                  <div className="px-3 py-1 rounded-lg" style={{ background: cc(A.confidence) + "15", border: `1px solid ${cc(A.confidence)}30` }}>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: cc(A.confidence) }}>{A.confidence}%</span>
                  </div>
                </div>
                <div className="flex gap-1 items-center flex-wrap">
                  {(["split", "chart", "analysis"] as ViewMode[]).map((m) => (
                    <button key={m} onClick={() => setViewMode(m)} className="px-3 py-1 rounded-md text-[10px] font-semibold cursor-pointer transition-all"
                      style={{ border: `1px solid ${viewMode === m ? "rgba(0,229,160,.25)" : "rgba(255,255,255,.08)"}`, background: viewMode === m ? "rgba(0,229,160,.15)" : "rgba(255,255,255,.03)", color: viewMode === m ? "#00e5a0" : "rgba(255,255,255,.3)" }}>
                      {m === "split" ? "⬜ Split" : m === "chart" ? "📊 Chart" : "📋 Data"}
                    </button>
                  ))}
                  <button onClick={reset} className="px-3 py-1 rounded-md text-[10px] font-semibold cursor-pointer ml-1" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.55)" }}>+ New</button>
                </div>
              </div>

              <div className="result-layout flex gap-3" style={{ flexDirection: viewMode === "analysis" ? "column" : "row" }}>
                {viewMode !== "analysis" && (
                  <div className="result-chart glass overflow-hidden animate-fadeUp relative" style={{ width: viewMode === "chart" ? "100%" : "58%" }}>
                    <AnnotatedChart dataUrl={dataUrl} annotations={A.annotations} chartBounds={A.chart_bounds} isVisible={showResult} onClick={() => showFull ? setFullscreen(true) : setShowPaywall(true)} />
                    {/* Fullscreen locked badge for free users */}
                    {!showFull && (
                      <div className="absolute bottom-12 right-3 px-2 py-1 rounded-md cursor-pointer" onClick={() => setShowPaywall(true)} style={{ background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.08)" }}>
                        <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>🔒 Fullscreen — Pro</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between" style={{ padding: "9px 13px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>ANNOTATED BY FXSYNAPSE AI</span>
                      <div className="flex gap-1">
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,229,160,.15)", color: "#00e5a0" }}>S: {A.support}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,77,106,.1)", color: "#ff4d6a" }}>R: {A.resistance}</span>
                      </div>
                    </div>
                  </div>
                )}
                {viewMode !== "chart" && (
                  <div className="result-analysis flex flex-col gap-2.5 animate-slideInRight" style={{ width: viewMode === "analysis" ? "100%" : "42%" }}>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[{ l: "Trend", v: A.trend, c: "#00e5a0", free: true }, { l: "Structure", v: A.structure?.length > 20 ? (A.structure.split("/")[0]?.trim() + " / " + (A.structure.split("/")[1]?.trim() || "")) : A.structure, c: "#4da0ff", free: true },
                        ...(A.all_levels && A.all_levels.length > 0
                          ? A.all_levels.map((lv: any, idx: number) => ({ l: lv.type === "support" ? `Support ${idx + 1}` : `Resistance ${idx + 1}`, v: lv.price, c: lv.type === "support" ? "#00e5a0" : "#ff4d6a", free: false }))
                          : [{ l: "Support", v: A.support, c: "#00e5a0", free: false }, { l: "Resistance", v: A.resistance, c: "#ff4d6a", free: false }]
                        )
                      ].map((s, i) => (
                        <div key={i} className="stat-card relative overflow-hidden">
                          <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,.3)" }}>{s.l}</div>
                          {showFull || s.free ? (
                            <div className="text-sm font-bold" style={{ color: s.c }}>{s.v}</div>
                          ) : (
                            <div className="text-sm font-bold font-mono select-none" style={{ color: s.c, filter: "blur(10px)", userSelect: "none", pointerEvents: "none" }}>●●●●●●</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Unlock banner for free users */}
                    {!showFull && (
                      <>
                        <div onClick={() => setShowPaywall(true)} className="block rounded-xl text-center cursor-pointer transition-all hover:scale-[1.01]" style={{ padding: "12px 16px", background: "linear-gradient(135deg, rgba(0,229,160,.08), rgba(77,160,255,.06))", border: "1px solid rgba(0,229,160,.15)" }}>
                          <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "#00e5a0" }}>🔒 FULL ANALYSIS LOCKED</div>
                          <div className="text-xs font-bold text-white">Tap to unlock — Entry, TP, SL, R:R & AI insights</div>
                          <div className="flex gap-3 justify-center mt-2">
                            <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>5/day R79</span>
                            <span className="text-[10px] font-mono font-bold" style={{ color: "#00e5a0" }}>15/day R199</span>
                            <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>50/day R349</span>
                          </div>
                        </div>
                        {/* Affiliate banner */}
                        <a href="/affiliate" className="block rounded-xl text-center no-underline transition-all hover:scale-[1.01]" style={{ padding: "10px 16px", background: "rgba(240,185,11,.04)", border: "1px solid rgba(240,185,11,.1)" }}>
                          <div className="text-[11px] font-bold mb-0.5" style={{ color: "#f0b90b" }}>💰 Become an Affiliate — Earn 20% Recurring</div>
                          <div className="text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>Share FXSynapse with your network &amp; earn on every subscription</div>
                        </a>
                      </>
                    )}

                    <div className="glass overflow-hidden flex-1 relative">
                      <div className="flex" style={{ borderBottom: "1px solid rgba(255,255,255,.05)", padding: "0 13px" }}>
                        {(["overview", "indicators"] as const).map((t) => (
                          <button key={t} onClick={() => setActiveTab(t)} className="py-2.5 px-3 text-[11px] font-semibold capitalize cursor-pointer" style={{ background: "none", border: "none", color: activeTab === t ? "#00e5a0" : "rgba(255,255,255,.3)", borderBottom: activeTab === t ? "2px solid #00e5a0" : "2px solid transparent" }}>{t}</button>
                        ))}
                      </div>

                      {/* Blur overlay for non-paid users — TOTAL blackout, nothing readable */}
                      {!showFull && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center" style={{ top: 0, backdropFilter: "blur(28px) saturate(0.1) brightness(0.3)", WebkitBackdropFilter: "blur(28px) saturate(0.1) brightness(0.3)", background: "rgba(10,11,16,.92)" }}>
                          {/* Extra noise layer to kill any remaining readability */}
                          <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(0deg, rgba(10,11,16,.3) 0px, transparent 1px, transparent 2px)", opacity: 0.8 }} />
                          <div className="relative z-10 flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(0,229,160,.1)", border: "2px solid rgba(0,229,160,.2)", boxShadow: "0 0 30px rgba(0,229,160,.1)" }}>
                              <span className="text-xl">🔒</span>
                            </div>
                            <div className="text-sm font-bold text-white mb-1">Unlock Full Analysis</div>
                            <div className="text-[10px] mb-1 text-center px-4" style={{ color: "rgba(255,255,255,.5)" }}>See the exact trade setup AI found for you</div>
                            <div className="flex gap-1.5 mb-3 flex-wrap justify-center">
                              {["Entry Price", "TP & SL", "R:R Ratio", "Confluences", "AI Insights"].map(f => (
                                <span key={f} className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,229,160,.06)", color: "#00e5a0", border: "1px solid rgba(0,229,160,.08)" }}>{f}</span>
                              ))}
                            </div>
                            <button onClick={() => setShowPaywall(true)} className="px-6 py-2.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all hover:scale-105" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", border: "none", boxShadow: "0 4px 20px rgba(0,229,160,.3)" }}>View Plans — from R79/mo</button>
                          </div>
                        </div>
                      )}
                      <div style={{ padding: 13 }}>
                        {activeTab === "overview" && (
                          <div className="flex flex-col gap-2.5">
                            <div>
                              <div className="flex justify-between mb-1.5">
                                <span className="text-[11px]" style={{ color: "rgba(255,255,255,.55)" }}>Confidence</span>
                                <span className="text-xs font-bold font-mono" style={{ color: cc(A.confidence) }}>{A.confidence}%</span>
                              </div>
                              <div className="w-full rounded-full" style={{ height: 5, background: "rgba(255,255,255,.05)" }}>
                                <div className="h-full rounded-full" style={{ width: `${A.confidence}%`, background: `linear-gradient(90deg,${cc(A.confidence)},${cc(A.confidence)}aa)`, boxShadow: `0 0 12px ${cc(A.confidence)}40` }} />
                              </div>
                            </div>
                            <div className="rounded-lg" style={{ padding: "11px 13px", background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }}>
                              <div className="text-[9px] font-mono uppercase tracking-[1.5px] mb-1.5" style={{ color: "#00e5a0" }}>⚡ AI ANALYSIS</div>
                              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,.55)" }}>{A.notes}</p>
                            </div>
                            <div className="rounded-lg relative" style={{ padding: "11px 13px", background: "rgba(77,160,255,.04)", border: "1px solid rgba(77,160,255,.1)" }}>
                              <div className="text-[9px] font-mono uppercase tracking-[1.5px] mb-1.5" style={{ color: "#4da0ff" }}>🎯 TRADE SETUP</div>
                              <div className="flex flex-col gap-1">
                                {[{ l: "Entry", v: A.entry_price || A.entry_zone || "—", c: "#00e5a0" }, { l: "Take Profit", v: A.take_profit || "—", c: "#4da0ff" }, { l: "Stop Loss", v: A.stop_loss || "—", c: "#ff4d6a" }, { l: "Risk:Reward", v: A.risk_reward || "—", c: "#f0b90b" }].map((r, i) => (
                                  <div key={i} className="flex justify-between">
                                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{r.l}</span>
                                    <span className="text-[11px] font-semibold font-mono" style={{ color: r.c }}>{r.v}</span>
                                  </div>
                                ))}
                                {A.setup_grade && (
                                  <div className="flex justify-between mt-1 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
                                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Setup Grade</span>
                                    <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded" style={{
                                      background: A.setup_grade === "A" ? "rgba(0,229,160,.15)" : A.setup_grade === "B" ? "rgba(77,160,255,.15)" : A.setup_grade === "C" ? "rgba(240,185,11,.15)" : "rgba(255,77,106,.15)",
                                      color: A.setup_grade === "A" ? "#00e5a0" : A.setup_grade === "B" ? "#4da0ff" : A.setup_grade === "C" ? "#f0b90b" : "#ff4d6a",
                                    }}>Grade {A.setup_grade}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {A.confluences && A.confluences.length > 0 && (
                              <div className="rounded-lg" style={{ padding: "11px 13px", background: "rgba(240,185,11,.04)", border: "1px solid rgba(240,185,11,.1)" }}>
                                <div className="text-[9px] font-mono uppercase tracking-[1.5px] mb-1.5" style={{ color: "#f0b90b" }}>⚡ CONFLUENCES ({A.confluences.length}/5)</div>
                                <div className="flex flex-wrap gap-1">
                                  {A.confluences.map((cf: string, ci: number) => (
                                    <span key={ci} className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(240,185,11,.08)", color: "#f0b90b", border: "1px solid rgba(240,185,11,.12)" }}>✓ {cf}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {A.patterns && A.patterns.length > 0 && (
                              <div className="rounded-lg" style={{ padding: "11px 13px", background: "rgba(156,106,222,.04)", border: "1px solid rgba(156,106,222,.1)" }}>
                                <div className="text-[9px] font-mono uppercase tracking-[1.5px] mb-1.5" style={{ color: "#9b6ade" }}>🔍 PATTERNS DETECTED</div>
                                <div className="flex flex-col gap-1">
                                  {(A.patterns as any[]).map((pt: any, pi: number) => (
                                    <div key={pi} className="flex items-center justify-between">
                                      <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,.6)" }}>{pt.name}</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{pt.location || pt.price}</span>
                                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                                          background: pt.significance === "high" ? "rgba(0,229,160,.1)" : pt.significance === "medium" ? "rgba(240,185,11,.1)" : "rgba(255,255,255,.05)",
                                          color: pt.significance === "high" ? "#00e5a0" : pt.significance === "medium" ? "#f0b90b" : "rgba(255,255,255,.4)",
                                        }}>{pt.significance}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Smart Money Concepts */}
                            {A.order_blocks && A.order_blocks.length > 0 && (
                              <div className="rounded-lg" style={{ padding: "11px 13px", background: "rgba(240,185,11,.04)", border: "1px solid rgba(240,185,11,.1)" }}>
                                <div className="text-[9px] font-mono uppercase tracking-[1.5px] mb-1.5" style={{ color: "#f0b90b" }}>📦 ORDER BLOCKS</div>
                                <div className="flex flex-col gap-1">
                                  {(A.order_blocks as any[]).map((ob: any, oi: number) => (
                                    <div key={oi} className="flex items-center justify-between">
                                      <span className="text-[10px] font-semibold" style={{ color: ob.type === "bullish_ob" ? "#00e5a0" : "#ff4d6a" }}>
                                        {ob.type === "bullish_ob" ? "▲ Bullish OB" : "▼ Bearish OB"}
                                      </span>
                                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{ob.high} — {ob.low}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {A.fvgs && A.fvgs.length > 0 && (
                              <div className="rounded-lg" style={{ padding: "11px 13px", background: "rgba(77,160,255,.04)", border: "1px solid rgba(77,160,255,.1)" }}>
                                <div className="text-[9px] font-mono uppercase tracking-[1.5px] mb-1.5" style={{ color: "#4da0ff" }}>⚡ FAIR VALUE GAPS</div>
                                <div className="flex flex-col gap-1">
                                  {(A.fvgs as any[]).map((fvg: any, fi: number) => (
                                    <div key={fi} className="flex items-center justify-between">
                                      <span className="text-[10px] font-semibold" style={{ color: fvg.type === "bullish" ? "#00e5a0" : "#ff4d6a" }}>
                                        {fvg.type === "bullish" ? "▲ Bullish FVG" : "▼ Bearish FVG"}
                                      </span>
                                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{fvg.high} — {fvg.low}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {A.liquidity_levels && A.liquidity_levels.length > 0 && (
                              <div className="rounded-lg" style={{ padding: "11px 13px", background: "rgba(240,185,11,.04)", border: "1px solid rgba(240,185,11,.08)" }}>
                                <div className="text-[9px] font-mono uppercase tracking-[1.5px] mb-1.5" style={{ color: "#f0b90b" }}>💧 LIQUIDITY POOLS</div>
                                <div className="flex flex-col gap-1">
                                  {(A.liquidity_levels as any[]).map((liq: any, li: number) => (
                                    <div key={li} className="flex items-center justify-between">
                                      <span className="text-[10px] font-semibold" style={{ color: liq.type === "buy_side" ? "#ff4d6a" : "#00e5a0" }}>
                                        {liq.type === "buy_side" ? "🔺 Buy-side" : "🔻 Sell-side"} @ {liq.price}
                                      </span>
                                      {liq.description && <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{liq.description}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {activeTab === "indicators" && (
                          <div className="flex flex-col gap-2.5">
                            {A.rsi !== null && (
                              <div className="rounded-lg" style={{ padding: "10px 11px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                                <div className="flex justify-between mb-1.5">
                                  <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>RSI (14)</span>
                                  <span className="text-xs font-bold font-mono" style={{ color: "#f0b90b" }}>{A.rsi}</span>
                                </div>
                                <div className="w-full rounded-full relative" style={{ height: 4, background: "rgba(255,255,255,.05)" }}>
                                  <div className="absolute rounded-full" style={{ left: "30%", top: 0, bottom: 0, width: "40%", background: "rgba(0,229,160,.08)" }} />
                                  <div className="absolute rounded-full" style={{ left: `${A.rsi}%`, top: "50%", transform: "translate(-50%,-50%)", width: 8, height: 8, background: "#f0b90b", border: "2px solid #0a0b0f" }} />
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Oversold</span>
                                  {A.rsi_signal && A.rsi_signal !== "neutral" && (
                                    <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded" style={{
                                      background: A.rsi_signal.includes("bullish") ? "rgba(0,229,160,.1)" : A.rsi_signal.includes("bearish") ? "rgba(255,77,106,.1)" : A.rsi_signal === "overbought" ? "rgba(255,77,106,.1)" : "rgba(0,229,160,.1)",
                                      color: A.rsi_signal.includes("bullish") || A.rsi_signal === "oversold" ? "#00e5a0" : "#ff4d6a",
                                    }}>{A.rsi_signal.replace(/_/g, " ").toUpperCase()}</span>
                                  )}
                                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Overbought</span>
                                </div>
                              </div>
                            )}
                            {[{ l: "EMA Status", v: A.ema_status, c: "#00e5a0" }, { l: "Volume", v: A.volume, c: "#4da0ff" }, { l: "Structure", v: A.structure, c: "#fff" }].map((x, i) => (
                              <div key={i} className="flex justify-between items-center rounded-lg" style={{ padding: "8px 11px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{x.l}</span>
                                <span className="text-[10px] font-semibold text-right" style={{ color: x.c, maxWidth: "55%" }}>{x.v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Rating + Broker CTA */}
              <div className="mt-4 flex flex-col gap-3">
                {/* Star Rating */}
                <div className="glass" style={{ padding: "16px 20px" }}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-white mb-1">
                        {ratingSubmitted ? "Thanks for your feedback!" : "How was this analysis?"}
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>
                        {ratingSubmitted ? `You rated ${rating}/5 stars` : "Your rating helps us improve"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => !ratingSubmitted && submitRating(star)}
                          onMouseEnter={() => !ratingSubmitted && setRatingHover(star)}
                          onMouseLeave={() => !ratingSubmitted && setRatingHover(0)}
                          className="text-[22px] cursor-pointer transition-transform hover:scale-110"
                          style={{
                            background: "none", border: "none", padding: "2px",
                            filter: (ratingHover || rating) >= star ? "none" : "grayscale(1) opacity(0.3)",
                            transform: (ratingHover || rating) >= star ? "scale(1.1)" : "scale(1)",
                          }}
                          disabled={ratingSubmitted}
                        >
                          ⭐
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Broker CTA */}
                <a href={BROKER_LINK} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("broker_click", "post_scan")} className="block no-underline group">
                  <div className="rounded-xl overflow-hidden transition-all" style={{ background: "linear-gradient(135deg, rgba(240,185,11,.06), rgba(0,229,160,.04))", border: "1px solid rgba(240,185,11,.12)" }}>
                    <div className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(240,185,11,.12)", border: "1px solid rgba(240,185,11,.2)" }}>
                          <span className="text-base">📊</span>
                        </div>
                        <div>
                          <div className="text-[12px] font-semibold text-white">Ready to execute this trade?</div>
                          <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>Open a live account with our recommended broker</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: "linear-gradient(135deg, #f0b90b, #e6a800)", color: "#050507" }}>
                          Start Trading →
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              </div>

              <div className="text-center mt-3">
                <p className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>FXSynapse AI provides analysis for educational purposes only. Not financial advice.</p>
              </div>
            </div>
          )}
        </main>
      </>)}
      </div>

      {/* Fullscreen */}
      {fullscreen && A && dataUrl && <FullscreenModal dataUrl={dataUrl} annotations={A.annotations} analysis={A} onClose={() => setFullscreen(false)} />}

      {/* Paywall */}
      {showPaywall && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.88)", backdropFilter: "blur(20px)" }} onClick={() => showFull ? setShowPaywall(false) : null}>
          <div className="max-w-[440px] w-full rounded-3xl p-6 text-center" onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,21,30,.95)", border: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(60px) saturate(1.6)", boxShadow: "0 25px 60px rgba(0,0,0,.5)", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(0,229,160,.1)", border: "2px solid rgba(0,229,160,.2)" }}>
              <span className="text-2xl">{!showFull ? "🔒" : "🚀"}</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">
              {!showFull ? "Your Analysis is Ready" : "Scans Used Up"}
            </h3>
            <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,.45)" }}>
              {!showFull
                ? "Your AI analysis is ready — subscribe to see the exact entry, take profit, stop loss, and risk:reward ratio."
                : "All monthly scans used. Upgrade or grab a top-up pack to keep scanning."}
            </p>
            {!showFull && (
              <div className="flex gap-1.5 justify-center mb-3 mt-2 flex-wrap">
                {["Entry Price", "TP / SL", "R:R Ratio", "AI Insights"].map((f, i) => (
                  <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(0,229,160,.08)", color: "#00e5a0", border: "1px solid rgba(0,229,160,.1)" }}>{f}</span>
                ))}
              </div>
            )}

            {/* ── INLINE PRICING — New 5-tier plans ── */}
            <div className="flex flex-col gap-2.5 mt-4">
              {[
                {
                  name: "Basic", price: "R79", scans: "5 scans/day",
                  href: "/pricing?plan=basic", popular: false,
                  tagline: "Get started",
                  perks: ["5 AI chart scans/day", "Grade B & C signal details", "15 AI chat messages/day"],
                  color: "#4da0ff",
                },
                {
                  name: "Starter", price: "R199", scans: "15 scans/day",
                  href: "/pricing?plan=starter", popular: true,
                  tagline: "Serious trader",
                  perks: ["15 AI chart scans/day", "All signals + Grade A (15m delay)", "AI reasoning on signals"],
                  color: "#00e5a0",
                },
                {
                  name: "Pro", price: "R349", scans: "50 scans/day",
                  href: "/pricing?plan=pro", popular: false,
                  tagline: "Active trader",
                  perks: ["50 scans + All signals instant", "Full smart money + Voice assistant", "AI Fundamentals + Track record"],
                  color: "#f59e0b",
                },
                {
                  name: "Unlimited", price: "R499", scans: "Unlimited",
                  href: "/pricing?plan=unlimited", popular: false,
                  tagline: "Full power",
                  perks: ["Unlimited everything", "Priority signal delivery", "Trade journal + Early access"],
                  color: "#a855f7",
                },
              ].map((plan) => (
                <Link key={plan.name} href={plan.href} className="w-full no-underline block rounded-2xl px-4 py-3.5 text-left transition-all hover:scale-[1.02] relative" style={{
                  background: plan.popular ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)",
                  border: `1px solid ${plan.popular ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
                }}>
                  {plan.popular && (
                    <div className="absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[8px] font-bold font-mono" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507" }}>POPULAR</div>
                  )}
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <div className="text-[13px] font-bold text-white">{plan.name}</div>
                      <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{plan.tagline}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[18px] font-extrabold" style={{ color: plan.color }}>{plan.price}</div>
                      <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>/month</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {plan.perks.map((perk, pi) => (
                      <div key={pi} className="flex items-center gap-1.5">
                        <span className="text-[8px]" style={{ color: plan.color }}>✓</span>
                        <span className="text-[9px]" style={{ color: "rgba(255,255,255,.45)" }}>{perk}</span>
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>

            {/* Top-up option */}
            <Link href="/pricing?topup=1" className="w-full mt-2 py-2.5 rounded-xl text-[11px] font-semibold no-underline text-center block" style={{ background: "rgba(77,160,255,.06)", border: "1px solid rgba(77,160,255,.12)", color: "#4da0ff" }}>
              Or buy a scan pack — from R49
            </Link>

            {/* FOMO element */}
            <div className="mt-3 flex items-center justify-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(240,185,11,.04)", border: "1px solid rgba(240,185,11,.06)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#f0b90b", animation: "pulse 2s infinite" }} />
              <span className="text-[9px] font-mono" style={{ color: "rgba(240,185,11,.7)" }}>
                {Math.floor(Math.random() * 8) + 12} traders subscribed today
              </span>
            </div>

            {/* Close / dismiss */}
            <div className="mt-3">
              {showFull && (
                <button onClick={() => setShowPaywall(false)} className="w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.3)" }}>Close</button>
              )}
              {!showFull && (
                <button onClick={() => setShowPaywall(false)} className="w-full py-2 text-[10px] cursor-pointer" style={{ background: "none", border: "none", color: "rgba(255,255,255,.12)" }}>continue with limited view</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Smart Broker Popup */}
      {showBrokerPopup && (
        <div className="fixed inset-0 z-[9997] flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,.65)", backdropFilter: "blur(20px)" }} onClick={() => setShowBrokerPopup(false)}>
          <div
            className="w-full sm:max-w-[400px] mx-0 sm:mx-4 rounded-t-3xl sm:rounded-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(20,21,30,.85)",
              border: "1px solid rgba(255,255,255,.08)",
              backdropFilter: "blur(60px) saturate(1.6)",
              boxShadow: "0 -20px 60px rgba(0,0,0,.5), 0 0 40px rgba(240,185,11,.05)",
              animation: "slideUp 0.4s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            {/* Gradient header */}
            <div className="relative px-5 pt-5 pb-4" style={{ background: "linear-gradient(135deg, rgba(240,185,11,.08), rgba(0,229,160,.05))" }}>
              <button onClick={() => setShowBrokerPopup(false)} className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", color: "rgba(255,255,255,.4)", fontSize: 13 }}>✕</button>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f0b90b, #e6a800)", boxShadow: "0 4px 15px rgba(240,185,11,.3)" }}>
                  <span className="text-xl">📈</span>
                </div>
                <div>
                  <div className="text-[14px] font-bold text-white">Recommended Broker</div>
                  <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>Trusted • Regulated • Fast Execution</div>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5">
              <div className="flex flex-col gap-2 mb-4 mt-3">
                {[
                  { icon: "⚡", text: "Instant deposits & withdrawals" },
                  { icon: "📊", text: "Trade Forex, Synthetics & Crypto" },
                  { icon: "🎯", text: "Tight spreads from 0.0 pips" },
                  { icon: "🔒", text: "Regulated & secure platform" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="text-sm">{item.icon}</span>
                    <span className="text-[12px]" style={{ color: "rgba(255,255,255,.6)" }}>{item.text}</span>
                  </div>
                ))}
              </div>

              <a
                href={BROKER_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-xl text-sm font-bold no-underline text-center transition-all"
                style={{ background: "linear-gradient(135deg, #f0b90b, #e6a800)", color: "#050507", boxShadow: "0 4px 20px rgba(240,185,11,.25)" }}
                onClick={() => { trackEvent("broker_click", "dashboard_popup"); setShowBrokerPopup(false); }}
              >
                Open Trading Account →
              </a>
              <button
                onClick={() => setShowBrokerPopup(false)}
                className="w-full py-2.5 mt-2 text-[11px] font-mono cursor-pointer"
                style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)" }}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* First-time Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{ background: "rgba(0,0,0,.85)", backdropFilter: "blur(24px)" }}>
          <div className="max-w-[420px] w-full mx-4 rounded-3xl overflow-hidden" style={{ background: "rgba(20,21,30,.92)", border: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(60px) saturate(1.6)", boxShadow: "0 25px 80px rgba(0,0,0,.5)", animation: "gSU .5s cubic-bezier(.16,1,.3,1)" }}>
            <div className="px-6 pt-7 pb-4 text-center" style={{ background: "linear-gradient(180deg,rgba(0,229,160,.06),transparent)" }}>
              <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 8px 30px rgba(0,229,160,.3)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <h2 className="text-[22px] font-extrabold text-white mb-1.5" style={{ letterSpacing: "-.5px" }}>
                Welcome to FXSynapse AI! 👋
              </h2>
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,.45)" }}>
                Here&apos;s how it works — 3 simple steps
              </p>
            </div>
            <div className="px-6 pb-2">
              <div className="flex flex-col gap-3">
                {[
                  { emoji: "📸", title: "Screenshot your chart", desc: "Open MT4, MT5, TradingView, or any trading app. Go fullscreen on any chart and take a screenshot.", color: "#4da0ff" },
                  { emoji: "📤", title: "Upload it here", desc: "Drop the screenshot into the upload box. Any pair works — Gold, EUR/USD, BTC, Volatility, Boom/Crash — anything.", color: "#00e5a0" },
                  { emoji: "🎯", title: "Get your trade levels", desc: "In 10 seconds, AI draws entry, take profit, and stop loss on your chart. Plus a buy/sell signal with confidence %.", color: "#f0b90b" },
                ].map((step, i) => (
                  <div key={i} className="flex gap-3 items-start rounded-xl p-3" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm" style={{ background: `${step.color}12`, border: `1px solid ${step.color}20` }}>
                      {step.emoji}
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-white">{step.title}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,.4)", lineHeight: 1.5 }}>{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-3">
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,77,106,.04)", border: "1px solid rgba(255,77,106,.08)" }}>
                <span className="text-[11px]">⚠️</span>
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,.4)" }}>
                  Only upload <strong style={{ color: "#ff4d6a" }}>trading charts with candles</strong>. Selfies, memes, and random images won&apos;t work.
                </span>
              </div>
            </div>
            <div className="px-6 pb-6 pt-2">
              <button
                onClick={() => { setShowOnboarding(false); localStorage.setItem("fxs_onboarded", "1"); }}
                className="w-full py-3.5 rounded-2xl text-[14px] font-bold cursor-pointer transition-all hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", color: "#050507", boxShadow: "0 6px 25px rgba(0,229,160,.3)" }}
              >
                Got it — Let me scan! 📸
              </button>
              <p className="text-center text-[10px] font-mono mt-3" style={{ color: "rgba(255,255,255,.2)" }}>You have 1 free scan to try</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
