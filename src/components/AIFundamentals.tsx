"use client";
import { useState, useEffect, useCallback } from "react";

interface EconomicEvent {
  id: string;
  event_date: string;
  event_time: string | null;
  country: string;
  event_name: string;
  impact: string;
  previous: string | null;
  forecast: string | null;
  actual: string | null;
  flag?: string;
}

interface CurrencyRating {
  code: string;
  name: string;
  flag: string;
  direction: string;
  probability: number;
  reasoning: string;
}

interface PairImplication {
  pair: string;
  direction: string;
  arrow: string;
  reasoning: string;
}

interface AIBrief {
  id: string;
  session: string;
  report_date: string;
  currencies: CurrencyRating[];
  pair_implications: PairImplication[];
  summary: string;
  created_at: string;
}

const FLAGS: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", JP: "🇯🇵", AU: "🇦🇺",
  NZ: "🇳🇿", CA: "🇨🇦", CH: "🇨🇭", CN: "🇨🇳", DE: "🇩🇪",
};

const IMPACT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  high: { bg: "rgba(255,77,106,.12)", text: "#ff4d6a", dot: "#ff4d6a" },
  medium: { bg: "rgba(240,185,11,.12)", text: "#f0b90b", dot: "#f0b90b" },
  low: { bg: "rgba(0,229,160,.08)", text: "#00e5a0", dot: "#00e5a0" },
};

