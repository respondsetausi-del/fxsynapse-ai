"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  calculateSummary,
  detectSignals,
  DEFAULT_SIGNAL_CONDITIONS,
  type Candle,
  type Signal,
  type SignalCondition,
  type IndicatorSummary,
} from "@/lib/indicators";

interface PairInfo {
  symbol: string;
  display: string;
  base: string;
  quote: string;
  category: string;
  popular: boolean;
}

interface WatchedPair {
  symbol: string;
  display: string;
  bid: number | null;
  ask: number | null;
  prevBid: number | null;
  flash: "up" | "down" | null;
  change: number;
  changePercent: number;
  lastUpdate: number;
}

interface LiveMarketEngineProps {
  userTier: "free" | "pro" | "premium";
}

const TIMEFRAMES = [
  { key: "1min", label: "1M", intraday: true },
  { key: "5min", label: "5M", intraday: true },
  { key: "15min", label: "15M", intraday: true },
  { key: "1h", label: "1H", intraday: true },
  { key: "D", label: "1D", intraday: false },
];

export default function LiveMarketEngine({ userTier }: LiveMarketEngineProps) {
  const [allPairs, setAllPairs] = useState<PairInfo[]>([]);
  const [watchlist, setWatchlist] = useState<WatchedPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [showAddPair, setShowAddPair] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [summary, setSummary] = useState<IndicatorSummary | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalHistory, setSignalHistory] = useState<Signal[]>([]);
  const [conditions, setConditions] = useState<SignalCondition[]>(DEFAULT_SIGNAL_CONDITIONS);
  const [timeframe, setTimeframe] = useState("1h");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"indicators" | "signals" | "conditions">("indicators");
  const [dataSource, setDataSource] = useState<string>("");
  const [lastPriceUpdate, setLastPriceUpdate] = useState(0);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxWatchlist = userTier === "free" ? 3 : userTier === "pro" ? 10 : 30;

  // Load available pairs
  useEffect(() => {
    fetch("/api/market/symbols")
      .then(r => r.json())
      .then(d => setAllPairs(d.symbols || []))
      .catch(() => {});
  }, []);

  // Load saved watchlist
  useEffect(() => {
    const saved = localStorage.getItem("fxs_watchlist");
    const defaults = ["OANDA:EUR_USD", "OANDA:GBP_USD", "OANDA:USD_JPY"];
    const pairs = saved ? JSON.parse(saved) : defaults;
    const initial = pairs.map((symbol: string) => ({
      symbol,
      display: symbol.replace("OANDA:", "").replace("_", "/"),
      bid: null, ask: null, prevBid: null, flash: null,
      change: 0, changePercent: 0, lastUpdate: 0,
    }));
    setWatchlist(initial);
    if (initial.length > 0) setSelectedPair(initial[0].symbol);
  }, []);

  // Save watchlist
  useEffect(() => {
    if (watchlist.length > 0) {
      localStorage.setItem("fxs_watchlist", JSON.stringify(watchlist.map(w => w.symbol)));
    }
  }, [watchlist]);

  // ═══ REAL-TIME PRICE POLLING ═══
  useEffect(() => {
    if (watchlist.length === 0) return;

    const pollPrices = async () => {
      try {
        const symbolsParam = watchlist.map(w => w.symbol).join(",");
        const res = await fetch(`/api/market/quotes?symbols=${encodeURIComponent(symbolsParam)}`);
        const data = await res.json();

        if (data.pairs) {
          setDataSource(data.source || "unknown");
          setLastPriceUpdate(Date.now());

          setWatchlist(prev => prev.map(pair => {
            const quote = data.pairs[pair.symbol];
            if (!quote) return pair;

            const newBid = quote.bid;
            const flash: "up" | "down" | null =
              pair.bid !== null && newBid !== pair.bid
                ? (newBid > pair.bid ? "up" : "down")
                : null;

            // Calculate change from first candle of day (approximate)
            const openEstimate = newBid / (1 + pair.changePercent / 100) || newBid;

            return {
              ...pair,
              prevBid: pair.bid,
              bid: newBid,
              ask: quote.ask,
              flash,
              change: pair.change || 0,
              changePercent: pair.changePercent || 0,
              lastUpdate: Date.now(),
            };
          }));

          // Clear flash after 500ms
          setTimeout(() => {
            setWatchlist(prev => prev.map(p => ({ ...p, flash: null })));
          }, 500);
        }
      } catch {}
    };

    pollPrices();
    // Poll every 10 seconds (within Twelve Data's 8 credits/min)
    pollRef.current = setInterval(pollPrices, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [watchlist.map(w => w.symbol).join(",")]);

  // ═══ FETCH CANDLES ON PAIR/TIMEFRAME CHANGE ═══
  useEffect(() => {
    if (!selectedPair) return;
    setLoading(true);

    fetch(`/api/market/candles?symbol=${encodeURIComponent(selectedPair)}&resolution=${timeframe}&count=200`)
      .then(r => r.json())
      .then(data => {
        if (data.candles && data.candles.length > 0) {
          setCandles(data.candles);
          const s = calculateSummary(data.candles);
          setSummary(s);

          const pairDisplay = selectedPair.replace("OANDA:", "").replace("_", "/");
          const newSignals = detectSignals(pairDisplay, data.candles, conditions);
          setSignals(newSignals);
          if (newSignals.length > 0) {
            setSignalHistory(prev => [...newSignals, ...prev].slice(0, 50));
          }

          if (data.note) setDataSource(prev => prev + ` (${data.note})`);
        } else {
          setCandles([]);
          setSummary(null);
          setSignals([]);
        }
      })
      .catch(() => { setCandles([]); setSummary(null); })
      .finally(() => setLoading(false));
  }, [selectedPair, timeframe, conditions]);

  // ═══ DRAW CHART ═══
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;
    drawChart(chartRef.current, candles, watchlist.find(w => w.symbol === selectedPair)?.bid || null);
  }, [candles, watchlist.find(w => w.symbol === selectedPair)?.bid]);

  const addPair = (pair: PairInfo) => {
    if (watchlist.length >= maxWatchlist || watchlist.find(w => w.symbol === pair.symbol)) return;
    const newPair: WatchedPair = {
      symbol: pair.symbol, display: pair.display,
      bid: null, ask: null, prevBid: null, flash: null,
      change: 0, changePercent: 0, lastUpdate: 0,
    };
    setWatchlist(prev => [...prev, newPair]);
    setShowAddPair(false);
    setSearchQuery("");
  };

  const removePair = (symbol: string) => {
    setWatchlist(prev => prev.filter(w => w.symbol !== symbol));
    if (selectedPair === symbol) {
      const remaining = watchlist.filter(w => w.symbol !== symbol);
      setSelectedPair(remaining[0]?.symbol || null);
    }
  };

  const toggleCondition = (id: string) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const filteredPairs = allPairs.filter(p =>
    !watchlist.find(w => w.symbol === p.symbol) &&
    (p.display.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.base.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedDisplay = selectedPair?.replace("OANDA:", "").replace("_", "/") || "";
  const selectedPrice = watchlist.find(w => w.symbol === selectedPair);

  const formatPrice = (price: number | null, pair: string) => {
    if (price === null) return "—";
    if (pair.includes("JPY") || pair.includes("ZAR") || pair.includes("MXN") || pair.includes("TRY")) return price.toFixed(3);
    return price.toFixed(5);
  };

  const timeSince = (ts: number) => {
    if (!ts) return "";
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  };

  return (
    <div className="space-y-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-zinc-500 font-mono">
              LIVE • {dataSource.toUpperCase()} • {timeSince(lastPriceUpdate)}
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${timeframe === tf.key
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-600"}`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ═══ LEFT: WATCHLIST ═══ */}
        <div className="lg:col-span-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Watchlist</h3>
            <button
              onClick={() => setShowAddPair(!showAddPair)}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition"
              disabled={watchlist.length >= maxWatchlist}
            >
              + Add ({watchlist.length}/{maxWatchlist})
            </button>
          </div>

          {showAddPair && (
            <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-2 space-y-2">
              <input
                type="text"
                placeholder="Search pairs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-emerald-500/50"
              />
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {filteredPairs.slice(0, 15).map(pair => (
                  <button
                    key={pair.symbol}
                    onClick={() => addPair(pair)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-zinc-800 text-left"
                  >
                    <span className="text-white font-mono">{pair.display}</span>
                    <span className="text-zinc-500">{pair.category}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            {watchlist.map(pair => (
              <button
                key={pair.symbol}
                onClick={() => setSelectedPair(pair.symbol)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all group ${
                  pair.flash === "up" ? "bg-emerald-500/10" :
                  pair.flash === "down" ? "bg-red-500/10" :
                  selectedPair === pair.symbol
                    ? "bg-zinc-800/80 border border-zinc-600"
                    : "bg-zinc-900/40 border border-transparent hover:bg-zinc-800/40 hover:border-zinc-700"
                } ${selectedPair !== pair.symbol ? "border" : ""}`}
              >
                <div>
                  <span className="text-sm font-mono font-bold text-white">{pair.display}</span>
                  <div className={`text-xs font-mono transition-colors ${
                    pair.flash === "up" ? "text-emerald-400" :
                    pair.flash === "down" ? "text-red-400" :
                    "text-zinc-400"
                  }`}>
                    {pair.bid !== null ? formatPrice(pair.bid, pair.display) : (
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 border border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
                        Loading
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  {pair.bid !== null && (
                    <span className="text-[10px] font-mono text-zinc-500">
                      Spd: {pair.ask && pair.bid ? ((pair.ask - pair.bid) * (pair.display.includes("JPY") ? 100 : 100000)).toFixed(1) : "—"}
                    </span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); removePair(pair.symbol); }}
                    className="text-xs text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                  >
                    ✕
                  </button>
                </div>
              </button>
            ))}
          </div>

          {/* Signal Feed */}
          <div className="mt-4">
            <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Signal Feed</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {signalHistory.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">Monitoring {watchlist.length} pairs...</p>
              ) : signalHistory.slice(0, 10).map((sig, i) => (
                <div key={`${sig.id}-${i}`} className={`px-2 py-1.5 rounded text-xs border ${sig.type === "buy"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold">{sig.type === "buy" ? "▲" : "▼"}</span>
                    <span className="font-mono">{sig.pair}</span>
                    <span className="text-[10px] opacity-60">{formatPrice(sig.price, sig.pair)}</span>
                  </div>
                  <div className="text-[10px] opacity-60 mt-0.5 truncate">{sig.condition}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ CENTER + RIGHT: CHART & DATA ═══ */}
        <div className="lg:col-span-9 space-y-3">
          {/* Price Header */}
          {selectedPair && selectedPrice && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-mono font-bold text-white">{selectedDisplay}</h2>
                  <span className={`text-2xl font-mono transition-colors ${
                    selectedPrice.flash === "up" ? "text-emerald-400" :
                    selectedPrice.flash === "down" ? "text-red-400" :
                    "text-zinc-200"
                  }`}>
                    {selectedPrice.bid !== null ? formatPrice(selectedPrice.bid, selectedDisplay) : "—"}
                  </span>
                  {selectedPrice.bid && selectedPrice.ask && (
                    <span className="text-xs text-zinc-500 font-mono">
                      Ask: {formatPrice(selectedPrice.ask, selectedDisplay)}
                    </span>
                  )}
                </div>
                {summary && (
                  <div className={`px-4 py-2 rounded-lg text-sm font-bold border ${
                    summary.overallBias === "strong_buy" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                    summary.overallBias === "buy" ? "bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20" :
                    summary.overallBias === "strong_sell" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                    summary.overallBias === "sell" ? "bg-red-500/10 text-red-400/80 border-red-500/20" :
                    "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}>
                    {summary.overallBias.replace("_", " ").toUpperCase()}
                    <span className="ml-2 text-xs opacity-60">({summary.buyScore}B/{summary.sellScore}S)</span>
                  </div>
                )}
              </div>

              {/* Chart */}
              {loading ? (
                <div className="w-full h-[220px] rounded-lg bg-zinc-950/50 border border-zinc-800 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-zinc-500 text-sm">
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    Loading {selectedDisplay} candles...
                  </div>
                </div>
              ) : candles.length > 0 ? (
                <canvas
                  ref={chartRef}
                  width={900}
                  height={220}
                  className="w-full h-[220px] rounded-lg bg-zinc-950/50 border border-zinc-800 cursor-crosshair"
                />
              ) : (
                <div className="w-full h-[220px] rounded-lg bg-zinc-950/50 border border-zinc-800 flex items-center justify-center">
                  <div className="text-center text-zinc-500 text-sm">
                    <p>No candle data available</p>
                    <p className="text-xs mt-1">Try a different timeframe or check if markets are open</p>
                  </div>
                </div>
              )}

              {candles.length > 0 && (
                <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-600 font-mono">
                  <span>{candles.length} candles • {timeframe.toUpperCase()}</span>
                  <span>O: {candles[candles.length-1]?.open.toFixed(5)} H: {candles[candles.length-1]?.high.toFixed(5)} L: {candles[candles.length-1]?.low.toFixed(5)} C: {candles[candles.length-1]?.close.toFixed(5)}</span>
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-zinc-800">
            {(["indicators", "signals", "conditions"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition ${activeTab === tab
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
              >
                {tab === "indicators" ? "📊 Indicators" : tab === "signals" ? `🔔 Signals (${signals.length})` : "⚙️ Conditions"}
              </button>
            ))}
          </div>

          {/* INDICATORS TAB */}
          {activeTab === "indicators" && summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <IndCard name="RSI (14)" value={summary.rsi?.toFixed(1) || "—"}
                color={summary.rsiSignal === "overbought" ? "red" : summary.rsiSignal === "oversold" ? "green" : "gray"}
                detail={summary.rsiSignal === "overbought" ? "Overbought > 70" : summary.rsiSignal === "oversold" ? "Oversold < 30" : "Neutral"} />
              <IndCard name="SMA (20)" value={summary.sma20 ? formatPrice(summary.sma20, selectedDisplay) : "—"}
                color={selectedPrice?.bid && summary.sma20 ? (selectedPrice.bid > summary.sma20 ? "green" : "red") : "gray"}
                detail={selectedPrice?.bid && summary.sma20 ? (selectedPrice.bid > summary.sma20 ? "Price above • Bullish" : "Price below • Bearish") : ""} />
              <IndCard name="SMA (50)" value={summary.sma50 ? formatPrice(summary.sma50, selectedDisplay) : "—"}
                color={selectedPrice?.bid && summary.sma50 ? (selectedPrice.bid > summary.sma50 ? "green" : "red") : "gray"}
                detail={selectedPrice?.bid && summary.sma50 ? (selectedPrice.bid > summary.sma50 ? "Price above • Bullish" : "Price below • Bearish") : ""} />
              <IndCard name="EMA (20)" value={summary.ema20 ? formatPrice(summary.ema20, selectedDisplay) : "—"}
                color={selectedPrice?.bid && summary.ema20 ? (selectedPrice.bid > summary.ema20 ? "green" : "red") : "gray"}
                detail="Exponential moving avg" />
              <IndCard name="MACD" value={summary.macd?.toFixed(5) || "—"}
                color={summary.macdTrend === "bullish" ? "green" : summary.macdTrend === "bearish" ? "red" : "gray"}
                detail={`Sig: ${summary.macdSignal?.toFixed(5) || "—"} • Hist: ${summary.macdHistogram?.toFixed(5) || "—"}`} />
              <IndCard name="Bollinger" value={summary.bbPosition.toUpperCase()}
                color={summary.bbPosition === "below" ? "green" : summary.bbPosition === "above" ? "red" : "gray"}
                detail={`U: ${summary.bbUpper ? formatPrice(summary.bbUpper, selectedDisplay) : "—"} L: ${summary.bbLower ? formatPrice(summary.bbLower, selectedDisplay) : "—"}`} />
              <IndCard name="ATR (14)" value={summary.atr?.toFixed(5) || "—"} color="blue" detail="Avg volatility" />
              <IndCard name="Stochastic" value={summary.stochK ? `%K: ${summary.stochK.toFixed(1)}` : "—"}
                color={summary.stochK ? (summary.stochK < 20 ? "green" : summary.stochK > 80 ? "red" : "gray") : "gray"}
                detail={`%D: ${summary.stochD?.toFixed(1) || "—"}`} />
            </div>
          )}
          {activeTab === "indicators" && !summary && !loading && (
            <div className="text-center py-12 text-zinc-500">Select a pair to view indicators</div>
          )}

          {/* SIGNALS TAB */}
          {activeTab === "signals" && (
            <div className="space-y-2">
              {signals.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <p className="text-4xl mb-2">📡</p>
                  <p>No active signals on current timeframe</p>
                  <p className="text-xs mt-1">Signals fire when conditions are met on the latest candle close</p>
                </div>
              ) : signals.map((sig, i) => (
                <div key={i} className={`p-4 rounded-lg border ${sig.type === "buy"
                  ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl ${sig.type === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                        {sig.type === "buy" ? "▲" : "▼"}
                      </span>
                      <div>
                        <div className="font-mono font-bold text-white">{sig.pair}</div>
                        <div className="text-xs text-zinc-400">{sig.condition}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-white">{formatPrice(sig.price, sig.pair)}</div>
                      <div className="text-xs text-zinc-500">{new Date(sig.time * 1000).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CONDITIONS TAB */}
          {activeTab === "conditions" && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 mb-3">Toggle which conditions fire signals. Checked on each candle close.</p>
              {conditions.map(cond => (
                <div key={cond.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/40 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleCondition(cond.id)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${cond.enabled ? "bg-emerald-500" : "bg-zinc-700"}`}>
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${cond.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                    <div>
                      <span className="text-sm text-white font-medium">{cond.name}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${cond.type === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {cond.type.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-zinc-500">{cond.indicator} • {cond.value}</span>
                </div>
              ))}
              {userTier === "free" && (
                <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-amber-400 text-sm font-medium">🔒 Custom conditions require Pro</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ INDICATOR CARD ═══
function IndCard({ name, value, color, detail }: {
  name: string; value: string; color: "green" | "red" | "gray" | "blue"; detail: string;
}) {
  const bg = { green: "border-emerald-500/30 bg-emerald-500/5", red: "border-red-500/30 bg-red-500/5",
    gray: "border-zinc-700 bg-zinc-900/40", blue: "border-blue-500/30 bg-blue-500/5" };
  const tx = { green: "text-emerald-400", red: "text-red-400", gray: "text-zinc-400", blue: "text-blue-400" };
  return (
    <div className={`p-3 rounded-lg border ${bg[color]}`}>
      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">{name}</div>
      <div className={`text-lg font-mono font-bold ${tx[color]}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 mt-1 truncate">{detail}</div>
    </div>
  );
}

// ═══ CHART RENDERER ═══
function drawChart(canvas: HTMLCanvasElement, candles: Candle[], livePrice: number | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 10, right: 65, bottom: 20, left: 10 };

  ctx.clearRect(0, 0, w, h);

  const display = candles.slice(-120);
  if (display.length === 0) return;

  const highs = display.map(c => c.high);
  const lows = display.map(c => c.low);
  let maxP = Math.max(...highs);
  let minP = Math.min(...lows);
  if (livePrice) { maxP = Math.max(maxP, livePrice); minP = Math.min(minP, livePrice); }
  const range = maxP - minP || 1;
  const margin = range * 0.05;
  maxP += margin; minP -= margin;
  const pRange = maxP - minP;

  const cW = w - pad.left - pad.right;
  const cH = h - pad.top - pad.bottom;
  const barW = cW / display.length;

  const toX = (i: number) => pad.left + i * barW + barW / 2;
  const toY = (p: number) => pad.top + (1 - (p - minP) / pRange) * cH;

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (i / 5) * cH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    const price = maxP - (i / 5) * pRange;
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText(price.toFixed(price > 100 ? 2 : 5), w - pad.right + 4, y + 3);
  }

  // Candles
  for (let i = 0; i < display.length; i++) {
    const c = display[i];
    const x = toX(i);
    const bull = c.close >= c.open;

    // Wick
    ctx.strokeStyle = bull ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();

    // Body
    const bTop = toY(Math.max(c.open, c.close));
    const bBot = toY(Math.min(c.open, c.close));
    const bH = Math.max(bBot - bTop, 1);
    ctx.fillStyle = bull ? "#10b981" : "#ef4444";
    ctx.globalAlpha = i >= display.length - 3 ? 1 : 0.85;
    ctx.fillRect(x - barW * 0.35, bTop, barW * 0.7, bH);
    ctx.globalAlpha = 1;
  }

  // Live price line
  const priceToShow = livePrice || display[display.length - 1].close;
  const lastY = toY(priceToShow);
  const isUp = display.length >= 2 && display[display.length - 1].close >= display[display.length - 2].close;

  ctx.strokeStyle = isUp ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(pad.left, lastY); ctx.lineTo(w - pad.right, lastY); ctx.stroke();
  ctx.setLineDash([]);

  // Price tag
  const tagColor = isUp ? "#10b981" : "#ef4444";
  ctx.fillStyle = tagColor;
  const tagW = 58;
  ctx.beginPath();
  ctx.moveTo(w - pad.right, lastY);
  ctx.lineTo(w - pad.right + 5, lastY - 8);
  ctx.lineTo(w - pad.right + tagW, lastY - 8);
  ctx.lineTo(w - pad.right + tagW, lastY + 8);
  ctx.lineTo(w - pad.right + 5, lastY + 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "left";
  ctx.fillText(priceToShow.toFixed(priceToShow > 100 ? 2 : 5), w - pad.right + 8, lastY + 3);
}
