"use client";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickData, ColorType, UTCTimestamp } from "lightweight-charts";

interface Position {
  contract_id: number;
  symbol: string;
  display_name: string;
  buy_price: number;
  current_spot: number;
  pnl: number;
  contract_type: string;
  currency: string;
  date_start: number;
  expiry_time?: number;
}

interface AccountInfo {
  balance: number;
  currency: string;
  loginid: string;
  fullname?: string;
  is_virtual: number;
}

const POPULAR_SYMBOLS = [
  { id: "frxXAUUSD", name: "Gold" }, { id: "frxEURUSD", name: "EUR/USD" },
  { id: "frxGBPUSD", name: "GBP/USD" }, { id: "frxUSDJPY", name: "USD/JPY" },
  { id: "frxGBPJPY", name: "GBP/JPY" }, { id: "frxAUDUSD", name: "AUD/USD" },
  { id: "cryBTCUSD", name: "BTC/USD" }, { id: "cryETHUSD", name: "ETH/USD" },
  { id: "R_100", name: "Vol 100" }, { id: "R_75", name: "Vol 75" },
  { id: "R_50", name: "Vol 50" }, { id: "R_25", name: "Vol 25" },
  { id: "R_10", name: "Vol 10" }, { id: "BOOM1000", name: "Boom 1000" },
  { id: "CRASH1000", name: "Crash 1000" }, { id: "BOOM500", name: "Boom 500" },
  { id: "CRASH500", name: "Crash 500" }, { id: "1HZ100V", name: "Vol 100 (1s)" },
];

const TIMEFRAMES = [
  { label: "M1", value: 60 }, { label: "M5", value: 300 }, { label: "M15", value: 900 },
  { label: "M30", value: 1800 }, { label: "H1", value: 3600 }, { label: "H4", value: 14400 }, { label: "D1", value: 86400 },
];

