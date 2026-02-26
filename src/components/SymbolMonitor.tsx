"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Candle, Signal, SignalCondition, DEFAULT_SIGNAL_CONDITIONS,
  detectSignals, calculateSummary, IndicatorSummary,
  SMA, EMA, RSI, MACD, BollingerBands, ATR, Stochastic,
  detectCandlePatterns, CandlePattern,
} from "@/lib/indicators";

// ═══ Types ═══
interface DerivSymbol {
  symbol: string; display_name: string; market: string;
  market_display_name: string; submarket: string; submarket_display_name: string;
  pip: number; spot: number; spot_time: string; is_trading_suspended: number;
}

interface WatchedSymbol {
  symbol: string; display_name: string; market: string; pip: number;
  bid: number; ask: number; last: number; prev: number;
  high: number; low: number; change: number; changePct: number;
  spread: number; tick_time: string; sub_id: string | null;
  flash: "up" | "down" | null;
  // Indicator state
  indicators: IndicatorConfig[];
  candles: Candle[];
  candle_sub_id: string | null;
  timeframe: number;  // granularity in seconds
  summary: IndicatorSummary | null;
  patterns: CandlePattern[];
}

interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  params: Record<string, number>;
  enabled: boolean;
  currentValue: string; // formatted display value
}

type IndicatorType = "RSI" | "SMA" | "EMA" | "MACD" | "BB" | "STOCH" | "ATR";

type MarketFilter = "all" | "forex" | "commodities" | "cryptocurrency" | "synthetic_index" | "stock_indices";

const MARKET_LABELS: Record<string, string> = { all: "All", forex: "Forex", commodities: "Commodities", cryptocurrency: "Crypto", synthetic_index: "Synthetics", stock_indices: "Indices" };
const MARKET_COLORS: Record<string, string> = { forex: "#00e5a0", commodities: "#f0b90b", cryptocurrency: "#a855f7", synthetic_index: "#4da0ff", stock_indices: "#ff4d6a" };

const TIMEFRAMES = [
  { label: "M1", value: 60 }, { label: "M5", value: 300 }, { label: "M15", value: 900 },
  { label: "M30", value: 1800 }, { label: "H1", value: 3600 }, { label: "H4", value: 14400 }, { label: "D1", value: 86400 },
];

const INDICATOR_DEFS: { type: IndicatorType; label: string; emoji: string; defaultParams: Record<string, number>; paramLabels: Record<string, string> }[] = [
  { type: "RSI",   label: "RSI",        emoji: "📊", defaultParams: { period: 14 }, paramLabels: { period: "Period" } },
  { type: "SMA",   label: "SMA",        emoji: "📈", defaultParams: { period: 20 }, paramLabels: { period: "Period" } },
  { type: "EMA",   label: "EMA",        emoji: "📉", defaultParams: { period: 20 }, paramLabels: { period: "Period" } },
  { type: "MACD",  label: "MACD",       emoji: "〰️", defaultParams: { fast: 12, slow: 26, signal: 9 }, paramLabels: { fast: "Fast", slow: "Slow", signal: "Signal" } },
  { type: "BB",    label: "Bollinger",  emoji: "🔔", defaultParams: { period: 20, stddev: 2 }, paramLabels: { period: "Period", stddev: "Std Dev" } },
  { type: "ATR",   label: "ATR",        emoji: "📏", defaultParams: { period: 14 }, paramLabels: { period: "Period" } },
  { type: "STOCH", label: "Stochastic", emoji: "🔄", defaultParams: { k: 14, d: 3 }, paramLabels: { k: "%K", d: "%D" } },
];

const POPULAR_SYMBOLS = [
  "frxXAUUSD", "frxEURUSD", "frxGBPUSD", "frxUSDJPY", "frxGBPJPY",
  "frxAUDUSD", "frxUSDCAD", "frxEURGBP",
  "cryBTCUSD", "cryETHUSD",
  "R_100", "R_75", "R_50", "1HZ100V",
  "BOOM1000", "CRASH1000",
];

