"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function PublicScanPage() {
  const params = useParams();
  const shareId = params.id as string;
  const [scan, setScan] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [access, setAccess] = useState<"full" | "limited">("limited");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/scan?id=${shareId}`);
        if (!res.ok) { setError("Scan not found"); setLoading(false); return; }
        const data = await res.json();
        setScan(data.scan);
        setAnalysis(data.analysis);
        setAccess(data.access);
      } catch {
        setError("Failed to load scan");
      }
      setLoading(false);
    })();
  }, [shareId]);

  const cc = (c: number) => c >= 70 ? "#00e5a0" : c >= 50 ? "#f0b90b" : "#ff4d6a";
  const showFull = access === "full";

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0b0f" }}>
      <div className="text-center">
        <div className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "rgba(0,229,160,.1)", border: "2px solid rgba(0,229,160,.2)" }}>
          <div className="w-5 h-5 rounded-full" style={{ border: "2px solid #00e5a0", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
        </div>
        <div className="text-xs font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Loading analysis…</div>
      </div>
    </div>
  );

  if (error || !scan) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0b0f" }}>
      <div className="text-center">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-lg font-bold text-white mb-2">Scan not found</div>
        <div className="text-xs mb-4" style={{ color: "rgba(255,255,255,.4)" }}>This analysis may have been removed or the link is invalid.</div>
        <Link href="/" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
          Try FXSynapse AI →
        </Link>
      </div>
    </div>
  );

  const A = analysis;

  return (
    <div className="min-h-screen relative" style={{ background: "#0a0b0f" }}>
      {/* BG */}
      <div className="fixed inset-0 z-0">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.07) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ bottom: "-20%", right: "-10%", width: 450, height: 450, background: "radial-gradient(circle,rgba(168,85,247,.05) 0%,transparent 70%)", filter: "blur(80px)" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <span className="text-base font-bold text-white">FXSynapse<span style={{ color: "#00e5a0" }}> AI</span></span>
        </Link>
        <Link href="/signup" className="text-xs font-bold px-4 py-2 rounded-lg no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
          Try Free
        </Link>
      </header>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* Scan Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.15)" }}>
            <span className="text-sm">📊</span>
            <span className="text-[11px] font-mono font-bold" style={{ color: "#00e5a0" }}>AI CHART ANALYSIS</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-1">
            {scan.pair || "Chart"} · {scan.timeframe || "Analysis"}
          </h1>
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className="text-lg">{scan.bias === "Long" ? "↑" : scan.bias === "Short" ? "↓" : "→"}</span>
            <span className="text-xs font-mono px-2.5 py-1 rounded-lg" style={{ background: cc(scan.confidence) + "15", color: cc(scan.confidence), border: `1px solid ${cc(scan.confidence)}30` }}>
              {scan.confidence}% confidence · {scan.bias?.toUpperCase()} BIAS
            </span>
          </div>
          <div className="text-[10px] font-mono mt-2" style={{ color: "rgba(255,255,255,.2)" }}>
            {new Date(scan.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        {/* Analysis Cards */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { l: "Trend", v: A.trend, c: "#00e5a0", free: true },
            { l: "Structure", v: A.structure, c: "#4da0ff", free: true },
            { l: "Support", v: A.support || A.all_levels?.find((l: any) => l.type === "support")?.price, c: "#00e5a0", free: false },
            { l: "Resistance", v: A.resistance || A.all_levels?.find((l: any) => l.type === "resistance")?.price, c: "#ff4d6a", free: false },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,.3)" }}>{s.l}</div>
              {showFull || s.free ? (
                <div className="text-sm font-bold" style={{ color: s.c }}>{s.v || "—"}</div>
              ) : (
                <div className="text-sm font-bold font-mono select-none" style={{ color: s.c, filter: "blur(10px)", userSelect: "none" }}>●●●●●●</div>
              )}
            </div>
          ))}
        </div>

        {/* Trade Setup */}
        <div className="rounded-xl p-4 mb-4 relative overflow-hidden" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div className="text-xs font-bold text-white mb-3">Trade Setup</div>
          
          {!showFull && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center" style={{ backdropFilter: "blur(20px)", background: "rgba(10,11,16,.9)" }}>
              <span className="text-2xl mb-2">🔒</span>
              <div className="text-sm font-bold text-white mb-1">Full Analysis Locked</div>
              <div className="text-[10px] mb-3" style={{ color: "rgba(255,255,255,.4)" }}>Sign up to see Entry, TP, SL & R:R</div>
              <Link href="/signup" className="px-5 py-2.5 rounded-xl text-xs font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
                Start Free — 1 Scan/Day
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Entry", v: A.entry_price || A.entry_zone || "—", c: "#00e5a0" },
              { l: "Take Profit", v: A.take_profit || "—", c: "#4da0ff" },
              { l: "Stop Loss", v: A.stop_loss || "—", c: "#ff4d6a" },
              { l: "Risk:Reward", v: A.risk_reward || "—", c: "#f0b90b" },
            ].map((r, i) => (
              <div key={i} className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,.02)" }}>
                <div className="text-[8px] font-mono uppercase" style={{ color: "rgba(255,255,255,.25)" }}>{r.l}</div>
                <div className="text-sm font-bold font-mono" style={{ color: r.c }}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Overview */}
        {A.overview && (
          <div className="rounded-xl p-4 mb-4 relative overflow-hidden" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="text-xs font-bold text-white mb-2">AI Overview</div>
            {!showFull && (
              <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ backdropFilter: "blur(16px)", background: "rgba(10,11,16,.85)" }}>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>🔒 Sign up to read full AI analysis</div>
              </div>
            )}
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,.5)" }}>{A.overview}</p>
          </div>
        )}

        {/* Share + CTA */}
        <div className="text-center mt-6 mb-4">
          <div className="text-lg font-bold text-white mb-2">Want AI analysis on your charts?</div>
          <div className="text-xs mb-4" style={{ color: "rgba(255,255,255,.4)" }}>
            Upload any chart screenshot. Get instant analysis with levels, entry, SL & TP.
          </div>
          <Link href="/signup" className="inline-block px-6 py-3 rounded-xl text-sm font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
            Start Free — 1 Scan/Day
          </Link>
          <div className="text-[9px] font-mono mt-2" style={{ color: "rgba(255,255,255,.15)" }}>No card required · Instant access</div>
        </div>

        {/* Branding */}
        <div className="text-center mt-8 py-4" style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
          <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>
            Powered by FXSynapse AI · AI-powered chart analysis
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
