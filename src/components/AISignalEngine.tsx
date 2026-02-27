"use client";
import { useState } from "react";

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
];

/* ─── Signal Card ─── */
function SignalCard({ signal, expanded, onToggle }: { signal: Signal; expanded: boolean; onToggle: () => void }) {
  const isBuy = signal.direction === "BUY";
  const dirColor = isBuy ? "#00e5a0" : "#ff4d6a";
  const gradeColors: Record<string, string> = { A: "#00e5a0", B: "#4da0ff", C: "#f59e0b", D: "rgba(255,255,255,.3)" };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${dirColor}20` }}>
      {/* Header */}
      <button onClick={onToggle} className="w-full p-4 flex items-center justify-between cursor-pointer" style={{ background: `${dirColor}06` }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black" style={{ background: `${dirColor}15`, color: dirColor }}>{signal.direction === "BUY" ? "↑" : "↓"}</div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{signal.displaySymbol}</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${dirColor}15`, color: dirColor }}>{signal.direction}</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${gradeColors[signal.grade]}15`, color: gradeColors[signal.grade] }}>Grade {signal.grade}</span>
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.3)" }}>{signal.timeframe}</span>
            </div>
            <div className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>{signal.reasoning.substring(0, 80)}...</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Confidence meter */}
          <div className="text-right">
            <div className="text-lg font-black font-mono" style={{ color: dirColor }}>{signal.confidence}%</div>
            <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>CONFIDENCE</div>
          </div>
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,.2)" }}>{expanded ? "▼" : "▶"}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4" style={{ background: "rgba(0,0,0,.15)" }}>
          {/* Entry / SL / TP */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "ENTRY", value: signal.entryPrice, color: "#fff" },
              { label: "STOP LOSS", value: signal.stopLoss, color: "#ff4d6a" },
              { label: "TP 1", value: signal.takeProfit1, color: "#00e5a0" },
              { label: "R:R", value: signal.riskReward, color: "#4da0ff", isText: true },
            ].map((item, i) => (
              <div key={i} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                <div className="text-[8px] font-mono tracking-widest mb-1" style={{ color: "rgba(255,255,255,.25)" }}>{item.label}</div>
                <div className="text-xs font-bold font-mono" style={{ color: item.color }}>{'isText' in item ? item.value : typeof item.value === 'number' ? item.value.toFixed(5) : item.value}</div>
              </div>
            ))}
          </div>

          {signal.takeProfit2 && (
            <div className="rounded-xl p-2 text-center" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.08)" }}>
              <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>TP 2: </span>
              <span className="text-xs font-bold font-mono" style={{ color: "#00e5a0" }}>{signal.takeProfit2.toFixed(5)}</span>
            </div>
          )}

          {/* Trend + Structure */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.02)" }}>
              <div className="text-[8px] font-mono tracking-widest mb-1" style={{ color: "rgba(255,255,255,.2)" }}>TREND</div>
              <div className="text-xs font-bold" style={{ color: signal.trend === "Bullish" ? "#00e5a0" : signal.trend === "Bearish" ? "#ff4d6a" : "#f59e0b" }}>{signal.trend}</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.02)" }}>
              <div className="text-[8px] font-mono tracking-widest mb-1" style={{ color: "rgba(255,255,255,.2)" }}>STRUCTURE</div>
              <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{signal.structure}</div>
            </div>
          </div>

          {/* Smart Money */}
          <div className="rounded-xl p-3" style={{ background: "rgba(168,85,247,.04)", border: "1px solid rgba(168,85,247,.08)" }}>
            <div className="text-[9px] font-mono font-bold mb-2" style={{ color: "#a855f7" }}>🧠 SMART MONEY</div>
            <div className="grid grid-cols-2 gap-2">
              {signal.smartMoney.orderBlocks.length > 0 && (
                <div>
                  <div className="text-[8px] font-mono mb-1" style={{ color: "rgba(255,255,255,.3)" }}>ORDER BLOCKS</div>
                  {signal.smartMoney.orderBlocks.map((ob, i) => (
                    <div key={i} className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{ob.type}: {ob.high}-{ob.low}</div>
                  ))}
                </div>
              )}
              {signal.smartMoney.liquidityLevels.length > 0 && (
                <div>
                  <div className="text-[8px] font-mono mb-1" style={{ color: "rgba(255,255,255,.3)" }}>LIQUIDITY</div>
                  {signal.smartMoney.liquidityLevels.map((liq, i) => (
                    <div key={i} className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{liq.type}: {liq.price}</div>
                  ))}
                </div>
              )}
              {signal.smartMoney.fvgs.length > 0 && (
                <div>
                  <div className="text-[8px] font-mono mb-1" style={{ color: "rgba(255,255,255,.3)" }}>FVGs</div>
                  {signal.smartMoney.fvgs.map((fvg, i) => (
                    <div key={i} className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{fvg.type}: {fvg.high}-{fvg.low}</div>
                  ))}
                </div>
              )}
              {signal.smartMoney.supplyDemand.length > 0 && (
                <div>
                  <div className="text-[8px] font-mono mb-1" style={{ color: "rgba(255,255,255,.3)" }}>SUPPLY/DEMAND</div>
                  {signal.smartMoney.supplyDemand.map((sd, i) => (
                    <div key={i} className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{sd.type} ({sd.strength}): {sd.high}-{sd.low}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Confluences */}
          {signal.confluences.length > 0 && (
            <div>
              <div className="text-[9px] font-mono font-bold mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>CONFLUENCES ({signal.confluences.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {signal.confluences.map((c, i) => (
                  <span key={i} className="text-[9px] font-mono px-2 py-1 rounded-lg" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.1)", color: "#00e5a0" }}>✓ {c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Indicators */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "RSI", value: signal.indicators.rsi?.toFixed(1) || "—", color: signal.indicators.rsiSignal === "overbought" ? "#ff4d6a" : signal.indicators.rsiSignal === "oversold" ? "#00e5a0" : "#fff" },
              { label: "EMA CROSS", value: signal.indicators.emaCross.replace("_", " "), color: signal.indicators.emaCross.includes("golden") || signal.indicators.emaCross === "bullish" ? "#00e5a0" : signal.indicators.emaCross.includes("death") || signal.indicators.emaCross === "bearish" ? "#ff4d6a" : "#fff" },
              { label: "ATR", value: signal.indicators.atr?.toFixed(5) || "—", color: "rgba(255,255,255,.5)" },
              { label: "NEWS", value: signal.newsRisk.split("—")[0].trim(), color: signal.newsRisk.toLowerCase().includes("high") ? "#ff4d6a" : signal.newsRisk.toLowerCase().includes("low") ? "#00e5a0" : "#f59e0b" },
            ].map((item, i) => (
              <div key={i} className="rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,.02)" }}>
                <div className="text-[7px] font-mono tracking-widest" style={{ color: "rgba(255,255,255,.2)" }}>{item.label}</div>
                <div className="text-[10px] font-bold font-mono capitalize" style={{ color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Reasoning */}
          <div className="rounded-xl p-3" style={{ background: "rgba(77,160,255,.04)", border: "1px solid rgba(77,160,255,.08)" }}>
            <div className="text-[9px] font-mono font-bold mb-1" style={{ color: "#4da0ff" }}>💡 AI REASONING</div>
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,.6)" }}>{signal.reasoning}</p>
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>
            <span>ID: {signal.id}</span>
            <span>Generated: {new Date(signal.createdAt).toLocaleTimeString()}</span>
            <span>Expires: {new Date(signal.expiresAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export default function AISignalEngine() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [quickScanning, setQuickScanning] = useState<string | null>(null);
  const [quickSignal, setQuickSignal] = useState<Signal | null>(null);
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<"full" | "quick">("quick");
  const [quickPair, setQuickPair] = useState(QUICK_PAIRS[0]);
  const [quickTf, setQuickTf] = useState("1h");
  const [showErrors, setShowErrors] = useState(false);

  // All signals (from full scan + quick scans)
  const allSignals = [
    ...(scanResult?.signals || []),
    ...(quickSignal ? [quickSignal] : []),
  ].sort((a, b) => b.confidence - a.confidence);

  /* ─── Full Market Scan ─── */
  const runFullScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/signals/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      setScanResult(data);
    } catch (err: any) {
      setScanResult({ signals: [], scannedPairs: 0, signalsGenerated: 0, scanDuration: 0, errors: [err.message] });
    }
    setScanning(false);
  };

  /* ─── Quick Scan Single Pair ─── */
  const runQuickScan = async () => {
    setQuickScanning(quickPair.display);
    setQuickSignal(null);
    try {
      const res = await fetch("/api/signals/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: quickPair.symbol, displaySymbol: quickPair.display, timeframe: quickTf }),
      });
      const data = await res.json();
      if (data.signal) setQuickSignal(data.signal);
      else setQuickSignal(null);
    } catch { /* ignore */ }
    setQuickScanning(null);
  };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)" }}>🧠</div>
          <div>
            <h2 className="text-sm font-bold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>AI Signal Engine</h2>
            <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>AI-POWERED • SMART MONEY • REAL-TIME ANALYSIS</p>
          </div>
        </div>
      </div>

      {/* MODE TOGGLE */}
      <div className="flex gap-2">
        {(["quick", "full"] as const).map(m => (
          <button key={m} onClick={() => setScanMode(m)} className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={{
              background: scanMode === m ? (m === "quick" ? "rgba(0,229,160,.1)" : "rgba(168,85,247,.1)") : "rgba(255,255,255,.03)",
              border: `1px solid ${scanMode === m ? (m === "quick" ? "rgba(0,229,160,.25)" : "rgba(168,85,247,.25)") : "rgba(255,255,255,.06)"}`,
              color: scanMode === m ? (m === "quick" ? "#00e5a0" : "#a855f7") : "rgba(255,255,255,.3)",
            }}>
            {m === "quick" ? "⚡ Quick Scan" : "🌐 Full Market Scan"}
          </button>
        ))}
      </div>

      {/* QUICK SCAN */}
      {scanMode === "quick" && (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div className="mb-4">
            <label className="block text-[10px] font-mono tracking-widest mb-2" style={{ color: "rgba(255,255,255,.3)" }}>SELECT PAIR</label>
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_PAIRS.map(p => (
                <button key={p.symbol} onClick={() => setQuickPair(p)} className="py-2 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all"
                  style={{
                    background: quickPair.symbol === p.symbol ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)",
                    border: `1px solid ${quickPair.symbol === p.symbol ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.05)"}`,
                    color: quickPair.symbol === p.symbol ? "#00e5a0" : "rgba(255,255,255,.35)",
                  }}>{p.display}</button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-[10px] font-mono tracking-widest mb-2" style={{ color: "rgba(255,255,255,.3)" }}>TIMEFRAME</label>
            <div className="flex gap-2">
              {["15min", "1h", "4h", "D"].map(tf => (
                <button key={tf} onClick={() => setQuickTf(tf)} className="flex-1 py-2 rounded-lg text-[10px] font-mono font-bold cursor-pointer"
                  style={{
                    background: quickTf === tf ? "rgba(77,160,255,.08)" : "rgba(255,255,255,.03)",
                    border: `1px solid ${quickTf === tf ? "rgba(77,160,255,.2)" : "rgba(255,255,255,.05)"}`,
                    color: quickTf === tf ? "#4da0ff" : "rgba(255,255,255,.35)",
                  }}>{tf.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <button onClick={runQuickScan} disabled={!!quickScanning} className="w-full py-3.5 rounded-xl text-sm font-bold cursor-pointer transition-all"
            style={{ background: quickScanning ? "rgba(255,255,255,.05)" : "linear-gradient(135deg, #00e5a0, #00b87d)", color: quickScanning ? "rgba(255,255,255,.3)" : "#0a0b0f" }}>
            {quickScanning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                Analyzing {quickScanning}...
              </span>
            ) : `Scan ${quickPair.display} ${quickTf.toUpperCase()}`}
          </button>
          {quickSignal === null && quickScanning === null && (
            <p className="text-[9px] font-mono text-center mt-2" style={{ color: "rgba(255,255,255,.2)" }}>Select a pair and timeframe, then click scan. AI will analyze candles + indicators + smart money.</p>
          )}
          {/* No signal found */}
          {quickScanning === null && quickSignal === null && scanResult === null && (
            <div />
          )}
        </div>
      )}

      {/* FULL SCAN */}
      {scanMode === "full" && (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(168,85,247,.04)", border: "1px solid rgba(168,85,247,.08)" }}>
            <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>
              🌐 Scans <strong className="text-white">12 pairs × 2 timeframes (H1 + H4)</strong> = 24 analyses via AI.
              Takes 2-5 minutes. Cost: ~$0.30-0.70 per full scan.
            </p>
          </div>
          <button onClick={runFullScan} disabled={scanning} className="w-full py-3.5 rounded-xl text-sm font-bold cursor-pointer transition-all"
            style={{ background: scanning ? "rgba(255,255,255,.05)" : "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff" }}>
            {scanning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                Full market scan in progress...
              </span>
            ) : "🧠 Run Full Market Scan"}
          </button>
        </div>
      )}

      {/* SCAN STATS */}
      {scanResult && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "SCANNED", value: scanResult.scannedPairs, color: "#fff", icon: "📊" },
            { label: "SIGNALS", value: scanResult.signalsGenerated, color: "#00e5a0", icon: "🎯" },
            { label: "DURATION", value: `${(scanResult.scanDuration / 1000).toFixed(1)}s`, color: "#4da0ff", icon: "⏱" },
            { label: "ERRORS", value: scanResult.errors.length, color: scanResult.errors.length > 0 ? "#ff4d6a" : "#00e5a0", icon: "⚠️" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="text-sm mb-0.5">{s.icon}</div>
              <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[7px] font-mono tracking-widest" style={{ color: "rgba(255,255,255,.2)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ERRORS */}
      {scanResult && scanResult.errors.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,77,106,.1)" }}>
          <button onClick={() => setShowErrors(!showErrors)} className="w-full flex items-center justify-between px-4 py-2 cursor-pointer" style={{ background: "rgba(255,77,106,.04)" }}>
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

      {/* SIGNAL CARDS */}
      {allSignals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white tracking-wider" style={{ fontFamily: "'Outfit',sans-serif" }}>
              🎯 ACTIVE SIGNALS ({allSignals.length})
            </h3>
            <div className="flex gap-1.5">
              {["A", "B", "C"].map(g => {
                const count = allSignals.filter(s => s.grade === g).length;
                return count > 0 ? (
                  <span key={g} className="text-[8px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.3)" }}>
                    {g}: {count}
                  </span>
                ) : null;
              })}
            </div>
          </div>
          {allSignals.map(signal => (
            <SignalCard
              key={signal.id}
              signal={signal}
              expanded={expandedSignal === signal.id}
              onToggle={() => setExpandedSignal(expandedSignal === signal.id ? null : signal.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {allSignals.length === 0 && !scanning && !quickScanning && (
        <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,.01)", border: "1px dashed rgba(255,255,255,.06)" }}>
          <div className="text-3xl mb-3">🧠</div>
          <div className="text-sm font-bold text-white mb-1">No signals yet</div>
          <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>Run a Quick Scan or Full Market Scan to generate AI-powered trade signals</div>
        </div>
      )}
    </div>
  );
}