export default function SymbolMonitor() {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [allSymbols, setAllSymbols] = useState<DerivSymbol[]>([]);
  const [watchlist, setWatchlist] = useState<WatchedSymbol[]>([]);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const [signals, setSignals] = useState<(Signal & { display_name: string; timeframe: string })[]>([]);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [addingIndicator, setAddingIndicator] = useState<string | null>(null); // symbol being configured
  const [signalConditions, setSignalConditions] = useState<SignalCondition[]>(DEFAULT_SIGNAL_CONDITIONS);
  const [showSignalConfig, setShowSignalConfig] = useState(false);

  const watchlistRef = useRef<WatchedSymbol[]>([]);
  const flashTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  // ═══ WebSocket Connection ═══
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setWsStatus("connecting");
    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
      // Re-subscribe existing watchlist
      watchlistRef.current.forEach((s) => {
        ws.send(JSON.stringify({ ticks: s.symbol, subscribe: 1 }));
        if (s.indicators.length > 0) {
          ws.send(JSON.stringify({ ticks_history: s.symbol, adjust_start_time: 1, count: 200, end: "latest", granularity: s.timeframe, style: "candles", subscribe: 1 }));
        }
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.msg_type === "active_symbols") {
          setAllSymbols(data.active_symbols || []);
        }

        if (data.msg_type === "tick") {
          const tick = data.tick;
          if (!tick) return;
          setWatchlist((prev) => prev.map((s) => {
            if (s.symbol !== tick.symbol) return s;
            const newPrice = tick.quote;
            const prevPrice = s.last || newPrice;
            const direction: "up" | "down" | null = newPrice > prevPrice ? "up" : newPrice < prevPrice ? "down" : s.flash;
            if (direction && direction !== s.flash) {
              if (flashTimers.current[s.symbol]) clearTimeout(flashTimers.current[s.symbol]);
              flashTimers.current[s.symbol] = setTimeout(() => {
                setWatchlist((p) => p.map((x) => x.symbol === s.symbol ? { ...x, flash: null } : x));
              }, 600);
            }
            return {
              ...s, last: newPrice, prev: prevPrice,
              bid: tick.bid || newPrice, ask: tick.ask || newPrice,
              spread: tick.ask && tick.bid ? parseFloat(((tick.ask - tick.bid) / s.pip).toFixed(1)) : s.spread,
              high: Math.max(s.high || 0, newPrice),
              low: s.low > 0 ? Math.min(s.low, newPrice) : newPrice,
              tick_time: tick.epoch ? new Date(tick.epoch * 1000).toLocaleTimeString() : s.tick_time,
              sub_id: data.subscription?.id || s.sub_id,
              flash: direction,
            };
          }));
        }

        // ═══ Candle history response ═══
        if (data.msg_type === "candles") {
          const symbol = data.echo_req?.ticks_history;
          if (!symbol || !data.candles) return;
          const candles: Candle[] = data.candles.map((c: any) => ({
            time: c.epoch, open: parseFloat(c.open), high: parseFloat(c.high),
            low: parseFloat(c.low), close: parseFloat(c.close), volume: 0,
          }));
          setWatchlist((prev) => prev.map((s) => {
            if (s.symbol !== symbol) return s;
            const updated = { ...s, candles, candle_sub_id: data.subscription?.id || s.candle_sub_id };
            return recalcIndicators(updated);
          }));
        }

        // ═══ New candle (OHLC subscription) ═══
        if (data.msg_type === "ohlc") {
          const ohlc = data.ohlc;
          if (!ohlc) return;
          const symbol = ohlc.symbol;
          setWatchlist((prev) => prev.map((s) => {
            if (s.symbol !== symbol) return s;
            const newCandle: Candle = {
              time: parseInt(ohlc.epoch), open: parseFloat(ohlc.open), high: parseFloat(ohlc.high),
              low: parseFloat(ohlc.low), close: parseFloat(ohlc.close), volume: 0,
            };
            let candles = [...s.candles];
            // Update last candle or append new one
            if (candles.length > 0 && candles[candles.length - 1].time === newCandle.time) {
              candles[candles.length - 1] = newCandle;
            } else {
              candles.push(newCandle);
              if (candles.length > 300) candles = candles.slice(-200);
            }
            const updated = { ...s, candles };
            return recalcIndicators(updated);
          }));
        }

      } catch { /* ignore */ }
    };

    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => { setWsStatus("disconnected"); reconnectTimer.current = setTimeout(connect, 3000); };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close(); wsRef.current = null; setWsStatus("disconnected");
  }, []);

  useEffect(() => { connect(); return () => { if (reconnectTimer.current) clearTimeout(reconnectTimer.current); wsRef.current?.close(); }; }, [connect]);

  // ═══ Recalculate indicators & check signals ═══
  const recalcIndicators = useCallback((sym: WatchedSymbol): WatchedSymbol => {
    if (sym.candles.length < 30) return sym;
    const closes = sym.candles.map((c) => c.close);
    const lastIdx = closes.length - 1;
    const summary = calculateSummary(sym.candles);

    const updatedIndicators = sym.indicators.map((ind) => {
      let val = "—";
      try {
        switch (ind.type) {
          case "RSI": { const r = RSI(closes, ind.params.period); const v = r[lastIdx]; val = v !== null ? v.toFixed(1) : "—"; break; }
          case "SMA": { const r = SMA(closes, ind.params.period); const v = r[lastIdx]; val = v !== null ? v.toFixed(2) : "—"; break; }
          case "EMA": { const r = EMA(closes, ind.params.period); const v = r[lastIdx]; val = v !== null ? v.toFixed(2) : "—"; break; }
          case "MACD": { const r = MACD(closes, ind.params.fast, ind.params.slow, ind.params.signal); val = r.macd[lastIdx] !== null ? `${r.macd[lastIdx]!.toFixed(2)} / ${r.signal[lastIdx]?.toFixed(2) || "—"}` : "—"; break; }
          case "BB": { const r = BollingerBands(closes, ind.params.period, ind.params.stddev); val = r.upper[lastIdx] !== null ? `${r.lower[lastIdx]!.toFixed(1)} — ${r.upper[lastIdx]!.toFixed(1)}` : "—"; break; }
          case "ATR": { const r = ATR(sym.candles, ind.params.period); const v = r[lastIdx]; val = v !== null ? v.toFixed(2) : "—"; break; }
          case "STOCH": { const r = Stochastic(sym.candles, ind.params.k, ind.params.d); val = r.k[lastIdx] !== null ? `K:${r.k[lastIdx]!.toFixed(1)} D:${r.d[lastIdx]?.toFixed(1) || "—"}` : "—"; break; }
        }
      } catch { val = "err"; }
      return { ...ind, currentValue: val };
    });

    // Check signals
    const tfLabel = TIMEFRAMES.find((t) => t.value === sym.timeframe)?.label || "H1";
    const newSignals = detectSignals(sym.symbol, sym.candles, signalConditions);

    // Detect candle patterns
    const patterns = detectCandlePatterns(sym.candles);

    // Generate signals from strong patterns (strength >= 2)
    for (const pat of patterns) {
      if (pat.strength >= 2 && pat.type !== "neutral") {
        newSignals.push({
          id: `pat_${pat.name}_${Date.now()}`,
          pair: sym.symbol,
          type: pat.type === "bullish" ? "buy" : "sell",
          condition: `${pat.emoji} ${pat.name} (strength ${pat.strength}/3)`,
          price: sym.candles[sym.candles.length - 1].close,
          time: sym.candles[sym.candles.length - 1].time,
          indicator: "PATTERN",
          value: pat.strength,
        });
      }
    }

    if (newSignals.length > 0) {
      setSignals((prev) => {
        const deduped = [...prev];
        for (const sig of newSignals) {
          // Avoid duplicate signals within 60s
          const exists = deduped.find((s) => s.pair === sig.pair && s.indicator === sig.indicator && Math.abs(s.time - sig.time) < 60);
          if (!exists) deduped.unshift({ ...sig, display_name: sym.display_name, timeframe: tfLabel });
        }
        return deduped.slice(0, 50); // Keep last 50
      });
    }

    return { ...sym, indicators: updatedIndicators, summary, patterns };
  }, [signalConditions]);

  // ═══ Subscribe / Unsubscribe ═══
  const addSymbol = useCallback((sym: DerivSymbol) => {
    if (watchlistRef.current.find((s) => s.symbol === sym.symbol)) return;
    const newEntry: WatchedSymbol = {
      symbol: sym.symbol, display_name: sym.display_name, market: sym.market, pip: sym.pip,
      bid: sym.spot || 0, ask: sym.spot || 0, last: sym.spot || 0, prev: sym.spot || 0,
      high: sym.spot || 0, low: sym.spot || 0, change: 0, changePct: 0, spread: 0,
      tick_time: "", sub_id: null, flash: null,
      indicators: [], candles: [], candle_sub_id: null, timeframe: 3600, summary: null, patterns: [],
    };
    setWatchlist((prev) => [...prev, newEntry]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ticks: sym.symbol, subscribe: 1 }));
    }
  }, []);

  const removeSymbol = useCallback((symbol: string) => {
    const entry = watchlistRef.current.find((s) => s.symbol === symbol);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (entry?.sub_id) wsRef.current.send(JSON.stringify({ forget: entry.sub_id }));
      if (entry?.candle_sub_id) wsRef.current.send(JSON.stringify({ forget: entry.candle_sub_id }));
    }
    setWatchlist((prev) => prev.filter((s) => s.symbol !== symbol));
  }, []);

  // ═══ Add indicator to symbol ═══
  const addIndicator = useCallback((symbol: string, type: IndicatorType, params: Record<string, number>) => {
    setWatchlist((prev) => prev.map((s) => {
      if (s.symbol !== symbol) return s;
      // Don't add duplicates
      if (s.indicators.find((i) => i.type === type && JSON.stringify(i.params) === JSON.stringify(params))) return s;
      const newInd: IndicatorConfig = {
        id: `${type}_${Date.now()}`, type, params, enabled: true, currentValue: "...",
      };
      const updated = { ...s, indicators: [...s.indicators, newInd] };
      // Fetch candles if first indicator
      if (s.candles.length === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          ticks_history: symbol, adjust_start_time: 1, count: 200,
          end: "latest", granularity: s.timeframe, style: "candles", subscribe: 1,
        }));
      }
      return updated;
    }));
    setAddingIndicator(null);
  }, []);

  const removeIndicator = useCallback((symbol: string, indicatorId: string) => {
    setWatchlist((prev) => prev.map((s) => {
      if (s.symbol !== symbol) return s;
      const updated = { ...s, indicators: s.indicators.filter((i) => i.id !== indicatorId) };
      // If no more indicators, unsubscribe candles
      if (updated.indicators.length === 0 && s.candle_sub_id && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ forget: s.candle_sub_id }));
        updated.candles = []; updated.candle_sub_id = null; updated.summary = null; updated.patterns = [];
      }
      return updated;
    }));
  }, []);

  const changeTimeframe = useCallback((symbol: string, tf: number) => {
    setWatchlist((prev) => prev.map((s) => {
      if (s.symbol !== symbol) return s;
      // Unsubscribe old candle feed
      if (s.candle_sub_id && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ forget: s.candle_sub_id }));
      }
      // Re-fetch with new timeframe
      if (s.indicators.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          ticks_history: symbol, adjust_start_time: 1, count: 200,
          end: "latest", granularity: tf, style: "candles", subscribe: 1,
        }));
      }
      return { ...s, timeframe: tf, candles: [], candle_sub_id: null, summary: null, patterns: [] };
    }));
  }, []);

  // ═══ Filtered symbols for browser ═══
  const filteredSymbols = allSymbols.filter((s) => {
    if (s.is_trading_suspended) return false;
    if (marketFilter !== "all" && s.market !== marketFilter) return false;
    if (searchQuery) { const q = searchQuery.toLowerCase(); return s.display_name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q); }
    return true;
  });
  const markets = [...new Set(allSymbols.map((s) => s.market))];
  const isWatched = (symbol: string) => watchlist.some((s) => s.symbol === symbol);

  // ═══ Render ═══
  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(77,160,255,.1)", border: "1px solid rgba(77,160,255,.15)" }}>
            <span className="text-xs">📡</span>
          </div>
          <div>
            <div className="text-[13px] font-bold text-white">Symbol Monitor</div>
            <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>Real-time ticks + indicators + signal detection</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{
            background: wsStatus === "connected" ? "rgba(0,229,160,.06)" : wsStatus === "connecting" ? "rgba(240,185,11,.06)" : "rgba(255,77,106,.06)",
            border: `1px solid ${wsStatus === "connected" ? "rgba(0,229,160,.12)" : wsStatus === "connecting" ? "rgba(240,185,11,.12)" : "rgba(255,77,106,.12)"}`,
          }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: wsStatus === "connected" ? "#00e5a0" : wsStatus === "connecting" ? "#f0b90b" : "#ff4d6a", boxShadow: wsStatus === "connected" ? "0 0 6px #00e5a0" : "none", animation: wsStatus === "connecting" ? "pulse 1s infinite" : "none" }} />
            <span className="text-[9px] font-mono font-bold" style={{ color: wsStatus === "connected" ? "#00e5a0" : wsStatus === "connecting" ? "#f0b90b" : "#ff4d6a" }}>
              {wsStatus === "connected" ? `LIVE • ${allSymbols.length} symbols` : wsStatus === "connecting" ? "CONNECTING..." : "OFFLINE"}
            </span>
          </div>
          {wsStatus !== "connected" ? (
            <button onClick={connect} className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer" style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.15)", color: "#00e5a0" }}>Reconnect</button>
          ) : (
            <button onClick={disconnect} className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.12)", color: "#ff4d6a" }}>Disconnect</button>
          )}
        </div>
      </div>

      {/* ── Quick Add ── */}
      {watchlist.length === 0 && wsStatus === "connected" && (
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,.015)", border: "1px solid rgba(255,255,255,.04)" }}>
          <div className="text-[10px] font-mono mb-3" style={{ color: "rgba(255,255,255,.3)" }}>QUICK ADD — Popular symbols</div>
          <div className="flex gap-1.5 flex-wrap">
            {POPULAR_SYMBOLS.map((sym) => { const f = allSymbols.find((s) => s.symbol === sym); if (!f) return null; return (
              <button key={sym} onClick={() => addSymbol(f)} className="px-2.5 py-1 rounded-lg text-[10px] font-mono cursor-pointer transition-all hover:scale-105" style={{ background: `${MARKET_COLORS[f.market] || "#4da0ff"}08`, border: `1px solid ${MARKET_COLORS[f.market] || "#4da0ff"}20`, color: MARKET_COLORS[f.market] || "#4da0ff" }}>+ {f.display_name}</button>
            ); })}
          </div>
        </div>
      )}

      {/* ── Add Symbol / Signal Config Buttons ── */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setShowBrowser(!showBrowser)} className="px-4 py-2 rounded-xl text-[11px] font-bold cursor-pointer transition-all hover:scale-[1.02]" style={{ background: showBrowser ? "rgba(77,160,255,.1)" : "rgba(255,255,255,.03)", border: `1px solid ${showBrowser ? "rgba(77,160,255,.2)" : "rgba(255,255,255,.06)"}`, color: showBrowser ? "#4da0ff" : "rgba(255,255,255,.5)" }}>
          {showBrowser ? "✕ Close Browser" : `+ Add Symbols`}
        </button>
        <button onClick={() => setShowSignalConfig(!showSignalConfig)} className="px-4 py-2 rounded-xl text-[11px] font-bold cursor-pointer transition-all hover:scale-[1.02]" style={{ background: showSignalConfig ? "rgba(240,185,11,.1)" : "rgba(255,255,255,.03)", border: `1px solid ${showSignalConfig ? "rgba(240,185,11,.2)" : "rgba(255,255,255,.06)"}`, color: showSignalConfig ? "#f0b90b" : "rgba(255,255,255,.5)" }}>
          ⚙ Signal Rules ({signalConditions.filter(c => c.enabled).length} active)
        </button>
        {watchlist.length > 0 && <span className="text-[10px] font-mono self-center" style={{ color: "rgba(255,255,255,.2)" }}>Watching {watchlist.length} symbol{watchlist.length !== 1 ? "s" : ""}</span>}
      </div>

      {/* ═══ SIGNAL RULES CONFIG ═══ */}
      {showSignalConfig && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <div className="text-[11px] font-bold text-white">Signal Detection Rules</div>
            <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>Toggle which conditions generate signals for ALL watched symbols</div>
          </div>
          <div className="p-3 flex flex-col gap-1.5">
            {signalConditions.map((cond, idx) => (
              <div key={cond.id} className="flex items-center justify-between px-3 py-2 rounded-xl transition-colors" style={{ background: cond.enabled ? "rgba(255,255,255,.02)" : "transparent", border: "1px solid rgba(255,255,255,.03)" }}>
                <div className="flex items-center gap-3">
                  <button onClick={() => { const u = [...signalConditions]; u[idx] = { ...u[idx], enabled: !u[idx].enabled }; setSignalConditions(u); }}
                    className="w-8 h-4.5 rounded-full cursor-pointer relative transition-all" style={{ background: cond.enabled ? "rgba(0,229,160,.25)" : "rgba(255,255,255,.08)", border: "none", padding: 0 }}>
                    <div className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all" style={{ left: cond.enabled ? 16 : 2, background: cond.enabled ? "#00e5a0" : "rgba(255,255,255,.3)" }} />
                  </button>
                  <div>
                    <div className="text-[11px] font-semibold text-white">{cond.name}</div>
                    <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{cond.indicator} • {cond.condition} {cond.value > 0 ? `@ ${cond.value}` : ""}</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: cond.type === "buy" ? "rgba(0,229,160,.08)" : "rgba(255,77,106,.08)", color: cond.type === "buy" ? "#00e5a0" : "#ff4d6a" }}>{cond.type.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SYMBOL BROWSER ═══ */}
      {showBrowser && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div className="p-3" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search symbols... (e.g. XAUUSD, Bitcoin, Boom)" className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none font-mono mb-2" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            <div className="flex gap-1.5 flex-wrap">
              {["all", ...markets].map((m) => (
                <button key={m} onClick={() => setMarketFilter(m as MarketFilter)} className="px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold cursor-pointer transition-all" style={{ background: marketFilter === m ? `${MARKET_COLORS[m] || "#fff"}15` : "rgba(255,255,255,.02)", border: `1px solid ${marketFilter === m ? `${MARKET_COLORS[m] || "#fff"}30` : "rgba(255,255,255,.06)"}`, color: marketFilter === m ? (MARKET_COLORS[m] || "#fff") : "rgba(255,255,255,.3)" }}>{MARKET_LABELS[m] || m}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[250px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,.1) transparent" }}>
            {filteredSymbols.slice(0, 80).map((sym) => { const watched = isWatched(sym.symbol); return (
              <div key={sym.symbol} className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-white/[.02]" style={{ borderBottom: "1px solid rgba(255,255,255,.02)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: MARKET_COLORS[sym.market] || "#4da0ff" }} />
                  <div><div className="text-[11px] font-bold text-white">{sym.display_name}</div><div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{sym.symbol}</div></div>
                </div>
                <button onClick={() => watched ? removeSymbol(sym.symbol) : addSymbol(sym)} className="px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer" style={{ background: watched ? "rgba(255,77,106,.08)" : "rgba(0,229,160,.08)", border: `1px solid ${watched ? "rgba(255,77,106,.15)" : "rgba(0,229,160,.15)"}`, color: watched ? "#ff4d6a" : "#00e5a0" }}>{watched ? "✕" : "+ Watch"}</button>
              </div>
            ); })}
          </div>
        </div>
      )}

      {/* ═══ WATCHLIST TABLE ═══ */}
      {watchlist.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          {watchlist.map((s) => {
            const digits = Math.max(2, s.pip > 0 ? (s.pip.toString().split(".")[1]?.length || 2) : 2);
            const isUp = s.flash === "up"; const isDown = s.flash === "down";
            const expanded = expandedSymbol === s.symbol;
            const tfLabel = TIMEFRAMES.find((t) => t.value === s.timeframe)?.label || "H1";
            return (
              <div key={s.symbol} style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                {/* Main row */}
                <div className="grid grid-cols-[1fr_85px_85px_55px_60px_30px] gap-1 px-4 py-2.5 items-center cursor-pointer transition-colors hover:bg-white/[.01]"
                  onClick={() => setExpandedSymbol(expanded ? null : s.symbol)}
                  style={{ background: isUp ? "rgba(0,229,160,.03)" : isDown ? "rgba(255,77,106,.03)" : "transparent" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: MARKET_COLORS[s.market] || "#4da0ff" }} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-white truncate">{s.display_name}</div>
                      <div className="flex items-center gap-1.5">
                        {s.indicators.length > 0 && <span className="text-[8px] font-mono px-1 rounded" style={{ background: "rgba(168,85,247,.1)", color: "#a855f7" }}>{s.indicators.length} ind</span>}
                        {s.candles.length > 0 && <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{tfLabel} • {s.candles.length}c</span>}
                        {s.summary && <span className="text-[8px] font-mono font-bold px-1 rounded" style={{
                          background: s.summary.overallBias.includes("buy") ? "rgba(0,229,160,.1)" : s.summary.overallBias.includes("sell") ? "rgba(255,77,106,.1)" : "rgba(255,255,255,.05)",
                          color: s.summary.overallBias.includes("buy") ? "#00e5a0" : s.summary.overallBias.includes("sell") ? "#ff4d6a" : "rgba(255,255,255,.3)",
                        }}>{s.summary.overallBias.replace("_", " ").toUpperCase()}</span>}
                        {s.patterns.filter(p => p.strength >= 2).map((pat, pi) => (
                          <span key={pi} className="text-[8px] font-mono font-bold px-1 rounded" style={{
                            background: pat.type === "bullish" ? "rgba(0,229,160,.1)" : pat.type === "bearish" ? "rgba(255,77,106,.1)" : "rgba(255,255,255,.05)",
                            color: pat.type === "bullish" ? "#00e5a0" : pat.type === "bearish" ? "#ff4d6a" : "rgba(255,255,255,.3)",
                          }}>{pat.emoji} {pat.name}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono font-bold" style={{ color: isUp ? "#00e5a0" : isDown ? "#ff4d6a" : "rgba(255,255,255,.8)" }}>{s.bid > 0 ? s.bid.toFixed(digits) : "—"}</div>
                  <div className="text-[11px] font-mono font-bold" style={{ color: isUp ? "#00e5a0" : isDown ? "#ff4d6a" : "rgba(255,255,255,.8)" }}>{s.ask > 0 ? s.ask.toFixed(digits) : "—"}</div>
                  <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{s.spread > 0 ? `${s.spread}p` : "—"}</div>
                  <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{s.tick_time || "—"}</div>
                  <button onClick={(e) => { e.stopPropagation(); removeSymbol(s.symbol); }} className="w-5 h-5 rounded flex items-center justify-center cursor-pointer hover:bg-white/[.05]" style={{ background: "none", border: "none", color: "rgba(255,255,255,.12)", fontSize: 9 }}>✕</button>
                </div>

                {/* ═══ EXPANDED PANEL — Indicators + Config ═══ */}
                {expanded && (
                  <div className="px-4 pb-3" style={{ background: "rgba(255,255,255,.01)" }}>
                    {/* Timeframe selector */}
                    <div className="flex items-center gap-2 mb-3 pt-2">
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>Timeframe:</span>
                      {TIMEFRAMES.map((tf) => (
                        <button key={tf.value} onClick={() => changeTimeframe(s.symbol, tf.value)} className="px-2 py-0.5 rounded text-[9px] font-mono cursor-pointer" style={{
                          background: s.timeframe === tf.value ? "rgba(77,160,255,.12)" : "rgba(255,255,255,.02)",
                          border: `1px solid ${s.timeframe === tf.value ? "rgba(77,160,255,.25)" : "rgba(255,255,255,.05)"}`,
                          color: s.timeframe === tf.value ? "#4da0ff" : "rgba(255,255,255,.25)",
                        }}>{tf.label}</button>
                      ))}
                    </div>

                    {/* Active indicators */}
                    {s.indicators.length > 0 && (
                      <div className="flex flex-col gap-1.5 mb-3">
                        {s.indicators.map((ind) => {
                          const def = INDICATOR_DEFS.find((d) => d.type === ind.type);
                          return (
                            <div key={ind.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px]">{def?.emoji || "📊"}</span>
                                <span className="text-[10px] font-mono font-bold text-white">{ind.type}({Object.values(ind.params).join(",")})</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono font-bold" style={{
                                  color: ind.type === "RSI" && parseFloat(ind.currentValue) > 70 ? "#ff4d6a" :
                                    ind.type === "RSI" && parseFloat(ind.currentValue) < 30 ? "#00e5a0" :
                                    "rgba(255,255,255,.7)",
                                }}>{ind.currentValue}</span>
                                <button onClick={() => removeIndicator(s.symbol, ind.id)} className="text-[9px] cursor-pointer px-1 rounded hover:bg-white/[.05]" style={{ background: "none", border: "none", color: "rgba(255,77,106,.5)" }}>✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Summary bar */}
                    {s.summary && (
                      <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,.015)", border: "1px solid rgba(255,255,255,.03)" }}>
                        <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>Score:</span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,.05)" }}>
                          <div className="h-full" style={{ width: `${s.summary.buyScore}%`, background: "#00e5a0" }} />
                          <div className="h-full" style={{ width: `${s.summary.sellScore}%`, background: "#ff4d6a" }} />
                        </div>
                        <span className="text-[9px] font-mono font-bold" style={{ color: "#00e5a0" }}>{s.summary.buyScore}B</span>
                        <span className="text-[9px] font-mono font-bold" style={{ color: "#ff4d6a" }}>{s.summary.sellScore}S</span>
                      </div>
                    )}

                    {/* Detected patterns */}
                    {s.patterns.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[9px] font-mono mb-2" style={{ color: "rgba(255,255,255,.2)" }}>CANDLE PATTERNS DETECTED</div>
                        <div className="flex gap-1.5 flex-wrap">
                          {s.patterns.map((pat, pi) => (
                            <div key={pi} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{
                              background: pat.type === "bullish" ? "rgba(0,229,160,.06)" : pat.type === "bearish" ? "rgba(255,77,106,.06)" : "rgba(255,255,255,.03)",
                              border: `1px solid ${pat.type === "bullish" ? "rgba(0,229,160,.12)" : pat.type === "bearish" ? "rgba(255,77,106,.12)" : "rgba(255,255,255,.06)"}`,
                            }}>
                              <span className="text-[11px]">{pat.emoji}</span>
                              <div>
                                <div className="text-[10px] font-bold" style={{ color: pat.type === "bullish" ? "#00e5a0" : pat.type === "bearish" ? "#ff4d6a" : "rgba(255,255,255,.5)" }}>{pat.name}</div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{pat.type.toUpperCase()}</span>
                                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>•</span>
                                  <span className="text-[8px] font-mono" style={{ color: pat.strength === 3 ? "#f0b90b" : pat.strength === 2 ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.2)" }}>
                                    {"★".repeat(pat.strength)}{"☆".repeat(3 - pat.strength)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add indicator */}
                    {addingIndicator === s.symbol ? (
                      <div className="flex gap-1.5 flex-wrap">
                        {INDICATOR_DEFS.map((def) => (
                          <button key={def.type} onClick={() => addIndicator(s.symbol, def.type, { ...def.defaultParams })}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-mono cursor-pointer transition-all hover:scale-105"
                            style={{ background: "rgba(168,85,247,.06)", border: "1px solid rgba(168,85,247,.12)", color: "#a855f7" }}>
                            {def.emoji} {def.label}({Object.values(def.defaultParams).join(",")})
                          </button>
                        ))}
                        <button onClick={() => setAddingIndicator(null)} className="px-2 py-1 rounded-lg text-[9px] cursor-pointer" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.3)" }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingIndicator(s.symbol)} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all hover:scale-[1.02]" style={{ background: "rgba(168,85,247,.06)", border: "1px solid rgba(168,85,247,.12)", color: "#a855f7" }}>
                        + Add Indicator
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between px-4 py-2" style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{watchlist.length} symbols • Click row to expand</span>
            <button onClick={() => { watchlist.forEach((s) => removeSymbol(s.symbol)); }} className="text-[9px] font-mono cursor-pointer px-2 py-0.5 rounded" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.1)", color: "#ff4d6a" }}>Clear All</button>
          </div>
        </div>
      )}

      {/* ═══ SIGNAL LOG ═══ */}
      {signals.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#f0b90b", animation: "pulse 2s infinite" }} />
              <span className="text-[11px] font-bold text-white">Signal Log</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(240,185,11,.08)", color: "#f0b90b" }}>{signals.length}</span>
            </div>
            <button onClick={() => setSignals([])} className="text-[9px] font-mono cursor-pointer px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.25)" }}>Clear</button>
          </div>
          <div className="max-h-[250px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {signals.map((sig, i) => (
              <div key={`${sig.pair}-${sig.time}-${i}`} className="flex items-center gap-3 px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,.02)", background: i === 0 ? (sig.type === "buy" ? "rgba(0,229,160,.03)" : "rgba(255,77,106,.03)") : "transparent" }}>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: sig.type === "buy" ? "rgba(0,229,160,.12)" : "rgba(255,77,106,.12)", color: sig.type === "buy" ? "#00e5a0" : "#ff4d6a" }}>{sig.type === "buy" ? "▲ BUY" : "▼ SELL"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-white">{sig.display_name} <span className="font-normal text-[9px]" style={{ color: "rgba(255,255,255,.2)" }}>{sig.timeframe}</span></div>
                  <div className="text-[9px] font-mono truncate" style={{ color: "rgba(255,255,255,.35)" }}>{sig.condition}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-mono font-bold text-white">{sig.price?.toFixed(2)}</div>
                  <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{new Date(sig.time * 1000).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {watchlist.length === 0 && !showBrowser && wsStatus === "connected" && allSymbols.length > 0 && (
        <div className="rounded-xl p-8 text-center" style={{ background: "rgba(255,255,255,.01)", border: "1px solid rgba(255,255,255,.03)" }}>
          <div className="text-2xl mb-2">📡</div>
          <div className="text-[12px] font-semibold text-white mb-1">No symbols being monitored</div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,.25)" }}>Click &quot;+ Add Symbols&quot; or use quick-add above to start</div>
        </div>
      )}
    </div>
  );
}
