"use client";
import { useState } from "react";
import Link from "next/link";

/* ─── Types ─── */
interface Signal {
  id: string; symbol: string; displaySymbol: string; timeframe: string;
  direction: "BUY" | "SELL" | "NEUTRAL"; confidence: number; grade: string;
  entryPrice: number; stopLoss: number; takeProfit1: number; takeProfit2?: number;
  riskReward: string; trend: string; structure: string;
  smartMoney: { orderBlocks: any[]; liquidityLevels: any[]; fvgs: any[]; supplyDemand: any[] };
  confluences: string[]; reasoning: string;
  indicators: { rsi: number | null; rsiSignal: string; ema20: number | null; ema50: number | null; sma200: number | null; emaCross: string; atr: number | null };
  keyLevels: any[]; newsRisk: string; createdAt: string; expiresAt: string;
}

interface ScanResult {
  signals: Signal[]; scannedPairs: number; signalsGenerated: number; scanDuration: number; errors: string[];
}

const QUICK_PAIRS = [
  { symbol: "OANDA:EUR_USD", display: "EUR/USD" },
  { symbol: "OANDA:GBP_USD", display: "GBP/USD" },
  { symbol: "OANDA:USD_JPY", display: "USD/JPY" },
  { symbol: "OANDA:GBP_JPY", display: "GBP/JPY" },
  { symbol: "OANDA:EUR_JPY", display: "EUR/JPY" },
  { symbol: "OANDA:AUD_USD", display: "AUD/USD" },
  { symbol: "OANDA:USD_CAD", display: "USD/CAD" },
  { symbol: "OANDA:NZD_USD", display: "NZD/USD" },
  { symbol: "OANDA:USD_ZAR", display: "USD/ZAR" },
  { symbol: "OANDA:EUR_GBP", display: "EUR/GBP" },
  { symbol: "OANDA:USD_CHF", display: "USD/CHF" },
  { symbol: "OANDA:GBP_AUD", display: "GBP/AUD" },
  { symbol: "OANDA:XAU_USD", display: "XAU/USD" },
  { symbol: "OANDA:BTC_USD", display: "BTC/USD" },
  { symbol: "OANDA:US30_USD", display: "US30" },
];

/* ─── Tier Limits (mirrors tier-config.ts) ─── */
const TIER_LIMITS: Record<string, { scansPerDay: number; showEntry: boolean; showSmartMoney: "full" | "basic" | "locked"; showReasoning: boolean; fullScan: boolean }> = {
  free:      { scansPerDay: 1,  showEntry: false, showSmartMoney: "locked", showReasoning: false, fullScan: false },
  basic:     { scansPerDay: 5,  showEntry: true,  showSmartMoney: "basic",  showReasoning: false, fullScan: false },
  starter:   { scansPerDay: 15, showEntry: true,  showSmartMoney: "basic",  showReasoning: true,  fullScan: false },
  pro:       { scansPerDay: 50, showEntry: true,  showSmartMoney: "full",   showReasoning: true,  fullScan: true },
  unlimited: { scansPerDay: -1, showEntry: true,  showSmartMoney: "full",   showReasoning: true,  fullScan: true },
};

const GRADE_COLORS: Record<string, string> = { A: "#00e5a0", B: "#4da0ff", C: "#f59e0b", D: "rgba(255,255,255,.25)" };

