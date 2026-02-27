"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ─── Types ─── */
interface FeedSignal {
  id: string; symbol: string; displaySymbol: string; timeframe: string;
  direction: "BUY" | "SELL" | "NEUTRAL"; confidence: number; grade: string;
  status: string; createdAt: string; expiresAt: string;
  visibility: "full" | "delayed" | "blurred";
  delayRemaining?: number;
  entryPrice: number | null; stopLoss: number | null;
  takeProfit1: number | null; takeProfit2: number | null;
  riskReward: string | null;
  trend: string | null; structure: string | null;
  smartMoney: any; confluences: string[] | null;
  reasoning: string | null; indicators: any;
  keyLevels: any; newsRisk: string | null;
  pipsResult?: number | null;
}

interface TrackEntry {
  display_symbol: string; timeframe: string; grade: string;
  total_signals: number; wins: number; losses: number;
  win_rate: number; avg_pips: number;
}

const GRADE_COLORS: Record<string, string> = { A: "#00e5a0", B: "#4da0ff", C: "#f59e0b", D: "rgba(255,255,255,.25)" };
const DIR_COLORS: Record<string, string> = { BUY: "#00e5a0", SELL: "#ff4d6a", NEUTRAL: "rgba(255,255,255,.3)" };
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "ACTIVE", color: "#00e5a0" },
  hit_tp1: { label: "TP1 HIT ✓", color: "#00e5a0" },
  hit_tp2: { label: "TP2 HIT ✓✓", color: "#4da0ff" },
  hit_sl: { label: "SL HIT ✕", color: "#ff4d6a" },
  expired: { label: "EXPIRED", color: "rgba(255,255,255,.2)" },
  cancelled: { label: "CANCELLED", color: "rgba(255,255,255,.2)" },
};

