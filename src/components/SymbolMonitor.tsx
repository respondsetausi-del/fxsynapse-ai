"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ═══ Types ═══
interface DerivSymbol {
  symbol: string;
  display_name: string;
  market: string;
  market_display_name: string;
  submarket: string;
  submarket_display_name: string;
  pip: number;
  spot: number;
  spot_time: string;
  is_trading_suspended: number;
}

interface WatchedSymbol {
  symbol: string;
  display_name: string;
  market: string;
  pip: number;
  bid: number;
  ask: number;
  last: number;
  prev: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  spread: number;
  tick_time: string;
  sub_id: string | null;
  flash: "up" | "down" | null;
}

type MarketFilter = "all" | "forex" | "commodities" | "cryptocurrency" | "synthetic_index" | "stock_indices";

const MARKET_LABELS: Record<string, string> = {
  all: "All",
  forex: "Forex",
  commodities: "Commodities",
  cryptocurrency: "Crypto",
  synthetic_index: "Synthetics",
  stock_indices: "Indices",
};

const MARKET_COLORS: Record<string, string> = {
  forex: "#00e5a0",
  commodities: "#f0b90b",
  cryptocurrency: "#a855f7",
  synthetic_index: "#4da0ff",
  stock_indices: "#ff4d6a",
};

// Popular symbols to suggest as quick-add
const POPULAR_SYMBOLS = [
  "frxXAUUSD", "frxEURUSD", "frxGBPUSD", "frxUSDJPY", "frxGBPJPY",
  "frxAUDUSD", "frxUSDCAD", "frxNZDUSD", "frxEURGBP", "frxEURJPY",
  "cryBTCUSD", "cryETHUSD",
  "R_100", "R_75", "R_50", "R_25", "R_10",
  "BOOM1000", "BOOM500", "CRASH1000", "CRASH500",
  "stpRNG", "1HZ100V", "1HZ75V", "1HZ50V",
];

