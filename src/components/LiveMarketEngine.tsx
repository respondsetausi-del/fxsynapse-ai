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

// ============================================================
// TYPES
// ============================================================

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
  change: number;
  changePercent: number;
  lastUpdate: number;
}

interface LiveMarketEngineProps {
  userTier: "free" | "pro" | "premium";
}

// ============================================================
// COMPONENT
// ============================================================

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
  const [timeframe, setTimeframe] = useState("D");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"indicators" | "signals" | "conditions">("indicators");
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pricesRef = useRef<Record<string, { bid: number; ask: number; prevClose: number }>>({});
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Max watchlist based on tier
  const maxWatchlist = userTier === "free" ? 3 : userTier === "pro" ? 10 : 30;

  // Load available pairs
  useEffect(() => {
    fetch("/api/market/symbols")
      .then(r => r.json())
      .then(d => setAllPairs(d.symbols || []))
      .catch(() => {});
  }, []);

  // Load saved watchlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("fxs_watchlist");
    if (saved) {
      try {
        const pairs = JSON.parse(saved) as string[];
        const initial = pairs.map(symbol => ({
          symbol,
          display: symbol.replace("OANDA:", "").replace("_", "/"),
          bid: null, ask: null, change: 0, changePercent: 0, lastUpdate: 0,
        }));
        setWatchlist(initial);
        if (initial.length > 0) setSelectedPair(initial[0].symbol);
      } catch { }
    } else {
      // Default watchlist
      const defaults = ["OANDA:EUR_USD", "OANDA:GBP_USD", "OANDA:USD_JPY"];
      const initial = defaults.map(symbol => ({
        symbol,
        display: symbol.replace("OANDA:", "").replace("_", "/"),
        bid: null, ask: null, change: 0, changePercent: 0, lastUpdate: 0,
      }));
      setWatchlist(initial);
      setSelectedPair(defaults[0]);
    }
  }, []);

  // Save watchlist to localStorage
  useEffect(() => {
    if (watchlist.length > 0) {
      localStorage.setItem("fxs_watchlist", JSON.stringify(watchlist.map(w => w.symbol)));
    }
  }, [watchlist]);

  // Poll live prices using quotes endpoint
  useEffect(() => {
    if (watchlist.length === 0) return;

    const pollPrices = async () => {
      try {
        // Single API call gets all forex rates
        const res = await fetch("/api/market/quotes");
        const data = await res.json();
        if (data.pairs) {
          for (const pair of watchlist) {
            const quote = data.pairs[pair.symbol];
            if (quote) {
              pricesRef.current[pair.symbol] = {
                bid: quote.bid,
                ask: quote.ask,
                prevClose: quote.bid * (1 - (quote.change || 0) / 100),
              };
            }
          }
          updateWatchlistPrices();
        }
      } catch {}

      // Also fetch daily candles for change calculation
      for (const pair of watchlist) {
        if (pricesRef.current[pair.symbol]?.bid) continue; // Already have data
        try {
          const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(pair.symbol)}&resolution=D&count=2`);
          const data = await res.json();
          if (data.candles && data.candles.length >= 1) {
            const curr = data.candles[data.candles.length - 1];
            const prev = data.candles.length >= 2 ? data.candles[data.candles.length - 2] : curr;
            pricesRef.current[pair.symbol] = {
              bid: curr.close,
              ask: curr.close * 1.00005,
              prevClose: prev.close,
            };
          }
        } catch {}
      }
      updateWatchlistPrices();
    };

    pollPrices();
    const interval = setInterval(pollPrices, 30000);
    setWsConnected(true);

    return () => {
      clearInterval(interval);
      setWsConnected(false);
    };
  }, [watchlist.map(w => w.symbol).join(",")]);

  const updateWatchlistPrices = useCallback(() => {
    setWatchlist(prev => prev.map(pair => {
      const price = pricesRef.current[pair.symbol];
      if (!price) return pair;
      const change = price.bid - price.prevClose;
      const changePercent = price.prevClose > 0 ? (change / price.prevClose) * 100 : 0;
      return {
        ...pair,
        bid: price.bid,
        ask: price.ask,
        change,
        changePercent,
        lastUpdate: Date.now(),
      };
    }));
  }, []);

  // Fetch candles when selected pair or timeframe changes
  useEffect(() => {
    if (!selectedPair) return;
    setLoading(true);
    fetch(`/api/market/candles?symbol=${encodeURIComponent(selectedPair)}&resolution=${timeframe}&count=200`)
      .then(r => r.json())
      .then(data => {
        if (data.candles) {
          setCandles(data.candles);
          const s = calculateSummary(data.candles);
          setSummary(s);
          const newSignals = detectSignals(
            selectedPair.replace("OANDA:", "").replace("_", "/"),
            data.candles,
            conditions
          );
          if (newSignals.length > 0) {
            setSignals(newSignals);
            setSignalHistory(prev => [...newSignals, ...prev].slice(0, 50));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedPair, timeframe, conditions]);

  // Draw mini chart
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;
    drawChart(chartRef.current, candles);
  }, [candles]);

  const addPair = (pair: PairInfo) => {
    if (watchlist.length >= maxWatchlist) return;
    if (watchlist.find(w => w.symbol === pair.symbol)) return;
    setWatchlist(prev => [...prev, {
      symbol: pair.symbol,
      display: pair.display,
      bid: null, ask: null, change: 0, changePercent: 0, lastUpdate: 0,
    }]);
    setShowAddPair(false);
    setSearchQuery("");
  };

  const removePair = (symbol: string) => {
    setWatchlist(prev => prev.filter(w => w.symbol !== symbol));
    if (selectedPair === symbol) {
      setSelectedPair(watchlist.find(w => w.symbol !== symbol)?.symbol || null);
    }
  };

  const toggleCondition = (id: string) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const filteredPairs = allPairs.filter(p =>
    !watchlist.find(w => w.symbol === p.symbol) &&
    (p.display.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.base.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.quote.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedDisplay = selectedPair?.replace("OANDA:", "").replace("_", "/") || "";
  const selectedPrice = watchlist.find(w => w.symbol === selectedPair);

  const formatPrice = (price: number | null, pair: string) => {
    if (price === null) return "—";
    if (pair.includes("JPY")) return price.toFixed(3);
    if (pair.includes("XAU")) return price.toFixed(2);
    return price.toFixed(5);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
          <span className="text-xs text-zinc-500 font-mono">{wsConnected ? "LIVE" : "OFFLINE"}</span>
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-[10px] text-zinc-600 mr-1">TF:</span>
          {[
            { key: "D", label: "1D" },
          ].map(tf => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`px-3 py-1 text-xs font-mono rounded ${timeframe === tf.key
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-zinc-500 hover:text-zinc-300 border border-zinc-800"}`}
            >
              {tf.label}
            </button>
          ))}
          <span className="text-[9px] text-zinc-600 ml-2">Daily • ECB Data</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT: Watchlist */}
        <div className="lg:col-span-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Watchlist</h3>
            <button
              onClick={() => setShowAddPair(!showAddPair)}
              className="text-xs text-emerald-400 hover:text-emerald-300"
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

          {/* Watchlist pairs */}
          <div className="space-y-1">
            {watchlist.map(pair => (
              <button
                key={pair.symbol}
                onClick={() => setSelectedPair(pair.symbol)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all group ${selectedPair === pair.symbol
                  ? "bg-zinc-800/80 border border-zinc-600"
                  : "bg-zinc-900/40 border border-transparent hover:bg-zinc-800/40 hover:border-zinc-700"}`}
              >
                <div>
                  <span className="text-sm font-mono font-bold text-white">{pair.display}</span>
                  <div className="text-xs font-mono text-zinc-400">
                    {pair.bid !== null ? formatPrice(pair.bid, pair.display) : "Loading..."}
                  </div>
                </div>
                <div className="text-right">
                  {pair.bid !== null && (
                    <span className={`text-xs font-mono font-bold ${pair.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {pair.changePercent >= 0 ? "+" : ""}{pair.changePercent.toFixed(2)}%
                    </span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); removePair(pair.symbol); }}
                    className="block text-xs text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition ml-auto"
                  >
                    ✕
                  </button>
                </div>
              </button>
            ))}
          </div>

          {/* Signals Feed */}
          <div className="mt-4">
            <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Recent Signals</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {signalHistory.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">No signals yet — monitoring...</p>
              ) : signalHistory.slice(0, 10).map((sig, i) => (
                <div key={`${sig.id}-${i}`} className={`px-2 py-1.5 rounded text-xs border ${sig.type === "buy"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold">{sig.type === "buy" ? "▲ BUY" : "▼ SELL"}</span>
                    <span className="font-mono">{sig.pair}</span>
                  </div>
                  <div className="text-[10px] opacity-70 mt-0.5">{sig.condition}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER: Chart + Indicators */}
        <div className="lg:col-span-9 space-y-4">
          {/* Selected pair header */}
          {selectedPair && selectedPrice && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-mono font-bold text-white">{selectedDisplay}</h2>
                  <span className="text-2xl font-mono text-zinc-300">
                    {selectedPrice.bid !== null ? formatPrice(selectedPrice.bid, selectedDisplay) : "—"}
                  </span>
                  {selectedPrice.bid !== null && (
                    <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${selectedPrice.changePercent >= 0
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"}`}>
                      {selectedPrice.changePercent >= 0 ? "▲" : "▼"} {Math.abs(selectedPrice.changePercent).toFixed(2)}%
                    </span>
                  )}
                </div>
                {summary && (
                  <div className={`px-4 py-2 rounded-lg text-sm font-bold ${
                    summary.overallBias === "strong_buy" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                    summary.overallBias === "buy" ? "bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20" :
                    summary.overallBias === "strong_sell" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                    summary.overallBias === "sell" ? "bg-red-500/10 text-red-400/80 border border-red-500/20" :
                    "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }`}>
                    {summary.overallBias.replace("_", " ").toUpperCase()}
                    <span className="ml-2 text-xs opacity-60">
                      ({summary.buyScore}B / {summary.sellScore}S)
                    </span>
                  </div>
                )}
              </div>

              {/* Mini Chart */}
              <canvas
                ref={chartRef}
                width={900}
                height={200}
                className="w-full h-[200px] rounded-lg bg-zinc-950/50 border border-zinc-800"
              />
            </div>
          )}

          {/* Tab Nav */}
          <div className="flex gap-1 border-b border-zinc-800">
            {(["indicators", "signals", "conditions"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-wider border-b-2 transition ${activeTab === tab
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
              >
                {tab === "indicators" ? "📊 Indicators" : tab === "signals" ? "🔔 Active Signals" : "⚙️ Conditions"}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "indicators" && summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* RSI */}
              <IndicatorCard
                name="RSI (14)"
                value={summary.rsi?.toFixed(1) || "—"}
                status={summary.rsiSignal}
                color={summary.rsiSignal === "overbought" ? "red" : summary.rsiSignal === "oversold" ? "green" : "gray"}
                detail={summary.rsiSignal === "overbought" ? "Overbought zone" : summary.rsiSignal === "oversold" ? "Oversold zone" : "Neutral range"}
              />
              {/* SMA 20 */}
              <IndicatorCard
                name="SMA (20)"
                value={summary.sma20 ? formatPrice(summary.sma20, selectedDisplay) : "—"}
                status={selectedPrice?.bid && summary.sma20 ? (selectedPrice.bid > summary.sma20 ? "above" : "below") : "neutral"}
                color={selectedPrice?.bid && summary.sma20 ? (selectedPrice.bid > summary.sma20 ? "green" : "red") : "gray"}
                detail={selectedPrice?.bid && summary.sma20 ? (selectedPrice.bid > summary.sma20 ? "Price above — Bullish" : "Price below — Bearish") : ""}
              />
              {/* SMA 50 */}
              <IndicatorCard
                name="SMA (50)"
                value={summary.sma50 ? formatPrice(summary.sma50, selectedDisplay) : "—"}
                status={selectedPrice?.bid && summary.sma50 ? (selectedPrice.bid > summary.sma50 ? "above" : "below") : "neutral"}
                color={selectedPrice?.bid && summary.sma50 ? (selectedPrice.bid > summary.sma50 ? "green" : "red") : "gray"}
                detail={selectedPrice?.bid && summary.sma50 ? (selectedPrice.bid > summary.sma50 ? "Price above — Bullish" : "Price below — Bearish") : ""}
              />
              {/* EMA 20 */}
              <IndicatorCard
                name="EMA (20)"
                value={summary.ema20 ? formatPrice(summary.ema20, selectedDisplay) : "—"}
                status={selectedPrice?.bid && summary.ema20 ? (selectedPrice.bid > summary.ema20 ? "above" : "below") : "neutral"}
                color={selectedPrice?.bid && summary.ema20 ? (selectedPrice.bid > summary.ema20 ? "green" : "red") : "gray"}
                detail="Exponential moving avg"
              />
              {/* MACD */}
              <IndicatorCard
                name="MACD"
                value={summary.macd?.toFixed(5) || "—"}
                status={summary.macdTrend}
                color={summary.macdTrend === "bullish" ? "green" : summary.macdTrend === "bearish" ? "red" : "gray"}
                detail={`Signal: ${summary.macdSignal?.toFixed(5) || "—"} | Hist: ${summary.macdHistogram?.toFixed(5) || "—"}`}
              />
              {/* Bollinger */}
              <IndicatorCard
                name="Bollinger Bands"
                value={summary.bbPosition.toUpperCase()}
                status={summary.bbPosition}
                color={summary.bbPosition === "below" ? "green" : summary.bbPosition === "above" ? "red" : "gray"}
                detail={`U: ${summary.bbUpper ? formatPrice(summary.bbUpper, selectedDisplay) : "—"} | L: ${summary.bbLower ? formatPrice(summary.bbLower, selectedDisplay) : "—"}`}
              />
              {/* ATR */}
              <IndicatorCard
                name="ATR (14)"
                value={summary.atr?.toFixed(5) || "—"}
                status="neutral"
                color="blue"
                detail="Avg daily volatility"
              />
              {/* Stochastic */}
              <IndicatorCard
                name="Stochastic"
                value={summary.stochK ? `%K: ${summary.stochK.toFixed(1)}` : "—"}
                status={summary.stochK ? (summary.stochK < 20 ? "oversold" : summary.stochK > 80 ? "overbought" : "neutral") : "neutral"}
                color={summary.stochK ? (summary.stochK < 20 ? "green" : summary.stochK > 80 ? "red" : "gray") : "gray"}
                detail={`%D: ${summary.stochD?.toFixed(1) || "—"}`}
              />
            </div>
          )}

          {activeTab === "indicators" && !summary && (
            <div className="text-center py-12 text-zinc-500">
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span>Calculating indicators...</span>
                </div>
              ) : "Select a pair to view indicators"}
            </div>
          )}

          {activeTab === "signals" && (
            <div className="space-y-2">
              {signals.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <p className="text-4xl mb-2">📡</p>
                  <p>No active signals — monitoring {watchlist.length} pairs</p>
                  <p className="text-xs mt-1">Signals fire when indicator conditions are met on the latest candle</p>
                </div>
              ) : signals.map((sig, i) => (
                <div key={i} className={`p-4 rounded-lg border ${sig.type === "buy"
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-red-500/5 border-red-500/20"}`}>
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
                      <div className="text-xs text-zinc-500">{new Date(sig.time * 1000).toLocaleTimeString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "conditions" && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 mb-3">Toggle conditions on/off to control when signals fire. Active conditions are checked on each candle close.</p>
              {conditions.map(cond => (
                <div key={cond.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/40 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleCondition(cond.id)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${cond.enabled ? "bg-emerald-500" : "bg-zinc-700"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${cond.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                    <div>
                      <span className="text-sm text-white font-medium">{cond.name}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${cond.type === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {cond.type.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-zinc-500">
                    {cond.indicator} {cond.condition.replace(/_/g, " ")} {cond.value}
                  </span>
                </div>
              ))}

              {userTier === "free" && (
                <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-amber-400 text-sm font-medium">🔒 Upgrade to Pro for custom conditions</p>
                  <p className="text-xs text-zinc-500 mt-1">Free tier uses default signal conditions only</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function IndicatorCard({ name, value, status, color, detail }: {
  name: string;
  value: string;
  status: string;
  color: "green" | "red" | "gray" | "blue";
  detail: string;
}) {
  const colors = {
    green: "border-emerald-500/30 bg-emerald-500/5",
    red: "border-red-500/30 bg-red-500/5",
    gray: "border-zinc-700 bg-zinc-900/40",
    blue: "border-blue-500/30 bg-blue-500/5",
  };
  const textColors = {
    green: "text-emerald-400",
    red: "text-red-400",
    gray: "text-zinc-400",
    blue: "text-blue-400",
  };

  return (
    <div className={`p-3 rounded-lg border ${colors[color]}`}>
      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">{name}</div>
      <div className={`text-lg font-mono font-bold ${textColors[color]}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 mt-1">{detail}</div>
    </div>
  );
}

// ============================================================
// CHART DRAWING
// ============================================================

function drawChart(canvas: HTMLCanvasElement, candles: Candle[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 10, right: 60, bottom: 20, left: 10 };

  ctx.clearRect(0, 0, w, h);

  if (candles.length === 0) return;

  // Use last 100 candles for display
  const display = candles.slice(-100);
  const highs = display.map(c => c.high);
  const lows = display.map(c => c.low);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const priceRange = maxPrice - minPrice || 1;

  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const barWidth = chartW / display.length;

  const toX = (i: number) => padding.left + i * barWidth + barWidth / 2;
  const toY = (price: number) => padding.top + (1 - (price - minPrice) / priceRange) * chartH;

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    const price = maxPrice - (i / 4) * priceRange;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText(price.toFixed(price > 100 ? 2 : 5), w - padding.right + 4, y + 3);
  }

  // Candlesticks
  for (let i = 0; i < display.length; i++) {
    const c = display[i];
    const x = toX(i);
    const bullish = c.close >= c.open;

    // Wick
    ctx.strokeStyle = bullish ? "#10b981" : "#ef4444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, toY(c.high));
    ctx.lineTo(x, toY(c.low));
    ctx.stroke();

    // Body
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBottom = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(bodyBottom - bodyTop, 1);

    ctx.fillStyle = bullish ? "#10b981" : "#ef4444";
    ctx.fillRect(x - barWidth * 0.35, bodyTop, barWidth * 0.7, bodyH);
  }

  // Current price line
  const lastPrice = display[display.length - 1].close;
  const lastY = toY(lastPrice);
  ctx.strokeStyle = "rgba(16,185,129,0.5)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, lastY);
  ctx.lineTo(w - padding.right, lastY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price label
  ctx.fillStyle = "#10b981";
  ctx.fillRect(w - padding.right, lastY - 8, 55, 16);
  ctx.fillStyle = "#000";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "left";
  ctx.fillText(lastPrice.toFixed(lastPrice > 100 ? 2 : 5), w - padding.right + 3, lastY + 3);
}