export default function AIFundamentals({ userPlan, userRole }: { userPlan: string; userRole: string }) {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [brief, setBrief] = useState<AIBrief | null>(null);
  const [briefStale, setBriefStale] = useState(false);
  const [calRange, setCalRange] = useState<"today" | "tomorrow" | "week">("today");
  const [loading, setLoading] = useState(true);
  const [briefLoading, setBriefLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const isPaid = userPlan === "pro" || userPlan === "premium" || userRole === "admin";

  const fetchCalendar = useCallback(async (range: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fundamentals/calendar?range=${range}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  const fetchBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const res = await fetch("/api/fundamentals/brief");
      if (res.ok) {
        const data = await res.json();
        setBrief(data.brief || null);
        setBriefStale(data.stale || false);
      }
    } catch { /* empty */ }
    setBriefLoading(false);
  }, []);

  const generateBrief = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/fundamentals/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey: "admin" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.brief) setBrief(data.brief);
        else await fetchBrief();
      }
    } catch { /* empty */ }
    setGenerating(false);
  };

  useEffect(() => { fetchCalendar(calRange); }, [calRange, fetchCalendar]);
  useEffect(() => { fetchBrief(); }, [fetchBrief]);

  // Group events by date
  const eventsByDate: Record<string, EconomicEvent[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.event_date]) eventsByDate[e.event_date] = [];
    eventsByDate[e.event_date].push(e);
  });

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const tom = new Date(today); tom.setDate(tom.getDate() + 1);
    const tomStr = tom.toISOString().split("T")[0];
    if (d === todayStr) return "Today";
    if (d === tomStr) return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const dirColor = (dir: string) => {
    if (dir.toLowerCase().includes("strength")) return "#00e5a0";
    if (dir.toLowerCase().includes("weak")) return "#ff4d6a";
    return "rgba(255,255,255,.4)";
  };

  const dirBg = (dir: string) => {
    if (dir.toLowerCase().includes("strength")) return "rgba(0,229,160,.1)";
    if (dir.toLowerCase().includes("weak")) return "rgba(255,77,106,.1)";
    return "rgba(255,255,255,.04)";
  };

  const pairColor = (dir: string) => {
    if (dir.toLowerCase().includes("bullish")) return "#00e5a0";
    if (dir.toLowerCase().includes("bearish")) return "#ff4d6a";
    return "rgba(255,255,255,.4)";
  };

  return (
    <div className="space-y-5" style={{ animation: "fadeUp 0.5s ease" }}>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2" style={{ letterSpacing: "-.5px" }}>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "linear-gradient(135deg, rgba(240,185,11,.15), rgba(240,185,11,.05))", border: "1px solid rgba(240,185,11,.15)" }}>📊</span>
            AI Fundamentals
          </h2>
          <p className="text-[11px] font-mono mt-1" style={{ color: "rgba(255,255,255,.3)" }}>
            Economic calendar & AI-powered market intelligence
          </p>
        </div>
        {isPaid && (
          <button
            onClick={generateBrief}
            disabled={generating}
            className="px-4 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
            style={{
              background: generating ? "rgba(255,255,255,.04)" : "linear-gradient(135deg, rgba(240,185,11,.15), rgba(240,185,11,.05))",
              border: "1px solid rgba(240,185,11,.15)",
              color: generating ? "rgba(255,255,255,.3)" : "#f0b90b",
            }}
          >
            {generating ? "⏳ Generating..." : "⚡ Generate Report"}
          </button>
        )}
      </div>

      {/* ── AI MARKET BRIEF ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          <div className="flex items-center gap-2">
            <span className="text-xs">🧠</span>
            <span className="text-[13px] font-bold text-white">AI Market Brief</span>
            {brief && (
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full" style={{ background: "rgba(0,229,160,.1)", color: "#00e5a0" }}>
                {brief.session.toUpperCase()} · {brief.report_date}
              </span>
            )}
            {briefStale && (
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full" style={{ background: "rgba(240,185,11,.1)", color: "#f0b90b" }}>
                YESTERDAY
              </span>
            )}
          </div>
        </div>

        {briefLoading ? (
          <div className="py-12 text-center">
            <div className="text-xl mb-2">◌</div>
            <div className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>Loading brief...</div>
          </div>
        ) : !brief ? (
          <div className="py-12 text-center">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm font-semibold text-white mb-1">No Brief Available</div>
            <div className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>
              {isPaid ? "Click 'Generate Report' to create one" : "AI briefs are generated 2x daily"}
            </div>
          </div>
        ) : !isPaid ? (
          /* ── LOCKED STATE FOR FREE USERS ── */
          <div className="relative">
            <div className="px-4 py-4" style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none" }}>
              <p className="text-sm text-white/50">{brief.summary?.slice(0, 100)}...</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {(brief.currencies || []).slice(0, 4).map((c, i) => (
                  <div key={i} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,.03)" }}>
                    <span className="text-sm">{c.flag} {c.code}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: "rgba(10,11,15,.7)", backdropFilter: "blur(2px)" }}>
              <div className="text-3xl mb-3">🔒</div>
              <div className="text-sm font-bold text-white mb-1">Upgrade to Unlock</div>
              <div className="text-[11px] mb-3" style={{ color: "rgba(255,255,255,.4)" }}>
                AI Market Briefs available on Pro & Premium
              </div>
              <a
                href="/pricing"
                className="px-5 py-2 rounded-lg text-xs font-bold no-underline"
                style={{ background: "linear-gradient(135deg, #00e5a0, #00b87d)", color: "#0a0b0f" }}
              >
                Upgrade Now →
              </a>
            </div>
          </div>
        ) : (
          /* ── FULL BRIEF FOR PAID USERS ── */
          <div className="px-4 py-4 space-y-4">
            {/* Summary */}
            <div className="rounded-lg p-3" style={{ background: "rgba(77,160,255,.05)", border: "1px solid rgba(77,160,255,.08)" }}>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: "#4da0ff" }}>MARKET OVERVIEW</div>
              <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,.7)" }}>{brief.summary}</p>
            </div>

            {/* Currency Pulse */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,.3)" }}>
                CURRENCY PULSE
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(brief.currencies || []).map((c, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3 transition-all"
                    style={{ background: dirBg(c.direction), border: `1px solid ${dirColor(c.direction)}18` }}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-base">{c.flag}</span>
                      <span className="text-[13px] font-bold text-white">{c.code}</span>
                    </div>
                    <div className="text-[11px] font-bold mb-1" style={{ color: dirColor(c.direction) }}>
                      {c.direction}
                    </div>
                    {/* Probability bar */}
                    <div className="w-full rounded-full overflow-hidden mb-1.5" style={{ height: 4, background: "rgba(255,255,255,.06)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${c.probability}%`,
                          background: dirColor(c.direction),
                        }}
                      />
                    </div>
                    <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>
                      {c.probability}% confidence
                    </div>
                    <div className="text-[10px] mt-1 leading-snug" style={{ color: "rgba(255,255,255,.4)" }}>
                      {c.reasoning}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pair Implications */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,.3)" }}>
                PAIR IMPLICATIONS
              </div>
              <div className="space-y-1.5">
                {(brief.pair_implications || []).map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}
                  >
                    <span className="text-[13px] font-bold font-mono w-20" style={{ color: "rgba(255,255,255,.7)" }}>
                      {p.pair}
                    </span>
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{ background: pairColor(p.direction) + "15", color: pairColor(p.direction) }}
                    >
                      {p.direction} {p.arrow}
                    </span>
                    <span className="text-[10px] flex-1" style={{ color: "rgba(255,255,255,.35)" }}>
                      {p.reasoning}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <div className="text-[9px] font-mono text-center pt-2" style={{ color: "rgba(255,255,255,.15)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
              AI analysis for educational purposes only. Not financial advice. Always do your own research.
            </div>
          </div>
        )}
      </div>

      {/* ── ECONOMIC CALENDAR ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          <div className="flex items-center gap-2">
            <span className="text-xs">📅</span>
            <span className="text-[13px] font-bold text-white">Economic Calendar</span>
          </div>
          <div className="flex gap-1">
            {(["today", "tomorrow", "week"] as const).map(r => (
              <button
                key={r}
                onClick={() => setCalRange(r)}
                className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold capitalize cursor-pointer"
                style={{
                  background: calRange === r ? "rgba(0,229,160,.12)" : "transparent",
                  border: calRange === r ? "1px solid rgba(0,229,160,.2)" : "1px solid transparent",
                  color: calRange === r ? "#00e5a0" : "rgba(255,255,255,.3)",
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="text-xl mb-2">◌</div>
            <div className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>Loading events...</div>
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-2xl mb-2">📅</div>
            <div className="text-sm font-semibold text-white mb-1">No Events</div>
            <div className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>No events scheduled for this period</div>
          </div>
        ) : (
          <div>
            {Object.entries(eventsByDate).map(([date, dayEvents]) => (
              <div key={date}>
                {/* Date header */}
                <div className="px-4 py-2" style={{ background: "rgba(255,255,255,.02)", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span className="text-[11px] font-mono font-bold" style={{ color: "rgba(255,255,255,.5)" }}>
                    {formatDate(date)}
                  </span>
                  <span className="text-[10px] font-mono ml-2" style={{ color: "rgba(255,255,255,.2)" }}>
                    {dayEvents.length} events
                  </span>
                </div>

                {/* Events */}
                {dayEvents.map((ev) => {
                  const imp = IMPACT_COLORS[ev.impact] || IMPACT_COLORS.low;
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[.02] transition-colors"
                      style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}
                    >
                      {/* Time */}
                      <span className="text-[11px] font-mono w-12 flex-shrink-0" style={{ color: "rgba(255,255,255,.3)" }}>
                        {ev.event_time || "—"}
                      </span>

                      {/* Impact dot */}
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: imp.dot }} />

                      {/* Flag */}
                      <span className="text-sm flex-shrink-0">{ev.flag || FLAGS[ev.country] || "🏳️"}</span>

                      {/* Event name */}
                      <span className="text-[12px] font-semibold flex-1" style={{ color: "rgba(255,255,255,.7)" }}>
                        {ev.event_name}
                      </span>

                      {/* Values */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-center w-14">
                          <div className="text-[8px] font-mono uppercase" style={{ color: "rgba(255,255,255,.2)" }}>Prev</div>
                          <div className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{ev.previous || "—"}</div>
                        </div>
                        <div className="text-center w-14">
                          <div className="text-[8px] font-mono uppercase" style={{ color: "rgba(255,255,255,.2)" }}>Fcst</div>
                          <div className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{ev.forecast || "—"}</div>
                        </div>
                        <div className="text-center w-14">
                          <div className="text-[8px] font-mono uppercase" style={{ color: "rgba(255,255,255,.2)" }}>Act</div>
                          <div className="text-[11px] font-mono font-bold" style={{ color: ev.actual ? "#fff" : "rgba(255,255,255,.2)" }}>
                            {ev.actual || "—"}
                          </div>
                        </div>
                      </div>

                      {/* Impact badge */}
                      <span
                        className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded flex-shrink-0"
                        style={{ background: imp.bg, color: imp.text }}
                      >
                        {ev.impact}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Impact legend */}
      <div className="flex items-center justify-center gap-5 text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#ff4d6a" }} /> High Impact</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#f0b90b" }} /> Medium</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#00e5a0" }} /> Low</span>
      </div>
    </div>
  );
}