export default function TradingTerminal() {
  // Connection
  const [apiToken, setApiToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);

  // Chart
  const [activeSymbol, setActiveSymbol] = useState("frxXAUUSD");
  const [activeSymbolName, setActiveSymbolName] = useState("Gold / USD");
  const [activeTf, setActiveTf] = useState(3600);
  const [activeTfLabel, setActiveTfLabel] = useState("H1");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);

  // Watchlist + search
  const [watchlist, setWatchlist] = useState(POPULAR_SYMBOLS.slice(0, 8));
  const [allSymbols, setAllSymbols] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // UI
  const [showAccount, setShowAccount] = useState(true);
  const [screenshotting, setScreenshotting] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const candlesRef = useRef<CandlestickData[]>([]);
  const tickSubRef = useRef<string | null>(null);
  const candleSubRef = useRef<string | null>(null);
  const balanceSubRef = useRef<string | null>(null);
  const posSubsRef = useRef<Set<string>>(new Set());
  const connectedRef = useRef(false);
  const tokenRef = useRef("");

  // ═══ Initialize chart ═══
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0a0b10" }, textColor: "rgba(255,255,255,.45)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
      grid: { vertLines: { color: "rgba(255,255,255,.03)" }, horzLines: { color: "rgba(255,255,255,.03)" } },
      crosshair: { mode: 0, vertLine: { color: "rgba(0,229,160,.3)", width: 1, style: 2 }, horzLine: { color: "rgba(0,229,160,.3)", width: 1, style: 2 } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "rgba(255,255,255,.06)" },
      rightPriceScale: { borderColor: "rgba(255,255,255,.06)" },
      handleScroll: true, handleScale: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00e5a0", downColor: "#ff4d6a", borderUpColor: "#00e5a0", borderDownColor: "#ff4d6a",
      wickUpColor: "rgba(0,229,160,.6)", wickDownColor: "rgba(255,77,106,.6)",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => { if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight }); };
    window.addEventListener("resize", resize);
    resize();
    return () => { window.removeEventListener("resize", resize); chart.remove(); };
  }, []);

  // ═══ WebSocket ═══
  const sendWS = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const forgetAll = useCallback(() => {
    if (tickSubRef.current) { sendWS({ forget: tickSubRef.current }); tickSubRef.current = null; }
    if (candleSubRef.current) { sendWS({ forget: candleSubRef.current }); candleSubRef.current = null; }
  }, [sendWS]);

  const loadChart = useCallback((symbol: string, granularity: number) => {
    forgetAll();
    candlesRef.current = [];
    if (seriesRef.current) seriesRef.current.setData([]);

    // Fetch candle history
    sendWS({ ticks_history: symbol, adjust_start_time: 1, count: 500, end: "latest", granularity, style: "candles", subscribe: 1 });
    // Subscribe to tick for live price
    sendWS({ ticks: symbol, subscribe: 1 });
  }, [sendWS, forgetAll]);

  const connectAccount = useCallback(() => {
    if (!apiToken.trim()) return;
    setConnecting(true);
    tokenRef.current = apiToken.trim();

    if (wsRef.current) { try { wsRef.current.close(); } catch {} }

    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    wsRef.current = ws;

    ws.onopen = () => {
      // Authorize with token
      ws.send(JSON.stringify({ authorize: tokenRef.current }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // ── Auth response ──
        if (data.msg_type === "authorize") {
          if (data.error) {
            setConnecting(false);
            alert("Auth failed: " + (data.error.message || "Invalid token"));
            return;
          }
          const a = data.authorize;
          setAccount({ balance: +a.balance, currency: a.currency, loginid: a.loginid, fullname: a.fullname, is_virtual: a.is_virtual });
          setConnected(true); connectedRef.current = true;
          setConnecting(false);

          // Subscribe to balance
          sendWS({ balance: 1, subscribe: 1 });
          // Get open positions
          sendWS({ portfolio: 1 });
          // Get all symbols
          sendWS({ active_symbols: "brief", product_type: "basic" });
          // Load default chart
          loadChart("frxXAUUSD", 3600);
        }

        // ── Balance update ──
        if (data.msg_type === "balance") {
          if (data.subscription) balanceSubRef.current = data.subscription.id;
          if (data.balance) setAccount(prev => prev ? { ...prev, balance: +data.balance.balance } : prev);
        }

        // ── Portfolio ──
        if (data.msg_type === "portfolio") {
          const contracts = data.portfolio?.contracts || [];
          const pos: Position[] = contracts.map((c: any) => ({
            contract_id: c.contract_id, symbol: c.symbol, display_name: c.symbol,
            buy_price: +c.buy_price, current_spot: +c.buy_price, pnl: +c.pnl || 0,
            contract_type: c.contract_type, currency: c.currency, date_start: c.date_start,
          }));
          setPositions(pos);

          // Subscribe to each position for live PnL
          contracts.forEach((c: any) => {
            if (!posSubsRef.current.has(c.contract_id)) {
              sendWS({ proposal_open_contract: 1, contract_id: c.contract_id, subscribe: 1 });
              posSubsRef.current.add(c.contract_id);
            }
          });
        }

        // ── Open contract update (live PnL) ──
        if (data.msg_type === "proposal_open_contract") {
          const poc = data.proposal_open_contract;
          if (poc) {
            setPositions(prev => prev.map(p =>
              p.contract_id === poc.contract_id
                ? { ...p, current_spot: +poc.current_spot || p.current_spot, pnl: +poc.profit || p.pnl, display_name: poc.display_name || p.display_name }
                : p
            ));
          }
        }

        // ── Active symbols ──
        if (data.msg_type === "active_symbols") {
          setAllSymbols(data.active_symbols || []);
        }

        // ── Candle history ──
        if (data.msg_type === "candles") {
          const candles: CandlestickData[] = (data.candles || []).map((c: any) => ({
            time: c.epoch as UTCTimestamp, open: +c.open, high: +c.high, low: +c.low, close: +c.close,
          }));
          candlesRef.current = candles;
          if (seriesRef.current) {
            seriesRef.current.setData(candles);
            chartRef.current?.timeScale().fitContent();
          }
          if (candles.length > 0) {
            setCurrentPrice(candles[candles.length - 1].close);
          }
        }

        // ── OHLC stream (live candle updates) ──
        if (data.msg_type === "ohlc") {
          if (data.subscription) candleSubRef.current = data.subscription.id;
          const o = data.ohlc;
          if (o && seriesRef.current) {
            const bar: CandlestickData = { time: +o.open_time as UTCTimestamp, open: +o.open, high: +o.high, low: +o.low, close: +o.close };
            seriesRef.current.update(bar);
            setCurrentPrice(+o.close);
          }
        }

        // ── Tick stream ──
        if (data.msg_type === "tick") {
          if (data.subscription) tickSubRef.current = data.subscription.id;
          const t = data.tick;
          if (t) {
            const newPrice = +t.quote;
            setPriceChange(newPrice - currentPrice);
            setCurrentPrice(newPrice);
          }
        }

      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      if (connectedRef.current) {
        // Reconnect if still supposed to be connected
        setTimeout(() => {
          if (connectedRef.current) connectAccount();
        }, 3000);
      }
    };
    ws.onerror = () => setConnecting(false);
  }, [apiToken, sendWS, loadChart, currentPrice]);

  const disconnect = useCallback(() => {
    connectedRef.current = false;
    setConnected(false);
    setAccount(null);
    setPositions([]);
    posSubsRef.current.clear();
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
  }, []);

  // ═══ Switch symbol ═══
  const switchSymbol = useCallback((symbolId: string, name: string) => {
    setActiveSymbol(symbolId);
    setActiveSymbolName(name);
    setShowSearch(false);
    setSearch("");
    if (connected) loadChart(symbolId, activeTf);
  }, [connected, loadChart, activeTf]);

  // ═══ Switch timeframe ═══
  const switchTf = useCallback((value: number, label: string) => {
    setActiveTf(value);
    setActiveTfLabel(label);
    if (connected) loadChart(activeSymbol, value);
  }, [connected, loadChart, activeSymbol]);

  // ═══ Screenshot ═══
  const takeScreenshot = useCallback(() => {
    if (!chartContainerRef.current) return;
    setScreenshotting(true);
    const canvas = chartContainerRef.current.querySelector("canvas");
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      setScreenshotUrl(url);

      // Also copy to clipboard
      canvas.toBlob((blob) => {
        if (blob) {
          try { navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); } catch {}
        }
      });
    }
    setTimeout(() => setScreenshotting(false), 500);
  }, []);

  // ═══ Computed PnL ═══
  useEffect(() => {
    setTotalPnl(positions.reduce((sum, p) => sum + p.pnl, 0));
  }, [positions]);

  // ═══ Filtered search results ═══
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allSymbols.filter((s: any) =>
      s.display_name?.toLowerCase().includes(q) || s.symbol?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [search, allSymbols]);

  // ═══ Add to watchlist ═══
  const addToWatchlist = useCallback((id: string, name: string) => {
    if (watchlist.find(w => w.id === id)) return;
    setWatchlist(prev => [...prev, { id, name }]);
  }, [watchlist]);

  const removeFromWatchlist = useCallback((id: string) => {
    setWatchlist(prev => prev.filter(w => w.id !== id));
  }, []);

  const pnlColor = totalPnl >= 0 ? "#00e5a0" : "#ff4d6a";

  return (
    <div className="flex flex-col gap-2">
      {/* ═══ Connection Bar ═══ */}
      {!connected ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
                <span className="text-sm">📊</span>
              </div>
              <div>
                <div className="text-[13px] font-bold text-white">Connect Deriv Account</div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Enter your Deriv API token to access live charts, account data & trades</div>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)}
                onKeyDown={e => e.key === "Enter" && connectAccount()}
                placeholder="Paste your Deriv API token..."
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] text-white outline-none"
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
              <button onClick={connectAccount} disabled={connecting || !apiToken.trim()}
                className="px-5 py-2.5 rounded-xl text-[11px] font-bold cursor-pointer whitespace-nowrap"
                style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", border: "none", opacity: connecting || !apiToken.trim() ? 0.5 : 1 }}>
                {connecting ? "Connecting..." : "Connect"}
              </button>
            </div>
            <div className="mt-2 text-[9px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>
              Get your token: Deriv → Settings → API token → Create with read + trade scope
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ═══ Account Bar ═══ */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 8px #00e5a0", animation: "pulse 2s infinite" }} />
                  <span className="text-[10px] font-mono font-bold" style={{ color: "#00e5a0" }}>LIVE</span>
                </div>
                <span className="text-[11px] font-mono text-white">{account?.loginid}</span>
                {account?.is_virtual ? (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(240,185,11,.1)", color: "#f0b90b" }}>DEMO</span>
                ) : (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,229,160,.1)", color: "#00e5a0" }}>REAL</span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>BALANCE</div>
                  <div className="text-[14px] font-bold font-mono text-white">{account?.currency} {account?.balance.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>OPEN P&L</div>
                  <div className="text-[14px] font-bold font-mono" style={{ color: pnlColor }}>{totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}</div>
                </div>
                <button onClick={disconnect} className="px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold cursor-pointer"
                  style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "#ff4d6a" }}>Disconnect</button>
              </div>
            </div>
          </div>

          {/* ═══ Main Layout ═══ */}
          <div className="flex gap-2" style={{ height: "calc(100vh - 240px)", minHeight: 500 }}>
            {/* ── Watchlist Panel ── */}
            <div className="w-48 flex-shrink-0 rounded-2xl overflow-hidden flex flex-col" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="text-[10px] font-mono font-bold" style={{ color: "rgba(255,255,255,.4)" }}>WATCHLIST</span>
                <button onClick={() => setShowSearch(!showSearch)} className="text-[9px] font-mono cursor-pointer px-1.5 py-0.5 rounded"
                  style={{ background: showSearch ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.04)", border: "none", color: showSearch ? "#00e5a0" : "rgba(255,255,255,.3)" }}>+ Add</button>
              </div>

              {showSearch && (
                <div className="px-2 py-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbols..."
                    className="w-full px-2.5 py-1.5 rounded-lg text-[10px] text-white outline-none"
                    style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)" }} autoFocus />
                  {searchResults.length > 0 && (
                    <div className="mt-1 max-h-32 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                      {searchResults.map((s: any) => (
                        <button key={s.symbol} onClick={() => { addToWatchlist(s.symbol, s.display_name); switchSymbol(s.symbol, s.display_name); }}
                          className="w-full text-left px-2 py-1 rounded text-[9px] font-mono cursor-pointer hover:bg-white/5 flex justify-between items-center"
                          style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)" }}>
                          <span className="truncate">{s.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {watchlist.map(w => (
                  <div key={w.id}
                    onClick={() => switchSymbol(w.id, w.name)}
                    className="px-3 py-2 flex items-center justify-between cursor-pointer transition-all hover:bg-white/[.02] group"
                    style={{ borderBottom: "1px solid rgba(255,255,255,.02)", background: activeSymbol === w.id ? "rgba(0,229,160,.04)" : "transparent" }}>
                    <div>
                      <div className="text-[10px] font-mono font-semibold" style={{ color: activeSymbol === w.id ? "#00e5a0" : "rgba(255,255,255,.6)" }}>{w.name}</div>
                      <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{w.id}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeFromWatchlist(w.id); }}
                      className="text-[8px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,.15)" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Chart Area ── */}
            <div className="flex-1 flex flex-col rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              {/* Chart header */}
              <div className="px-4 py-2 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <div className="flex items-center gap-3">
                  <div className="text-[13px] font-bold text-white">{activeSymbolName}</div>
                  <div className="text-[12px] font-mono font-bold" style={{ color: priceChange >= 0 ? "#00e5a0" : "#ff4d6a" }}>
                    {currentPrice > 0 ? currentPrice.toFixed(currentPrice > 100 ? 2 : currentPrice > 1 ? 4 : 5) : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Timeframe buttons */}
                  {TIMEFRAMES.map(tf => (
                    <button key={tf.label} onClick={() => switchTf(tf.value, tf.label)}
                      className="px-2 py-1 rounded-md text-[9px] font-mono font-bold cursor-pointer transition-all"
                      style={{
                        background: activeTf === tf.value ? "rgba(0,229,160,.12)" : "rgba(255,255,255,.02)",
                        border: `1px solid ${activeTf === tf.value ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.04)"}`,
                        color: activeTf === tf.value ? "#00e5a0" : "rgba(255,255,255,.3)",
                      }}>{tf.label}</button>
                  ))}
                  <div className="w-px h-5 mx-1" style={{ background: "rgba(255,255,255,.06)" }} />
                  {/* Screenshot button */}
                  <button onClick={takeScreenshot}
                    className="px-3 py-1 rounded-md text-[9px] font-mono font-bold cursor-pointer flex items-center gap-1.5 transition-all hover:scale-105"
                    style={{ background: "rgba(168,85,247,.1)", border: "1px solid rgba(168,85,247,.2)", color: "#a855f7" }}>
                    📸 {screenshotting ? "Captured!" : "Screenshot"}
                  </button>
                </div>
              </div>

              {/* Chart canvas */}
              <div ref={chartContainerRef} className="flex-1" style={{ minHeight: 300 }} />
            </div>

            {/* ── Positions Panel ── */}
            {showAccount && positions.length > 0 && (
              <div className="w-64 flex-shrink-0 rounded-2xl overflow-hidden flex flex-col" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span className="text-[10px] font-mono font-bold" style={{ color: "rgba(255,255,255,.4)" }}>OPEN POSITIONS ({positions.length})</span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: pnlColor }}>{totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}</span>
                </div>
                <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                  {positions.map(pos => (
                    <div key={pos.contract_id} className="px-3 py-2 cursor-pointer hover:bg-white/[.02]" style={{ borderBottom: "1px solid rgba(255,255,255,.02)" }}
                      onClick={() => { const sym = allSymbols.find((s: any) => s.symbol === pos.symbol); if (sym) switchSymbol(sym.symbol, sym.display_name); }}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-mono font-semibold text-white">{pos.display_name || pos.symbol}</span>
                        <span className="text-[9px] font-mono font-bold" style={{ color: pos.pnl >= 0 ? "#00e5a0" : "#ff4d6a" }}>{pos.pnl >= 0 ? "+" : ""}{pos.pnl.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{pos.contract_type}</span>
                        <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>@ {pos.buy_price.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ═══ Screenshot Preview ═══ */}
          {screenshotUrl && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="text-[10px] font-mono font-bold" style={{ color: "#a855f7" }}>📸 SCREENSHOT — {activeSymbolName} {activeTfLabel}</span>
                <div className="flex gap-2">
                  <a href={screenshotUrl} download={`${activeSymbol}_${activeTfLabel}_${Date.now()}.png`}
                    className="text-[9px] font-mono cursor-pointer px-2.5 py-1 rounded-lg no-underline"
                    style={{ background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.12)", color: "#00e5a0" }}>💾 Download</a>
                  <button onClick={() => setScreenshotUrl(null)} className="text-[9px] font-mono cursor-pointer px-2 py-1 rounded-lg"
                    style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.1)", color: "#ff4d6a" }}>✕ Close</button>
                </div>
              </div>
              <div className="p-3">
                <img src={screenshotUrl} alt="Chart screenshot" className="w-full rounded-xl" style={{ border: "1px solid rgba(255,255,255,.06)", maxHeight: 250, objectFit: "contain" }} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