export default function SignalFeed({ userTier = "free" }: { userTier?: string }) {
  const [signals, setSignals] = useState<FeedSignal[]>([]);
  const [trackRecord, setTrackRecord] = useState<TrackEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "A" | "B" | "C">("all");
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter !== "all") params.set("grade", filter);
      const res = await fetch(`/api/signals/feed?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSignals(data.signals || []);
      setTrackRecord(data.trackRecord || null);
      setError(null);
    } catch {
      setError("Failed to load signals");
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const iv = setInterval(fetchFeed, 120000);
    return () => clearInterval(iv);
  }, [fetchFeed]);

  const activeSignals = signals.filter(s => s.status === "active");
  const closedSignals = signals.filter(s => s.status !== "active");
  const gradeACount = signals.filter(s => s.grade === "A" && s.status === "active").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.15)" }}>
              <span className="text-sm">📡</span>
            </span>
            AI Signal Feed
          </h2>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>
            Claude AI scans 15 pairs × 2 timeframes • Updated every 30 min
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Live dot */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.1)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 6px #00e5a0", animation: "pulse 2s infinite" }} />
            <span className="text-[9px] font-mono font-bold" style={{ color: "#00e5a0" }}>{activeSignals.length} ACTIVE</span>
          </div>
          <button onClick={fetchFeed} disabled={loading} className="px-2.5 py-1 rounded-lg text-[9px] font-mono cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.3)", opacity: loading ? 0.5 : 1 }}>
            {loading ? "⟳" : "↻"} Refresh
          </button>
        </div>
      </div>

      {/* Grade A Banner for free users */}
      {userTier === "free" && gradeACount > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ background: "linear-gradient(135deg, rgba(0,229,160,.08), rgba(77,160,255,.05))", border: "1px solid rgba(0,229,160,.15)" }}>
          <div className="flex items-center gap-2">
            <span className="text-lg">🔥</span>
            <div>
              <div className="text-xs font-bold text-white">{gradeACount} Grade A signal{gradeACount > 1 ? "s" : ""} detected right now</div>
              <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>Entry, SL, TP details locked — upgrade to see</div>
            </div>
          </div>
          <Link href="/pricing" className="px-3 py-1.5 rounded-lg text-[10px] font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
            Unlock — R79/mo
          </Link>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
        {(["all", "A", "B", "C"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all" style={{
            background: filter === f ? (f === "all" ? "rgba(255,255,255,.06)" : `${GRADE_COLORS[f]}10`) : "transparent",
            border: filter === f ? `1px solid ${f === "all" ? "rgba(255,255,255,.1)" : GRADE_COLORS[f] + "25"}` : "1px solid transparent",
            color: filter === f ? (f === "all" ? "#fff" : GRADE_COLORS[f]) : "rgba(255,255,255,.25)",
          }}>
            {f === "all" ? "All Signals" : `Grade ${f}`}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-xs font-mono" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.12)", color: "#ff4d6a" }}>
          ⚠ {error}
        </div>
      )}

      {/* Loading */}
      {loading && signals.length === 0 && (
        <div className="flex flex-col items-center py-12">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ border: "2px solid rgba(0,229,160,.2)", borderTopColor: "#00e5a0", animation: "spin 1s linear infinite" }}>
            <span className="text-sm">📡</span>
          </div>
          <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Loading signals...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && signals.length === 0 && (
        <div className="flex flex-col items-center py-12 rounded-2xl" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
          <span className="text-3xl mb-3">📡</span>
          <div className="text-sm font-bold text-white mb-1">No signals yet</div>
          <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Signals are generated every 30 minutes during market hours</div>
        </div>
      )}

      {/* Active Signals */}
      {activeSignals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[9px] font-mono tracking-widest font-bold px-1" style={{ color: "rgba(0,229,160,.5)" }}>
            ACTIVE SIGNALS
          </div>
          {activeSignals.map(s => (
            <SignalCard key={s.id} signal={s} expanded={expanded === s.id} onToggle={() => setExpanded(expanded === s.id ? null : s.id)} userTier={userTier} />
          ))}
        </div>
      )}

      {/* Closed Signals */}
      {closedSignals.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <div className="text-[9px] font-mono tracking-widest font-bold px-1" style={{ color: "rgba(255,255,255,.2)" }}>
            RECENT HISTORY
          </div>
          {closedSignals.slice(0, 10).map(s => (
            <SignalCard key={s.id} signal={s} expanded={expanded === s.id} onToggle={() => setExpanded(expanded === s.id ? null : s.id)} userTier={userTier} />
          ))}
        </div>
      )}

      {/* Track Record */}
      {trackRecord && trackRecord.length > 0 && (
        <div className="mt-3 rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
          <div className="text-[9px] font-mono tracking-widest font-bold mb-3" style={{ color: "rgba(77,160,255,.5)" }}>
            📊 30-DAY TRACK RECORD
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {trackRecord.map((t, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-white">{t.display_symbol}</span>
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: `${GRADE_COLORS[t.grade]}10`, color: GRADE_COLORS[t.grade] }}>Grade {t.grade}</span>
                </div>
                <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{t.timeframe}</div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div>
                    <div className="text-lg font-black" style={{ color: t.win_rate >= 60 ? "#00e5a0" : t.win_rate >= 40 ? "#f59e0b" : "#ff4d6a" }}>{t.win_rate}%</div>
                    <div className="text-[7px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>WIN RATE</div>
                  </div>
                  <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{t.wins}W / {t.losses}L</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Track record gate for non-Pro */}
      {!trackRecord && userTier !== "free" && (
        <div className="mt-2 rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
          <span className="text-lg">📊</span>
          <div className="text-xs font-bold text-white mt-1">Signal Track Record</div>
          <div className="text-[9px] font-mono mb-2" style={{ color: "rgba(255,255,255,.3)" }}>See win rates and pip history for all signals</div>
          <Link href="/pricing" className="inline-block px-4 py-1.5 rounded-lg text-[9px] font-bold no-underline" style={{ background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.15)", color: "#f59e0b" }}>
            Upgrade to Pro — R349/mo
          </Link>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════ */
/*  SIGNAL CARD                                        */
/* ════════════════════════════════════════════════════ */

function SignalCard({ signal: s, expanded, onToggle, userTier }: {
  signal: FeedSignal; expanded: boolean; onToggle: () => void; userTier: string;
}) {
  const dirColor = DIR_COLORS[s.direction] || DIR_COLORS.NEUTRAL;
  const gradeColor = GRADE_COLORS[s.grade] || GRADE_COLORS.D;
  const statusInfo = STATUS_LABELS[s.status] || STATUS_LABELS.active;
  const isBlurred = s.visibility === "blurred";
  const isDelayed = s.visibility === "delayed";
  const ago = timeAgo(s.createdAt);

  return (
    <div className="rounded-2xl overflow-hidden transition-all" style={{ border: `1px solid ${dirColor}15`, background: "rgba(255,255,255,.015)" }}>
      {/* Header — always visible */}
      <button onClick={onToggle} className="w-full p-3.5 flex items-center justify-between cursor-pointer transition-all hover:bg-white/[.02]" style={{ background: "transparent", border: "none" }}>
        <div className="flex items-center gap-3">
          {/* Direction badge */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0" style={{ background: `${dirColor}12`, color: dirColor, border: `1px solid ${dirColor}20` }}>
            {s.direction === "BUY" ? "↑" : s.direction === "SELL" ? "↓" : "→"}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-white">{s.displaySymbol}</span>
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${dirColor}12`, color: dirColor }}>{s.direction}</span>
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${gradeColor}12`, color: gradeColor }}>Grade {s.grade}</span>
              <span className="text-[7px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.25)" }}>{s.timeframe}</span>
              {/* Status badge for closed */}
              {s.status !== "active" && (
                <span className="text-[7px] font-mono px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${statusInfo.color}10`, color: statusInfo.color }}>{statusInfo.label}</span>
              )}
            </div>
            {/* Trend teaser — always visible */}
            {s.trend && (
              <div className="text-[9px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.25)" }}>
                Trend: {s.trend} • {ago}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          {/* Confidence */}
          <div className="text-right">
            <div className="text-base font-black font-mono" style={{ color: dirColor }}>{s.confidence}%</div>
            <div className="text-[7px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>CONF</div>
          </div>
          {/* Delayed badge */}
          {isDelayed && s.delayRemaining && (
            <div className="px-2 py-1 rounded-lg" style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.12)" }}>
              <div className="text-[8px] font-mono font-bold" style={{ color: "#f59e0b" }}>⏱ {s.delayRemaining}m</div>
            </div>
          )}
          {/* Lock icon for blurred */}
          {isBlurred && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)" }}>
              <span className="text-[10px]">🔒</span>
            </div>
          )}
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,.15)" }}>{expanded ? "▼" : "▶"}</span>
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="relative" style={{ borderTop: `1px solid ${dirColor}10` }}>
          {/* ─── BLURRED STATE ─── */}
          {isBlurred && (
            <div className="relative">
              {/* Fake blurred content */}
              <div className="p-4 select-none pointer-events-none" style={{ filter: "blur(14px)", opacity: 0.2 }}>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {["ENTRY", "STOP LOSS", "TP 1", "R:R"].map(l => (
                    <div key={l} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,.03)" }}>
                      <div className="text-[8px] font-mono">{l}</div>
                      <div className="text-sm font-bold font-mono text-white">1.08542</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg p-3" style={{ background: "rgba(0,229,160,.04)" }}>
                  <div className="text-xs text-white">Price is approaching a bullish order block at 1.0850 with FVG confluence. RSI divergence on H4 supports reversal...</div>
                </div>
              </div>
              {/* Upgrade overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "rgba(10,11,16,.8)", backdropFilter: "blur(4px)" }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2.5" style={{ background: "rgba(0,229,160,.08)", border: "2px solid rgba(0,229,160,.15)" }}>
                  <span className="text-xl">🔒</span>
                </div>
                <div className="text-sm font-bold text-white mb-0.5">Signal Details Locked</div>
                <div className="text-[9px] mb-3" style={{ color: "rgba(255,255,255,.35)" }}>See entry, SL, TP and full smart money analysis</div>
                <div className="flex gap-1.5 mb-3 flex-wrap justify-center">
                  {["Entry Price", "SL / TP", "R:R Ratio", "Smart Money", "AI Reasoning"].map(f => (
                    <span key={f} className="text-[7px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.08)", color: "#00e5a0" }}>{f}</span>
                  ))}
                </div>
                <Link href="/pricing" className="px-5 py-2 rounded-xl text-[10px] font-bold no-underline transition-all hover:scale-105" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f", boxShadow: "0 4px 15px rgba(0,229,160,.25)" }}>
                  Unlock from R79/mo
                </Link>
                <div className="text-[8px] font-mono mt-1.5" style={{ color: "rgba(255,255,255,.15)" }}>R{userTier === "free" ? "79" : "199"} is less than one bad trade</div>
              </div>
            </div>
          )}

          {/* ─── DELAYED STATE ─── */}
          {isDelayed && s.delayRemaining && (
            <div className="p-4">
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(245,158,11,.05)", border: "1px solid rgba(245,158,11,.1)" }}>
                <div className="text-2xl mb-2">⏱</div>
                <div className="text-sm font-bold text-white mb-0.5">Grade A Signal — {s.delayRemaining} min delay</div>
                <div className="text-[10px] mb-3" style={{ color: "rgba(255,255,255,.35)" }}>Pro users already have this signal. Upgrade for instant access.</div>
                <Link href="/pricing" className="inline-block px-5 py-2 rounded-xl text-[10px] font-bold no-underline" style={{ background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.2)", color: "#f59e0b" }}>
                  Get Instant Access — Pro R349/mo
                </Link>
              </div>
              {/* Show what IS available */}
              {s.confluences && s.confluences.length > 0 && (
                <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                  <div className="text-[8px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(245,158,11,.4)" }}>CONFLUENCES</div>
                  <div className="flex flex-wrap gap-1">
                    {s.confluences.map((c, i) => (
                      <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(245,158,11,.06)", color: "#f59e0b" }}>✓ {c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── FULL STATE ─── */}
          {!isBlurred && !(isDelayed && s.delayRemaining) && (
            <div className="p-4 space-y-3" style={{ background: `${dirColor}03` }}>
              {/* Entry / SL / TP / RR */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "ENTRY", value: s.entryPrice, color: "#fff" },
                  { label: "STOP LOSS", value: s.stopLoss, color: "#ff4d6a" },
                  { label: "TP 1", value: s.takeProfit1, color: "#00e5a0" },
                  { label: "R:R", value: s.riskReward, color: "#4da0ff", isText: true },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                    <div className="text-[7px] font-mono tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,.2)" }}>{item.label}</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: item.color }}>
                      {item.value !== null && item.value !== undefined
                        ? (item.isText ? item.value : typeof item.value === "number" ? formatPrice(item.value) : item.value)
                        : "—"}
                    </div>
                  </div>
                ))}
              </div>

              {/* TP2 if exists */}
              {s.takeProfit2 && (
                <div className="rounded-lg px-3 py-2 flex justify-between items-center" style={{ background: "rgba(77,160,255,.04)", border: "1px solid rgba(77,160,255,.08)" }}>
                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>TP 2 (EXTENDED)</span>
                  <span className="text-[11px] font-bold font-mono" style={{ color: "#4da0ff" }}>{formatPrice(s.takeProfit2)}</span>
                </div>
              )}

              {/* Structure */}
              {s.structure && (
                <div className="rounded-lg px-3 py-2 flex justify-between items-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>STRUCTURE</span>
                  <span className="text-[10px] font-bold" style={{ color: "#4da0ff" }}>{s.structure}</span>
                </div>
              )}

              {/* Confluences */}
              {s.confluences && s.confluences.length > 0 && (
                <div className="rounded-lg p-3" style={{ background: "rgba(245,158,11,.03)", border: "1px solid rgba(245,158,11,.08)" }}>
                  <div className="text-[8px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(245,158,11,.4)" }}>⚡ CONFLUENCES ({s.confluences.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {s.confluences.map((c, i) => (
                      <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(245,158,11,.06)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.1)" }}>✓ {c}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Smart Money */}
              {s.smartMoney && (
                <div className="space-y-1.5">
                  {s.smartMoney.orderBlocks?.length > 0 && (
                    <div className="rounded-lg p-2.5" style={{ background: "rgba(240,185,11,.03)", border: "1px solid rgba(240,185,11,.06)" }}>
                      <div className="text-[7px] font-mono tracking-widest mb-1" style={{ color: "rgba(240,185,11,.35)" }}>📦 ORDER BLOCKS</div>
                      {s.smartMoney.orderBlocks.map((ob: any, i: number) => (
                        <div key={i} className="flex justify-between text-[9px] font-mono">
                          <span style={{ color: ob.type?.includes("bull") ? "#00e5a0" : "#ff4d6a" }}>{ob.type?.includes("bull") ? "▲ Bullish" : "▼ Bearish"}</span>
                          <span style={{ color: "rgba(255,255,255,.3)" }}>{ob.high || ob.price} — {ob.low || ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.smartMoney.fvgs?.length > 0 && (
                    <div className="rounded-lg p-2.5" style={{ background: "rgba(77,160,255,.03)", border: "1px solid rgba(77,160,255,.06)" }}>
                      <div className="text-[7px] font-mono tracking-widest mb-1" style={{ color: "rgba(77,160,255,.35)" }}>⚡ FVGs</div>
                      {s.smartMoney.fvgs.map((fvg: any, i: number) => (
                        <div key={i} className="flex justify-between text-[9px] font-mono">
                          <span style={{ color: fvg.type === "bullish" ? "#00e5a0" : "#ff4d6a" }}>{fvg.type === "bullish" ? "▲" : "▼"} {fvg.type}</span>
                          <span style={{ color: "rgba(255,255,255,.3)" }}>{fvg.high} — {fvg.low}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.smartMoney.liquidityLevels?.length > 0 && (
                    <div className="rounded-lg p-2.5" style={{ background: "rgba(168,85,247,.03)", border: "1px solid rgba(168,85,247,.06)" }}>
                      <div className="text-[7px] font-mono tracking-widest mb-1" style={{ color: "rgba(168,85,247,.35)" }}>💧 LIQUIDITY</div>
                      {s.smartMoney.liquidityLevels.map((liq: any, i: number) => (
                        <div key={i} className="flex justify-between text-[9px] font-mono">
                          <span style={{ color: liq.type === "buy_side" ? "#ff4d6a" : "#00e5a0" }}>{liq.type === "buy_side" ? "🔺" : "🔻"} {liq.type?.replace("_", " ")}</span>
                          <span style={{ color: "rgba(255,255,255,.3)" }}>@ {liq.price}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SMC Gate for free/basic users seeing partial */}
              {!s.smartMoney && userTier !== "free" && (
                <div className="rounded-lg p-3 text-center" style={{ background: "rgba(245,158,11,.03)", border: "1px solid rgba(245,158,11,.08)" }}>
                  <span className="text-sm">🔒</span>
                  <div className="text-[10px] font-bold text-white mt-1">Full Smart Money Analysis</div>
                  <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>FVGs, liquidity pools, supply/demand — Pro R349/mo</div>
                </div>
              )}

              {/* AI Reasoning */}
              {s.reasoning && (
                <div className="rounded-lg p-3" style={{ background: "rgba(0,229,160,.03)", border: "1px solid rgba(0,229,160,.06)" }}>
                  <div className="text-[8px] font-mono tracking-widest mb-1" style={{ color: "rgba(0,229,160,.35)" }}>🧠 AI REASONING</div>
                  <p className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,.5)" }}>{s.reasoning}</p>
                </div>
              )}
              {!s.reasoning && userTier !== "free" && (
                <div className="rounded-lg p-2.5 text-center" style={{ background: "rgba(0,229,160,.02)", border: "1px solid rgba(0,229,160,.05)" }}>
                  <span className="text-[9px] font-mono" style={{ color: "rgba(0,229,160,.3)" }}>🧠 AI Reasoning — available on Starter+</span>
                </div>
              )}

              {/* Indicators */}
              {s.indicators && (
                <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,.015)", border: "1px solid rgba(255,255,255,.03)" }}>
                  <div className="text-[7px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.15)" }}>INDICATORS</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {s.indicators.rsi !== null && (
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>RSI: <strong style={{ color: s.indicators.rsi > 70 ? "#ff4d6a" : s.indicators.rsi < 30 ? "#00e5a0" : "#f59e0b" }}>{s.indicators.rsi?.toFixed(1)}</strong></span>
                    )}
                    {s.indicators.emaCross && (
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>EMA: <strong style={{ color: s.indicators.emaCross.includes("bull") ? "#00e5a0" : s.indicators.emaCross.includes("bear") ? "#ff4d6a" : "rgba(255,255,255,.4)" }}>{s.indicators.emaCross}</strong></span>
                    )}
                    {s.indicators.atr !== null && (
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>ATR: {s.indicators.atr?.toFixed(5)}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Pips result for closed signals */}
              {s.pipsResult !== null && s.pipsResult !== undefined && (
                <div className="rounded-lg px-3 py-2 flex justify-between items-center" style={{ background: s.pipsResult >= 0 ? "rgba(0,229,160,.04)" : "rgba(255,77,106,.04)", border: `1px solid ${s.pipsResult >= 0 ? "rgba(0,229,160,.1)" : "rgba(255,77,106,.1)"}` }}>
                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>RESULT</span>
                  <span className="text-sm font-bold font-mono" style={{ color: s.pipsResult >= 0 ? "#00e5a0" : "#ff4d6a" }}>{s.pipsResult >= 0 ? "+" : ""}{s.pipsResult} pips</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─── */
function formatPrice(val: number): string {
  if (val >= 100) return val.toFixed(2);
  if (val >= 1) return val.toFixed(4);
  return val.toFixed(5);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