export default function SymbolMonitor() {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [allSymbols, setAllSymbols] = useState<DerivSymbol[]>([]);
  const [watchlist, setWatchlist] = useState<WatchedSymbol[]>([]);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const watchlistRef = useRef<WatchedSymbol[]>([]);
  const flashTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  // ═══ WebSocket Connection ═══
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setWsStatus("connecting");

    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      // Fetch all active symbols
      ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
      // Re-subscribe watchlist
      watchlistRef.current.forEach((s) => {
        ws.send(JSON.stringify({ ticks: s.symbol, subscribe: 1 }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.msg_type === "active_symbols") {
          const symbols: DerivSymbol[] = data.active_symbols || [];
          setAllSymbols(symbols);
        }

        if (data.msg_type === "tick") {
          const tick = data.tick;
          if (!tick) return;

          setWatchlist((prev) =>
            prev.map((s) => {
              if (s.symbol !== tick.symbol) return s;
              const newPrice = tick.quote;
              const prevPrice = s.last || newPrice;
              const direction: "up" | "down" | null = newPrice > prevPrice ? "up" : newPrice < prevPrice ? "down" : s.flash;
              const dayChange = s.bid > 0 ? newPrice - s.bid : 0;

              // Flash timer
              if (direction && direction !== s.flash) {
                if (flashTimers.current[s.symbol]) clearTimeout(flashTimers.current[s.symbol]);
                flashTimers.current[s.symbol] = setTimeout(() => {
                  setWatchlist((p) => p.map((x) => x.symbol === s.symbol ? { ...x, flash: null } : x));
                }, 600);
              }

              return {
                ...s,
                last: newPrice,
                prev: prevPrice,
                bid: tick.bid || newPrice,
                ask: tick.ask || newPrice,
                spread: tick.ask && tick.bid ? parseFloat(((tick.ask - tick.bid) / s.pip).toFixed(1)) : s.spread,
                change: dayChange,
                changePct: s.bid > 0 ? (dayChange / s.bid) * 100 : 0,
                high: Math.max(s.high || 0, newPrice),
                low: s.low > 0 ? Math.min(s.low, newPrice) : newPrice,
                tick_time: tick.epoch ? new Date(tick.epoch * 1000).toLocaleTimeString() : s.tick_time,
                sub_id: data.subscription?.id || s.sub_id,
                flash: direction,
              };
            })
          );
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => {
      setWsStatus("disconnected");
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setWsStatus("disconnected");
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ═══ Subscribe / Unsubscribe ═══
  const addSymbol = useCallback((sym: DerivSymbol) => {
    if (watchlistRef.current.find((s) => s.symbol === sym.symbol)) return;

    const newEntry: WatchedSymbol = {
      symbol: sym.symbol,
      display_name: sym.display_name,
      market: sym.market,
      pip: sym.pip,
      bid: sym.spot || 0,
      ask: sym.spot || 0,
      last: sym.spot || 0,
      prev: sym.spot || 0,
      high: sym.spot || 0,
      low: sym.spot || 0,
      change: 0,
      changePct: 0,
      spread: 0,
      tick_time: "",
      sub_id: null,
      flash: null,
    };

    setWatchlist((prev) => [...prev, newEntry]);

    // Subscribe to ticks
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ticks: sym.symbol, subscribe: 1 }));
    }
  }, []);

  const removeSymbol = useCallback((symbol: string) => {
    const entry = watchlistRef.current.find((s) => s.symbol === symbol);
    if (entry?.sub_id && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ forget: entry.sub_id }));
    }
    setWatchlist((prev) => prev.filter((s) => s.symbol !== symbol));
  }, []);

  // ═══ Filtered symbols for browser ═══
  const filteredSymbols = allSymbols.filter((s) => {
    if (s.is_trading_suspended) return false;
    if (marketFilter !== "all" && s.market !== marketFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.display_name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q);
    }
    return true;
  });

  const markets = [...new Set(allSymbols.map((s) => s.market))];
  const isWatched = (symbol: string) => watchlist.some((s) => s.symbol === symbol);

  // ═══ Render ═══
  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(77,160,255,.1)", border: "1px solid rgba(77,160,255,.15)" }}>
            <span className="text-xs">📡</span>
          </div>
          <div>
            <div className="text-[13px] font-bold text-white">Symbol Monitor</div>
            <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>
              Deriv WebSocket API • Real-time ticks
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{
            background: wsStatus === "connected" ? "rgba(0,229,160,.06)" : wsStatus === "connecting" ? "rgba(240,185,11,.06)" : "rgba(255,77,106,.06)",
            border: `1px solid ${wsStatus === "connected" ? "rgba(0,229,160,.12)" : wsStatus === "connecting" ? "rgba(240,185,11,.12)" : "rgba(255,77,106,.12)"}`,
          }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{
              background: wsStatus === "connected" ? "#00e5a0" : wsStatus === "connecting" ? "#f0b90b" : "#ff4d6a",
              boxShadow: wsStatus === "connected" ? "0 0 6px #00e5a0" : "none",
              animation: wsStatus === "connecting" ? "pulse 1s infinite" : "none",
            }} />
            <span className="text-[9px] font-mono font-bold" style={{
              color: wsStatus === "connected" ? "#00e5a0" : wsStatus === "connecting" ? "#f0b90b" : "#ff4d6a",
            }}>
              {wsStatus === "connected" ? `LIVE • ${allSymbols.length} symbols` : wsStatus === "connecting" ? "CONNECTING..." : "OFFLINE"}
            </span>
          </div>
          {wsStatus !== "connected" ? (
            <button onClick={connect} className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer"
              style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.15)", color: "#00e5a0" }}>Reconnect</button>
          ) : (
            <button onClick={disconnect} className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer"
              style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.12)", color: "#ff4d6a" }}>Disconnect</button>
          )}
        </div>
      </div>

      {/* ── Quick Add Popular ── */}
      {watchlist.length === 0 && wsStatus === "connected" && (
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,.015)", border: "1px solid rgba(255,255,255,.04)" }}>
          <div className="text-[10px] font-mono mb-3" style={{ color: "rgba(255,255,255,.3)" }}>QUICK ADD — Popular symbols</div>
          <div className="flex gap-1.5 flex-wrap">
            {POPULAR_SYMBOLS.map((sym) => {
              const found = allSymbols.find((s) => s.symbol === sym);
              if (!found) return null;
              return (
                <button key={sym} onClick={() => addSymbol(found)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-mono cursor-pointer transition-all hover:scale-105"
                  style={{
                    background: `${MARKET_COLORS[found.market] || "#4da0ff"}08`,
                    border: `1px solid ${MARKET_COLORS[found.market] || "#4da0ff"}20`,
                    color: MARKET_COLORS[found.market] || "#4da0ff",
                  }}>
                  + {found.display_name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Add Symbol Button ── */}
      <div className="flex gap-2">
        <button onClick={() => setShowBrowser(!showBrowser)}
          className="px-4 py-2 rounded-xl text-[11px] font-bold cursor-pointer transition-all hover:scale-[1.02]"
          style={{
            background: showBrowser ? "rgba(77,160,255,.1)" : "rgba(255,255,255,.03)",
            border: `1px solid ${showBrowser ? "rgba(77,160,255,.2)" : "rgba(255,255,255,.06)"}`,
            color: showBrowser ? "#4da0ff" : "rgba(255,255,255,.5)",
          }}>
          {showBrowser ? "✕ Close Browser" : `+ Add Symbols (${allSymbols.length} available)`}
        </button>
        {watchlist.length > 0 && (
          <span className="text-[10px] font-mono self-center" style={{ color: "rgba(255,255,255,.2)" }}>
            Watching {watchlist.length} symbol{watchlist.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Symbol Browser ── */}
      {showBrowser && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          {/* Search + Filters */}
          <div className="p-3" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbols... (e.g. XAUUSD, Bitcoin, Boom)"
              className="w-full px-3 py-2 rounded-xl text-xs text-white outline-none font-mono mb-2"
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            <div className="flex gap-1.5 flex-wrap">
              {["all", ...markets].map((m) => (
                <button key={m} onClick={() => setMarketFilter(m as MarketFilter)}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold cursor-pointer transition-all"
                  style={{
                    background: marketFilter === m ? `${MARKET_COLORS[m] || "#fff"}15` : "rgba(255,255,255,.02)",
                    border: `1px solid ${marketFilter === m ? `${MARKET_COLORS[m] || "#fff"}30` : "rgba(255,255,255,.06)"}`,
                    color: marketFilter === m ? (MARKET_COLORS[m] || "#fff") : "rgba(255,255,255,.3)",
                  }}>
                  {MARKET_LABELS[m] || m}
                </button>
              ))}
            </div>
          </div>
          {/* Symbol List */}
          <div className="max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,.1) transparent" }}>
            {filteredSymbols.slice(0, 100).map((sym) => {
              const watched = isWatched(sym.symbol);
              return (
                <div key={sym.symbol} className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-white/[.02]"
                  style={{ borderBottom: "1px solid rgba(255,255,255,.02)" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: MARKET_COLORS[sym.market] || "#4da0ff" }} />
                    <div>
                      <div className="text-[11px] font-bold text-white">{sym.display_name}</div>
                      <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{sym.symbol} • {sym.submarket_display_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>
                      {sym.spot ? sym.spot.toFixed(sym.pip.toString().split(".")[1]?.length || 2) : "—"}
                    </span>
                    <button onClick={() => watched ? removeSymbol(sym.symbol) : addSymbol(sym)}
                      className="px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer transition-all"
                      style={{
                        background: watched ? "rgba(255,77,106,.08)" : "rgba(0,229,160,.08)",
                        border: `1px solid ${watched ? "rgba(255,77,106,.15)" : "rgba(0,229,160,.15)"}`,
                        color: watched ? "#ff4d6a" : "#00e5a0",
                      }}>
                      {watched ? "✕ Remove" : "+ Watch"}
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredSymbols.length === 0 && (
              <div className="text-center py-8 text-[11px]" style={{ color: "rgba(255,255,255,.2)" }}>No symbols found</div>
            )}
            {filteredSymbols.length > 100 && (
              <div className="text-center py-2 text-[9px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>
                Showing 100 of {filteredSymbols.length} — use search to narrow
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ WATCHLIST — Live Prices ═══ */}
      {watchlist.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          {/* Header Row */}
          <div className="grid grid-cols-[1fr_90px_90px_70px_70px_60px_40px] gap-2 px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
            {["Symbol", "Bid", "Ask", "Spread", "Change", "Time", ""].map((h) => (
              <div key={h} className="text-[8px] font-mono tracking-wider" style={{ color: "rgba(255,255,255,.2)" }}>{h}</div>
            ))}
          </div>

          {/* Symbol Rows */}
          {watchlist.map((s) => {
            const digits = s.pip > 0 ? Math.max(2, s.pip.toString().split(".")[1]?.length || 2) : 2;
            const isUp = s.flash === "up";
            const isDown = s.flash === "down";
            const changeColor = s.change >= 0 ? "#00e5a0" : "#ff4d6a";

            return (
              <div key={s.symbol} className="grid grid-cols-[1fr_90px_90px_70px_70px_60px_40px] gap-2 px-4 py-2.5 items-center transition-colors"
                style={{
                  borderBottom: "1px solid rgba(255,255,255,.02)",
                  background: isUp ? "rgba(0,229,160,.03)" : isDown ? "rgba(255,77,106,.03)" : "transparent",
                  transition: "background .3s ease",
                }}>
                {/* Symbol name */}
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: MARKET_COLORS[s.market] || "#4da0ff" }} />
                  <div>
                    <div className="text-[11px] font-bold text-white">{s.display_name}</div>
                    <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{s.market}</div>
                  </div>
                </div>

                {/* Bid */}
                <div className="text-[12px] font-mono font-bold" style={{
                  color: isUp ? "#00e5a0" : isDown ? "#ff4d6a" : "rgba(255,255,255,.8)",
                  transition: "color .3s ease",
                }}>
                  {s.bid > 0 ? s.bid.toFixed(digits) : "—"}
                </div>

                {/* Ask */}
                <div className="text-[12px] font-mono font-bold" style={{
                  color: isUp ? "#00e5a0" : isDown ? "#ff4d6a" : "rgba(255,255,255,.8)",
                  transition: "color .3s ease",
                }}>
                  {s.ask > 0 ? s.ask.toFixed(digits) : "—"}
                </div>

                {/* Spread in pips */}
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>
                  {s.spread > 0 ? `${s.spread}p` : "—"}
                </div>

                {/* Change */}
                <div className="text-[10px] font-mono font-bold" style={{ color: changeColor }}>
                  {s.changePct !== 0 ? `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(3)}%` : "—"}
                </div>

                {/* Last tick time */}
                <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>
                  {s.tick_time || "—"}
                </div>

                {/* Remove */}
                <button onClick={() => removeSymbol(s.symbol)}
                  className="w-6 h-6 rounded flex items-center justify-center cursor-pointer transition-all hover:bg-white/[.05]"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.15)", fontSize: 10 }}>
                  ✕
                </button>
              </div>
            );
          })}

          {/* Watchlist footer */}
          <div className="flex items-center justify-between px-4 py-2" style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>
              {watchlist.length} symbols • Ticks streaming via wss://ws.derivws.com
            </span>
            <button onClick={() => { watchlist.forEach((s) => removeSymbol(s.symbol)); }}
              className="text-[9px] font-mono cursor-pointer px-2 py-0.5 rounded"
              style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.1)", color: "#ff4d6a" }}>
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {watchlist.length === 0 && !showBrowser && wsStatus === "connected" && allSymbols.length > 0 && (
        <div className="rounded-xl p-8 text-center" style={{ background: "rgba(255,255,255,.01)", border: "1px solid rgba(255,255,255,.03)" }}>
          <div className="text-2xl mb-2">📡</div>
          <div className="text-[12px] font-semibold text-white mb-1">No symbols being monitored</div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,.25)" }}>
            Click &quot;+ Add Symbols&quot; or use quick-add above to start watching live prices
          </div>
        </div>
      )}
    </div>
  );
}
