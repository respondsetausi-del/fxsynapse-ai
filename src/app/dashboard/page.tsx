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
import Link from "next/link";

const PX = Array.from({ length: 25 }, (_, i) => ({
  id: i, x: Math.random() * 100, y: Math.random() * 100,
  s: Math.random() * 2.5 + 1, d: Math.random() * 20 + 12, dl: Math.random() * 8,
}));

const STEPS = [
  { l: "Extracting chart data", t: 0 }, { l: "Detecting key levels", t: 18 },
  { l: "Mapping S/R zones", t: 36 }, { l: "Annotating chart", t: 56 },
  { l: "Generating intelligence", t: 78 },
];

interface UserProfile {
  id: string; email: string; full_name: string; role: string;
  plan_id: string; credits_balance: number; avatar_url: string;
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
  const [dashView, setDashView] = useState<"scanner" | "fundamentals" | "markets">("scanner");
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
  const fileRef = useRef<HTMLInputElement>(null);
  const fileObjRef = useRef<File | null>(null);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      const res = await fetch("/api/user");
      if (res.ok) {
        const data = await res.json();
        setUser(data.profile);
        setCredits(data.credits);
      }
    })();
  }, [supabase]);

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
      const formData = new FormData();
      formData.append("image", fileObjRef.current);
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (res.status === 402) { clearInterval(iv); setShowPaywall(true); setStage("preview"); return; }
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      clearInterval(iv); setProgress(100);
      if (data.credits) setCredits((prev) => prev ? { ...prev, ...data.credits } : prev);
      setTimeout(() => { setAnalysis(data.analysis); setStage("result"); setTimeout(() => setShowResult(true), 100); }, 500);
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
    fileObjRef.current = null;
  };

  const cc = (v: number) => (v >= 75 ? "#00e5a0" : v >= 50 ? "#f0b90b" : "#ff4d6a");
  const A = analysis;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#0a0b0f" }}>
      {/* BG */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.07) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ bottom: "-20%", right: "-10%", width: 450, height: 450, background: "radial-gradient(circle,rgba(77,160,255,.05) 0%,transparent 70%)", filter: "blur(80px)" }} />
        {PX.map((p) => (
          <div key={p.id} className="absolute rounded-full" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, background: p.id % 3 === 0 ? "#00e5a0" : "#4da0ff", animation: `float ${p.d}s ${p.dl}s infinite ease-in-out` }} />
        ))}
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
      </div>

      {/* Sidebar */}
      <Sidebar user={user} credits={credits} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-[1] min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between" style={{ padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1 cursor-pointer p-1.5 rounded-lg" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div style={{ width: 16, height: 2, background: "rgba(255,255,255,.5)", borderRadius: 1 }} />
              <div style={{ width: 16, height: 2, background: "rgba(255,255,255,.5)", borderRadius: 1 }} />
              <div style={{ width: 16, height: 2, background: "rgba(255,255,255,.5)", borderRadius: 1 }} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 18px rgba(0,229,160,.25)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div>
                <div className="text-[17px] font-bold text-white" style={{ letterSpacing: "-.5px" }}>FXSynapse<span className="font-extrabold" style={{ color: "#00e5a0" }}> AI</span></div>
                <div className="text-[9px] uppercase tracking-[1.5px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Chart Intelligence Engine</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Credit badge */}
            {user && credits && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(77,160,255,.1)", border: "1px solid rgba(77,160,255,.15)" }}>
                <span className="text-[10px] font-mono font-medium" style={{ color: "#4da0ff" }}>
                  {credits.dailyRemaining === -1 ? "∞" : credits.dailyRemaining} scans
                </span>
                {credits.creditsBalance > 0 && (
                  <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>+ {credits.creditsBalance} cr</span>
                )}
              </div>
            )}
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
            {/* Plan badge */}
            {user && (
              <Link href="/pricing" className="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold no-underline" style={{
                background: user.plan_id === "premium" ? "rgba(240,185,11,.12)" : user.plan_id === "pro" ? "rgba(0,229,160,.12)" : "rgba(255,255,255,.04)",
                border: `1px solid ${user.plan_id === "premium" ? "rgba(240,185,11,.2)" : user.plan_id === "pro" ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
                color: user.plan_id === "premium" ? "#f0b90b" : user.plan_id === "pro" ? "#00e5a0" : "rgba(255,255,255,.4)",
              }}>
                {user.plans?.name || "Free"}
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
        <div className="flex items-center gap-1 mx-4 mt-2 p-1 rounded-xl" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
          {([
            { id: "scanner", label: "📸 Chart Scanner", color: "#00e5a0" },
            { id: "fundamentals", label: "📊 AI Fundamentals", color: "#f0b90b" },
            { id: "markets", label: "📈 Live Markets", color: "#3b82f6" },
          ] as const).map(v => (
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

        {/* ── AI FUNDAMENTALS VIEW ── */}
        {dashView === "fundamentals" && (
          <div className="px-4 py-4">
            <AIFundamentals userPlan={user?.plan_id || "free"} userRole={user?.role || ""} />
          </div>
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
          <div className="mx-4 mt-2 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap" style={{ background: "linear-gradient(135deg, rgba(0,229,160,.08), rgba(77,160,255,.06))", border: "1px solid rgba(0,229,160,.15)" }}>
            <div className="flex items-center gap-2">
              <span className="text-sm">⚡</span>
              <div>
                <span className="text-[11px] font-semibold text-white">Unlock full trade setups, confluence grading & unlimited history</span>
                <span className="text-[10px] ml-2 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>Pro from R99/mo</span>
              </div>
            </div>
            <Link href="/pricing" className="px-3 py-1.5 rounded-lg text-[10px] font-bold no-underline whitespace-nowrap" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
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
                <h1 className="font-extrabold text-white leading-[1.15] mb-2.5" style={{ fontSize: "clamp(24px,5vw,36px)", letterSpacing: "-1px" }}>
                  Scan any chart.<br />
                  <span style={{ background: "linear-gradient(90deg,#00e5a0,#4da0ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    Get annotated intelligence.
                  </span>
                </h1>
                <p className="text-sm max-w-[400px] mx-auto" style={{ color: "rgba(255,255,255,.55)" }}>
                  Upload a forex chart screenshot — FXSynapse AI annotates your chart with key levels, zones, and trade setups.
                </p>
                {user?.plan_id === "free" && credits && (
                  <p className="text-[10px] font-mono mt-2" style={{ color: credits.dailyRemaining > 0 ? "rgba(0,229,160,.6)" : "rgba(255,77,106,.6)" }}>
                    {credits.dailyRemaining > 0 ? `${credits.dailyRemaining} free scan remaining today` : "No scans remaining — resets at midnight"}
                  </p>
                )}
              </div>
              <div className="glass text-center cursor-pointer transition-all" style={{ padding: "50px 34px", borderColor: isDrag ? "#00e5a0" : undefined, background: isDrag ? "rgba(0,229,160,.15)" : undefined }}
                onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }} onDragLeave={() => setIsDrag(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <div className="mx-auto mb-4 flex items-center justify-center" style={{ width: 62, height: 62, borderRadius: 15, background: "rgba(0,229,160,.15)", border: "1px solid rgba(0,229,160,.15)" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <p className="text-[15px] font-semibold text-white mb-1">Drop your chart screenshot here</p>
                <p className="text-[13px]" style={{ color: "rgba(255,255,255,.55)" }}>or click to browse • PNG, JPG</p>
                <div className="flex gap-1.5 justify-center mt-4 flex-wrap">
                  {["MT4", "MT5", "TradingView", "cTrader"].map((p) => (
                    <span key={p} className="px-2.5 py-0.5 rounded-full text-[10px] font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.3)" }}>{p}</span>
                  ))}
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
                  <button onClick={analyzeChart} className="flex-[2] py-3 rounded-xl text-sm font-bold cursor-pointer" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", color: "#0a0b0f", boxShadow: "0 4px 20px rgba(0,229,160,.3)" }}>⚡ Analyze & Annotate</button>
                </div>
              </div>
            </div>
          )}

          {/* ANALYZING */}
          {stage === "analyzing" && (
            <div className="max-w-[450px] w-full text-center animate-fadeUp">
              <div className="glass" style={{ padding: "38px 30px" }}>
                <div className="relative mx-auto mb-5 flex items-center justify-center" style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(0,229,160,.15)", border: "2px solid rgba(0,229,160,.15)" }}>
                  <div className="absolute" style={{ inset: -4, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#00e5a0", animation: "rotate 1.2s linear infinite" }} />
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <h2 className="text-lg font-bold text-white mb-1">Synapse Processing</h2>
                <p className="text-xs mb-5" style={{ color: "rgba(255,255,255,.55)" }}>Annotating chart & decoding structure...</p>
                <div className="w-full rounded-full overflow-hidden mb-4" style={{ height: 5, background: "rgba(255,255,255,.05)" }}>
                  <div className="h-full rounded-full transition-[width] duration-300" style={{ background: "linear-gradient(90deg,#00e5a0,#4da0ff)", width: `${Math.min(progress, 100)}%`, animation: "progressPulse 2s infinite" }} />
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
                  <div className="result-chart glass overflow-hidden animate-fadeUp" style={{ width: viewMode === "chart" ? "100%" : "58%" }}>
                    <AnnotatedChart dataUrl={dataUrl} annotations={A.annotations} chartBounds={A.chart_bounds} isVisible={showResult} onClick={() => setFullscreen(true)} />
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
                      {[{ l: "Trend", v: A.trend, c: "#00e5a0" }, { l: "Structure", v: A.structure?.length > 20 ? (A.structure.split("/")[0]?.trim() + " / " + (A.structure.split("/")[1]?.trim() || "")) : A.structure, c: "#4da0ff" }, { l: "Support", v: A.support, c: "#00e5a0" }, { l: "Resistance", v: A.resistance, c: "#ff4d6a" }].map((s, i) => (
                        <div key={i} className="stat-card">
                          <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,.3)" }}>{s.l}</div>
                          <div className="text-sm font-bold" style={{ color: s.c }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="glass overflow-hidden flex-1">
                      <div className="flex" style={{ borderBottom: "1px solid rgba(255,255,255,.05)", padding: "0 13px" }}>
                        {(["overview", "indicators"] as const).map((t) => (
                          <button key={t} onClick={() => setActiveTab(t)} className="py-2.5 px-3 text-[11px] font-semibold capitalize cursor-pointer" style={{ background: "none", border: "none", color: activeTab === t ? "#00e5a0" : "rgba(255,255,255,.3)", borderBottom: activeTab === t ? "2px solid #00e5a0" : "2px solid transparent" }}>{t}</button>
                        ))}
                      </div>
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
                              {user?.plan_id === "free" ? (
                                <div className="text-center py-3">
                                  <div className="text-lg mb-1">🔒</div>
                                  <div className="text-[11px] font-semibold text-white mb-1">Upgrade to unlock trade setups</div>
                                  <div className="text-[10px] mb-2" style={{ color: "rgba(255,255,255,.35)" }}>Entry, TP, SL & Risk:Reward</div>
                                  <Link href="/pricing" className="inline-block px-4 py-1.5 rounded-lg text-[10px] font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
                                    Unlock Pro — R99/mo
                                  </Link>
                                </div>
                              ) : (
                              <div className="flex flex-col gap-1">
                                {[{ l: "Entry Zone", v: A.entry_zone || "—", c: "#00e5a0" }, { l: "Take Profit", v: A.take_profit || "—", c: "#4da0ff" }, { l: "Stop Loss", v: A.stop_loss || "—", c: "#ff4d6a" }, { l: "Risk:Reward", v: A.risk_reward || "—", c: "#f0b90b" }].map((r, i) => (
                                  <div key={i} className="flex justify-between">
                                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{r.l}</span>
                                    <span className="text-[11px] font-semibold font-mono" style={{ color: r.c }}>{r.v}</span>
                                  </div>
                                ))}
                              </div>
                              )}
                            </div>
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
                        <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: "linear-gradient(135deg, #f0b90b, #e6a800)", color: "#0a0b0f" }}>
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
        <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: "rgba(0,0,0,.85)", backdropFilter: "blur(15px)" }} onClick={() => setShowPaywall(false)}>
          <div className="max-w-sm w-full mx-4 rounded-2xl p-6 text-center" onClick={(e) => e.stopPropagation()} style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.08)" }}>
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(255,77,106,.1)", border: "2px solid rgba(255,77,106,.2)" }}>
              <span className="text-2xl">🔒</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Scan Limit Reached</h3>
            <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,.45)" }}>
              You&apos;ve used your free scan for today.
            </p>
            <div className="rounded-lg px-3 py-2 mb-4 inline-block" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>Next free scan resets at midnight</span>
            </div>
            <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.12)" }}>
              <div className="text-[10px] font-mono font-bold mb-1" style={{ color: "#00e5a0" }}>🔥 LAUNCH SPECIAL</div>
              <div className="text-sm font-bold text-white mb-0.5">50% off your first month</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,.4)" }}>Pro at R49 • Premium at R124</div>
            </div>
            <div className="flex flex-col gap-2">
              <Link href="/pricing" className="w-full py-3 rounded-xl text-sm font-bold no-underline text-center block" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>Upgrade to Pro — R99/mo</Link>
              <button onClick={() => setShowPaywall(false)} className="w-full py-3 rounded-xl text-sm font-semibold cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.4)" }}>Wait for Tomorrow</button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Broker Popup */}
      {showBrokerPopup && (
        <div className="fixed inset-0 z-[9997] flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,.6)", backdropFilter: "blur(8px)" }} onClick={() => setShowBrokerPopup(false)}>
          <div
            className="w-full sm:max-w-[400px] mx-0 sm:mx-4 rounded-t-2xl sm:rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#12131a",
              border: "1px solid rgba(255,255,255,.08)",
              boxShadow: "0 -20px 60px rgba(0,0,0,.5)",
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
                style={{ background: "linear-gradient(135deg, #f0b90b, #e6a800)", color: "#0a0b0f", boxShadow: "0 4px 20px rgba(240,185,11,.25)" }}
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
    </div>
  );
}