export default function SignalFeed({ userTier = "free" }: { userTier?: string }) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [quickScanning, setQuickScanning] = useState<string | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
  const [quickPair, setQuickPair] = useState(QUICK_PAIRS[0]);
  const [quickTf, setQuickTf] = useState("1h");
  const [scanMode, setScanMode] = useState<"quick" | "full">("quick");
  const [scansUsedToday, setScansUsedToday] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const limits = TIER_LIMITS[userTier] || TIER_LIMITS.free;
  const canScan = limits.scansPerDay === -1 || scansUsedToday < limits.scansPerDay;
  const scansRemaining = limits.scansPerDay === -1 ? "∞" : `${limits.scansPerDay - scansUsedToday}`;

  /* ─── Quick Scan ─── */
  const runQuickScan = async () => {
    if (!canScan) { setShowPaywall(true); return; }
    setQuickScanning(quickPair.display);
    try {
      const res = await fetch("/api/signals/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: quickPair.symbol, displaySymbol: quickPair.display, timeframe: quickTf }),
      });
      const data = await res.json();
      if (data.signal) {
        setSignals(prev => [data.signal, ...prev.filter(s => s.id !== data.signal.id)]);
        setExpandedSignal(data.signal.id);
        setScansUsedToday(prev => prev + 1);
      }
    } catch { /* ignore */ }
    setQuickScanning(null);
  };

  /* ─── Full Market Scan ─── */
  const runFullScan = async () => {
    if (!canScan) { setShowPaywall(true); return; }
    if (!limits.fullScan) { setShowPaywall(true); return; }
    setScanning(true); setScanResult(null);
    try {
      const res = await fetch("/api/signals/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      setScanResult(data);
      if (data.signals) {
        setSignals(prev => {
          const ids = new Set(prev.map(s => s.id));
          return [...data.signals.filter((s: Signal) => !ids.has(s.id)), ...prev];
        });
        setScansUsedToday(prev => prev + (data.signalsGenerated || 0));
      }
    } catch (err: any) {
      setScanResult({ signals: [], scannedPairs: 0, signalsGenerated: 0, scanDuration: 0, errors: [err.message] });
    }
    setScanning(false);
  };

  const sortedSignals = [...signals].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "linear-gradient(135deg, rgba(0,229,160,.15), rgba(77,160,255,.1))", border: "1px solid rgba(0,229,160,.2)" }}>📡</div>
          <div>
            <h2 className="text-[15px] font-extrabold text-white">AI Signal Scanner</h2>
            <p className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>AI-powered • candles + indicators + smart money</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: canScan ? "rgba(0,229,160,.06)" : "rgba(255,77,106,.06)", border: `1px solid ${canScan ? "rgba(0,229,160,.1)" : "rgba(255,77,106,.1)"}` }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: canScan ? "#00e5a0" : "#ff4d6a", boxShadow: `0 0 6px ${canScan ? "#00e5a0" : "#ff4d6a"}` }} />
          <span className="text-[9px] font-mono font-bold" style={{ color: canScan ? "#00e5a0" : "#ff4d6a" }}>
            {scansRemaining} scan{scansRemaining === "1" ? "" : "s"} left
          </span>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-1.5">
        {([
          { id: "quick" as const, label: "⚡ Quick Scan", desc: "Single pair" },
          { id: "full" as const, label: "🌐 Full Scan", desc: limits.fullScan ? "All pairs" : "Pro+" },
        ]).map(m => (
          <button key={m.id} onClick={() => setScanMode(m.id)} className="flex-1 py-2 rounded-xl text-[11px] font-bold cursor-pointer transition-all"
            style={{
              background: scanMode === m.id ? (m.id === "quick" ? "rgba(0,229,160,.08)" : "rgba(168,85,247,.08)") : "rgba(255,255,255,.02)",
              border: `1px solid ${scanMode === m.id ? (m.id === "quick" ? "rgba(0,229,160,.2)" : "rgba(168,85,247,.2)") : "rgba(255,255,255,.05)"}`,
              color: scanMode === m.id ? (m.id === "quick" ? "#00e5a0" : "#a855f7") : "rgba(255,255,255,.25)",
            }}>
            {m.label}
            <span className="block text-[8px] font-normal" style={{ opacity: 0.5 }}>{m.desc}</span>
          </button>
        ))}
      </div>

      {/* ═══ QUICK SCAN ═══ */}
      {scanMode === "quick" && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
          <label className="block text-[9px] font-mono tracking-widest mb-2" style={{ color: "rgba(255,255,255,.25)" }}>SELECT PAIR</label>
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {QUICK_PAIRS.map(p => (
              <button key={p.symbol} onClick={() => setQuickPair(p)} className="py-2 rounded-lg text-[9px] font-mono font-bold cursor-pointer transition-all"
                style={{
                  background: quickPair.symbol === p.symbol ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.02)",
                  border: `1px solid ${quickPair.symbol === p.symbol ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.04)"}`,
                  color: quickPair.symbol === p.symbol ? "#00e5a0" : "rgba(255,255,255,.3)",
                }}>{p.display}</button>
            ))}
          </div>

          <label className="block text-[9px] font-mono tracking-widest mb-2" style={{ color: "rgba(255,255,255,.25)" }}>TIMEFRAME</label>
          <div className="flex gap-1.5 mb-4">
            {["15min", "1h", "4h", "D"].map(tf => (
              <button key={tf} onClick={() => setQuickTf(tf)} className="flex-1 py-2 rounded-lg text-[10px] font-mono font-bold cursor-pointer"
                style={{
                  background: quickTf === tf ? "rgba(77,160,255,.08)" : "rgba(255,255,255,.02)",
                  border: `1px solid ${quickTf === tf ? "rgba(77,160,255,.2)" : "rgba(255,255,255,.04)"}`,
                  color: quickTf === tf ? "#4da0ff" : "rgba(255,255,255,.3)",
                }}>{tf.toUpperCase()}</button>
            ))}
          </div>

          <button onClick={runQuickScan} disabled={!!quickScanning} className="w-full py-3.5 rounded-xl text-sm font-bold cursor-pointer transition-all"
            style={{
              background: quickScanning ? "rgba(255,255,255,.04)" : !canScan ? "rgba(255,77,106,.08)" : "linear-gradient(135deg, #00e5a0, #00b87d)",
              color: quickScanning ? "rgba(255,255,255,.3)" : !canScan ? "#ff4d6a" : "#0a0b0f",
              border: !canScan ? "1px solid rgba(255,77,106,.15)" : "none",
            }}>
            {quickScanning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white/20 border-t-white/60" style={{ animation: "spin 1s linear infinite" }} />
                Analyzing {quickScanning} with AI...
              </span>
            ) : !canScan ? "🔒 No scans remaining — Upgrade" : `⚡ Scan ${quickPair.display} ${quickTf.toUpperCase()}`}
          </button>
          {!quickScanning && signals.length === 0 && (
            <p className="text-[9px] font-mono text-center mt-2" style={{ color: "rgba(255,255,255,.15)" }}>
              Pick a pair + timeframe → AI analyzes 200 candles + indicators + smart money
            </p>
          )}
        </div>
      )}

      {/* ═══ FULL SCAN ═══ */}
      {scanMode === "full" && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
          {!limits.fullScan ? (
            <div className="text-center py-6">
              <span className="text-3xl">🔒</span>
              <div className="text-sm font-bold text-white mt-2 mb-1">Full Market Scan</div>
              <div className="text-[10px] mb-3" style={{ color: "rgba(255,255,255,.35)" }}>Scans 15 pairs × 2 timeframes = 30 analyses in one click</div>
              <div className="flex gap-1.5 justify-center mb-3 flex-wrap">
                {["All 15 pairs", "H1 + H4", "Ranked by grade", "Smart money"].map(f => (
                  <span key={f} className="text-[8px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(168,85,247,.06)", border: "1px solid rgba(168,85,247,.1)", color: "#a855f7" }}>{f}</span>
                ))}
              </div>
              <Link href="/pricing" className="inline-block px-6 py-2.5 rounded-xl text-[11px] font-bold no-underline" style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff" }}>
                Unlock with Pro — R349/mo
              </Link>
            </div>
          ) : (
            <>
              <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(168,85,247,.04)", border: "1px solid rgba(168,85,247,.08)" }}>
                <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>
                  🌐 Scans <strong className="text-white">15 pairs × 2 timeframes (H1 + H4)</strong> = 30 analyses. Takes 2-5 min.
                </p>
              </div>
              <button onClick={runFullScan} disabled={scanning} className="w-full py-3.5 rounded-xl text-sm font-bold cursor-pointer"
                style={{ background: scanning ? "rgba(255,255,255,.04)" : "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff" }}>
                {scanning ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-white/20 border-t-white/60" style={{ animation: "spin 1s linear infinite" }} />
                    Full market scan in progress...
                  </span>
                ) : "🧠 Run Full Market Scan"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Scan Stats */}
      {scanResult && (
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: "SCANNED", value: scanResult.scannedPairs, color: "#fff", icon: "📊" },
            { label: "SIGNALS", value: scanResult.signalsGenerated, color: "#00e5a0", icon: "🎯" },
            { label: "DURATION", value: `${(scanResult.scanDuration / 1000).toFixed(1)}s`, color: "#4da0ff", icon: "⏱" },
            { label: "ERRORS", value: scanResult.errors.length, color: scanResult.errors.length > 0 ? "#ff4d6a" : "#00e5a0", icon: "⚠️" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="text-[10px] mb-0.5">{s.icon}</div>
              <div className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[7px] font-mono tracking-widest" style={{ color: "rgba(255,255,255,.15)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {scanResult && scanResult.errors.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,77,106,.1)" }}>
          <button onClick={() => setShowErrors(!showErrors)} className="w-full flex items-center justify-between px-4 py-2 cursor-pointer" style={{ background: "rgba(255,77,106,.04)", border: "none" }}>
            <span className="text-[10px] font-mono" style={{ color: "#ff4d6a" }}>⚠️ {scanResult.errors.length} errors</span>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,.2)" }}>{showErrors ? "▼" : "▶"}</span>
          </button>
          {showErrors && (
            <div className="p-3 space-y-1 max-h-32 overflow-auto" style={{ background: "rgba(0,0,0,.2)" }}>
              {scanResult.errors.map((e, i) => (
                <div key={i} className="text-[9px] font-mono" style={{ color: "rgba(255,77,106,.5)" }}>• {e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ SIGNAL CARDS ═══ */}
      {sortedSignals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-mono tracking-widest font-bold" style={{ color: "rgba(0,229,160,.4)" }}>🎯 SIGNALS ({sortedSignals.length})</span>
            <div className="flex gap-1">
              {["A", "B", "C"].map(g => {
                const count = sortedSignals.filter(s => s.grade === g).length;
                return count > 0 ? (
                  <span key={g} className="text-[8px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: `${GRADE_COLORS[g]}10`, color: GRADE_COLORS[g] }}>{g}: {count}</span>
                ) : null;
              })}
            </div>
          </div>
          {sortedSignals.map(signal => (
            <GatedSignalCard key={signal.id} signal={signal} expanded={expandedSignal === signal.id}
              onToggle={() => setExpandedSignal(expandedSignal === signal.id ? null : signal.id)}
              limits={limits} userTier={userTier} />
          ))}
        </div>
      )}

      {/* Empty */}
      {sortedSignals.length === 0 && !scanning && !quickScanning && (
        <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,.01)", border: "1px dashed rgba(255,255,255,.05)" }}>
          <div className="text-3xl mb-3">📡</div>
          <div className="text-sm font-bold text-white mb-1">No signals yet</div>
          <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>Select a pair and timeframe above, then hit scan</div>
        </div>
      )}

      {/* ═══ PAYWALL ═══ */}
      {showPaywall && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.85)", backdropFilter: "blur(20px)" }} onClick={() => setShowPaywall(false)}>
          <div className="max-w-[400px] w-full rounded-3xl p-6 text-center" onClick={e => e.stopPropagation()} style={{ background: "rgba(20,21,30,.95)", border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 25px 60px rgba(0,0,0,.5)" }}>
            <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "rgba(0,229,160,.1)", border: "2px solid rgba(0,229,160,.2)" }}>
              <span className="text-2xl">🔒</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Scan Limit Reached</h3>
            <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,.4)" }}>
              You&apos;ve used all {limits.scansPerDay} signal scan{limits.scansPerDay === 1 ? "" : "s"} for today.
            </p>
            <div className="flex flex-col gap-2">
              {[
                { name: "Basic", price: "R79/mo", scans: "5 scans/day", color: "#4da0ff", tier: "basic" },
                { name: "Starter", price: "R199/mo", scans: "15 scans/day", color: "#00e5a0", tier: "starter" },
                { name: "Pro", price: "R349/mo", scans: "50 + Full Scan", color: "#f59e0b", tier: "pro" },
                { name: "Unlimited", price: "R499/mo", scans: "∞ Unlimited", color: "#a855f7", tier: "unlimited" },
              ].filter(p => {
                const order = ["free", "basic", "starter", "pro", "unlimited"];
                return order.indexOf(p.tier) > order.indexOf(userTier);
              }).map(plan => (
                <Link key={plan.name} href="/pricing" className="flex items-center justify-between px-4 py-3 rounded-xl no-underline transition-all hover:scale-[1.02]" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                  <div className="text-left">
                    <div className="text-xs font-bold text-white">{plan.name}</div>
                    <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{plan.scans}</div>
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: plan.color }}>{plan.price}</div>
                </Link>
              ))}
            </div>
            <div className="text-[8px] font-mono mt-3" style={{ color: "rgba(255,255,255,.15)" }}>R79 is less than one bad trade</div>
            <button onClick={() => setShowPaywall(false)} className="mt-2 text-[10px] cursor-pointer" style={{ background: "none", border: "none", color: "rgba(255,255,255,.15)" }}>dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════ */
/*  GATED SIGNAL CARD                                  */
/* ════════════════════════════════════════════════════ */

function GatedSignalCard({ signal, expanded, onToggle, limits, userTier }: {
  signal: Signal; expanded: boolean; onToggle: () => void;
  limits: { showEntry: boolean; showSmartMoney: "full" | "basic" | "locked"; showReasoning: boolean };
  userTier: string;
}) {
  const isBuy = signal.direction === "BUY";
  const dirColor = isBuy ? "#00e5a0" : signal.direction === "SELL" ? "#ff4d6a" : "rgba(255,255,255,.3)";
  const gradeColor = GRADE_COLORS[signal.grade] || GRADE_COLORS.D;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${dirColor}15`, background: "rgba(255,255,255,.015)" }}>
      {/* Header — always visible */}
      <button onClick={onToggle} className="w-full p-3.5 flex items-center justify-between cursor-pointer transition-all" style={{ background: `${dirColor}04`, border: "none" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0" style={{ background: `${dirColor}12`, color: dirColor, border: `1px solid ${dirColor}20` }}>
            {signal.direction === "BUY" ? "↑" : signal.direction === "SELL" ? "↓" : "→"}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-white">{signal.displaySymbol}</span>
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${dirColor}12`, color: dirColor }}>{signal.direction}</span>
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${gradeColor}12`, color: gradeColor }}>Grade {signal.grade}</span>
              <span className="text-[7px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.2)" }}>{signal.timeframe}</span>
            </div>
            <div className="text-[9px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.2)" }}>
              Trend: {signal.trend} • {new Date(signal.createdAt).toLocaleTimeString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-base font-black font-mono" style={{ color: dirColor }}>{signal.confidence}%</div>
            <div className="text-[7px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>CONF</div>
          </div>
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,.15)" }}>{expanded ? "▼" : "▶"}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-3" style={{ background: `${dirColor}03`, borderTop: `1px solid ${dirColor}08` }}>

          {/* Entry / SL / TP / RR */}
          {limits.showEntry ? (
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "ENTRY", value: signal.entryPrice, color: "#fff" },
                { label: "STOP LOSS", value: signal.stopLoss, color: "#ff4d6a" },
                { label: "TP 1", value: signal.takeProfit1, color: "#00e5a0" },
                { label: "R:R", value: signal.riskReward, color: "#4da0ff", isText: true },
              ].map((item, i) => (
                <div key={i} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                  <div className="text-[7px] font-mono tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,.2)" }}>{item.label}</div>
                  <div className="text-[11px] font-bold font-mono" style={{ color: item.color }}>
                    {"isText" in item ? item.value : typeof item.value === "number" ? fmtPrice(item.value) : item.value}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* BLURRED — Free tier */
            <div className="relative">
              <div className="grid grid-cols-4 gap-1.5 select-none pointer-events-none" style={{ filter: "blur(14px)", opacity: 0.25 }}>
                {["ENTRY", "STOP LOSS", "TP 1", "R:R"].map(l => (
                  <div key={l} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,.02)" }}>
                    <div className="text-[7px] font-mono">{l}</div>
                    <div className="text-[11px] font-bold font-mono text-white">1.08542</div>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: "rgba(10,11,16,.7)", backdropFilter: "blur(4px)" }}>
                <Link href="/pricing" className="flex flex-col items-center gap-1 no-underline group">
                  <span className="text-lg">🔒</span>
                  <span className="text-[10px] font-bold transition-all group-hover:scale-105" style={{ color: "#4da0ff" }}>Unlock Entry/SL/TP — R79/mo</span>
                </Link>
              </div>
            </div>
          )}

          {limits.showEntry && signal.takeProfit2 && (
            <div className="rounded-lg px-3 py-2 flex justify-between items-center" style={{ background: "rgba(0,229,160,.03)", border: "1px solid rgba(0,229,160,.06)" }}>
              <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>TP 2</span>
              <span className="text-[11px] font-bold font-mono" style={{ color: "#00e5a0" }}>{fmtPrice(signal.takeProfit2)}</span>
            </div>
          )}

          {/* Trend + Structure */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.03)" }}>
              <div className="text-[7px] font-mono tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,.15)" }}>TREND</div>
              <div className="text-[10px] font-bold" style={{ color: signal.trend === "Bullish" ? "#00e5a0" : signal.trend === "Bearish" ? "#ff4d6a" : "#f59e0b" }}>{signal.trend}</div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.03)" }}>
              <div className="text-[7px] font-mono tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,.15)" }}>STRUCTURE</div>
              <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{signal.structure}</div>
            </div>
          </div>

          {/* Confluences */}
          {signal.confluences.length > 0 && (
            <div className="rounded-lg p-2.5" style={{ background: "rgba(245,158,11,.03)", border: "1px solid rgba(245,158,11,.06)" }}>
              <div className="text-[7px] font-mono tracking-widest mb-1" style={{ color: "rgba(245,158,11,.35)" }}>⚡ CONFLUENCES ({signal.confluences.length})</div>
              <div className="flex flex-wrap gap-1">
                {signal.confluences.map((c, i) => (
                  <span key={i} className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.1)", color: "#f59e0b" }}>✓ {c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Smart Money */}
          {limits.showSmartMoney !== "locked" ? (
            <div className="rounded-lg p-2.5" style={{ background: "rgba(168,85,247,.03)", border: "1px solid rgba(168,85,247,.06)" }}>
              <div className="text-[7px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(168,85,247,.35)" }}>🧠 SMART MONEY</div>
              <div className="grid grid-cols-2 gap-2">
                {signal.smartMoney.orderBlocks.length > 0 && (
                  <div>
                    <div className="text-[7px] font-mono mb-0.5" style={{ color: "rgba(255,255,255,.2)" }}>ORDER BLOCKS</div>
                    {signal.smartMoney.orderBlocks.map((ob: any, i: number) => (
                      <div key={i} className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{ob.type}: {ob.high}-{ob.low}</div>
                    ))}
                  </div>
                )}
                {limits.showSmartMoney === "full" && signal.smartMoney.fvgs.length > 0 && (
                  <div>
                    <div className="text-[7px] font-mono mb-0.5" style={{ color: "rgba(255,255,255,.2)" }}>FVGs</div>
                    {signal.smartMoney.fvgs.map((fvg: any, i: number) => (
                      <div key={i} className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{fvg.type}: {fvg.high}-{fvg.low}</div>
                    ))}
                  </div>
                )}
                {limits.showSmartMoney === "full" && signal.smartMoney.liquidityLevels.length > 0 && (
                  <div>
                    <div className="text-[7px] font-mono mb-0.5" style={{ color: "rgba(255,255,255,.2)" }}>LIQUIDITY</div>
                    {signal.smartMoney.liquidityLevels.map((liq: any, i: number) => (
                      <div key={i} className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{liq.type}: {liq.price}</div>
                    ))}
                  </div>
                )}
                {limits.showSmartMoney === "full" && signal.smartMoney.supplyDemand.length > 0 && (
                  <div>
                    <div className="text-[7px] font-mono mb-0.5" style={{ color: "rgba(255,255,255,.2)" }}>SUPPLY/DEMAND</div>
                    {signal.smartMoney.supplyDemand.map((sd: any, i: number) => (
                      <div key={i} className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{sd.type} ({sd.strength}): {sd.high}-{sd.low}</div>
                    ))}
                  </div>
                )}
              </div>
              {limits.showSmartMoney === "basic" && (
                <div className="mt-2 text-center">
                  <Link href="/pricing" className="text-[8px] font-mono no-underline" style={{ color: "rgba(168,85,247,.4)" }}>🔒 FVGs, Liquidity, S/D — Pro R349/mo</Link>
                </div>
              )}
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden">
              <div className="p-2.5 select-none pointer-events-none" style={{ filter: "blur(10px)", opacity: 0.2 }}>
                <div className="text-[7px] font-mono">SMART MONEY</div>
                <div className="text-[8px] font-mono text-white">Bullish OB: 1.0850-1.0842 • FVG: 1.0860-1.0872</div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(10,11,16,.65)" }}>
                <Link href="/pricing" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg no-underline" style={{ background: "rgba(168,85,247,.08)", border: "1px solid rgba(168,85,247,.12)" }}>
                  <span className="text-[9px]">🔒</span>
                  <span className="text-[9px] font-bold" style={{ color: "#a855f7" }}>Smart Money — Basic R79/mo</span>
                </Link>
              </div>
            </div>
          )}

          {/* Indicators */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "RSI", value: signal.indicators.rsi?.toFixed(1) || "—", color: signal.indicators.rsiSignal === "overbought" ? "#ff4d6a" : signal.indicators.rsiSignal === "oversold" ? "#00e5a0" : "#fff" },
              { label: "EMA", value: signal.indicators.emaCross.replace("_", " "), color: signal.indicators.emaCross.includes("golden") || signal.indicators.emaCross === "bullish" ? "#00e5a0" : signal.indicators.emaCross.includes("death") || signal.indicators.emaCross === "bearish" ? "#ff4d6a" : "#fff" },
              { label: "ATR", value: signal.indicators.atr?.toFixed(5) || "—", color: "rgba(255,255,255,.4)" },
              { label: "NEWS", value: signal.newsRisk.split("—")[0].trim(), color: signal.newsRisk.toLowerCase().includes("high") ? "#ff4d6a" : "#00e5a0" },
            ].map((item, i) => (
              <div key={i} className="rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,.015)", border: "1px solid rgba(255,255,255,.03)" }}>
                <div className="text-[6px] font-mono tracking-widest" style={{ color: "rgba(255,255,255,.15)" }}>{item.label}</div>
                <div className="text-[9px] font-bold font-mono capitalize" style={{ color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* AI Reasoning */}
          {limits.showReasoning ? (
            <div className="rounded-lg p-2.5" style={{ background: "rgba(77,160,255,.03)", border: "1px solid rgba(77,160,255,.06)" }}>
              <div className="text-[7px] font-mono tracking-widest mb-1" style={{ color: "rgba(77,160,255,.3)" }}>💡 AI REASONING</div>
              <p className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,.5)" }}>{signal.reasoning}</p>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden">
              <div className="p-2.5 select-none pointer-events-none" style={{ filter: "blur(10px)", opacity: 0.2 }}>
                <div className="text-[10px] text-white">Price approaching bullish order block at support with RSI divergence on H4 timeframe...</div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(10,11,16,.6)" }}>
                <Link href="/pricing" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg no-underline" style={{ background: "rgba(77,160,255,.08)", border: "1px solid rgba(77,160,255,.12)" }}>
                  <span className="text-[9px]">🧠</span>
                  <span className="text-[9px] font-bold" style={{ color: "#4da0ff" }}>AI Reasoning — Starter R199/mo</span>
                </Link>
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center justify-between text-[7px] font-mono" style={{ color: "rgba(255,255,255,.1)" }}>
            <span>ID: {signal.id.slice(0, 12)}</span>
            <span>Expires: {new Date(signal.expiresAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtPrice(val: number): string {
  if (val >= 100) return val.toFixed(2);
  if (val >= 1) return val.toFixed(4);
  return val.toFixed(5);
}
