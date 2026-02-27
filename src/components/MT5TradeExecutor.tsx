"use client";
import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Types ─── */
interface ServerConfig {
  name: string;
  displayName: string;
  platform: "svg" | "bvi";
  type: "demo" | "real";
  webTerminalUrl: string;
}

interface TradeOrder {
  id: string;
  symbol: string;
  type: "BUY" | "SELL";
  lots: number;
  price: number;
  status: "pending" | "filled" | "failed";
  timestamp: Date;
  server: string;
  login: string;
  sl?: number;
  tp?: number;
  error?: string;
}

interface AccountInfo {
  login: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: string;
  currency: string;
  connected: boolean;
}

/* ─── Server Configs ─── */
const SERVERS: ServerConfig[] = [
  // SVG Servers
  { name: "DerivSVG-Demo", displayName: "SVG Demo", platform: "svg", type: "demo", webTerminalUrl: "https://mt5-real02-web-svg.deriv.com/terminal" },
  { name: "DerivSVG-Server", displayName: "SVG Server", platform: "svg", type: "real", webTerminalUrl: "https://mt5-real02-web-svg.deriv.com/terminal" },
  { name: "DerivSVG-Server-02", displayName: "SVG Server 02", platform: "svg", type: "real", webTerminalUrl: "https://mt5-real02-web-svg.deriv.com/terminal" },
  { name: "DerivSVG-Server-03", displayName: "SVG Server 03", platform: "svg", type: "real", webTerminalUrl: "https://mt5-real03-web-svg.deriv.com/terminal" },
  // BVI Servers
  { name: "DerivBVI-Demo", displayName: "BVI Demo", platform: "bvi", type: "demo", webTerminalUrl: "https://mt5-real02-web-bvi.deriv.com/terminal" },
  { name: "DerivBVI-Server", displayName: "BVI Server", platform: "bvi", type: "real", webTerminalUrl: "https://mt5-real02-web-bvi.deriv.com/terminal" },
  { name: "DerivBVI-Server-02", displayName: "BVI Server 02", platform: "bvi", type: "real", webTerminalUrl: "https://mt5-real02-web-bvi.deriv.com/terminal" },
  { name: "DerivBVI-Server-03", displayName: "BVI Server 03", platform: "bvi", type: "real", webTerminalUrl: "https://mt5-real03-web-bvi.deriv.com/terminal" },
];

const POPULAR_SYMBOLS = [
  "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "GBPJPY",
  "EURJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "BTCUSD", "ETHUSD", "US30", "US500", "USTEC",
];

/* ─── Component ─── */
export default function MT5TradeExecutor() {
  // Connection state
  const [platform, setPlatform] = useState<"svg" | "bvi">("svg");
  const [selectedServer, setSelectedServer] = useState<string>("DerivSVG-Demo");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  // Account state
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);

  // Trade state
  const [symbol, setSymbol] = useState("XAUUSD");
  const [lots, setLots] = useState("0.01");
  const [slPips, setSlPips] = useState("");
  const [tpPips, setTpPips] = useState("");
  const [tradeLoading, setTradeLoading] = useState<"BUY" | "SELL" | null>(null);
  const [trades, setTrades] = useState<TradeOrder[]>([]);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);

  // Terminal iframe ref
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Filter servers by platform
  const filteredServers = SERVERS.filter(s => s.platform === platform);

  // Update server when platform changes
  useEffect(() => {
    const first = filteredServers[0];
    if (first) setSelectedServer(first.name);
  }, [platform]);

  // Get current server config
  const currentServer = SERVERS.find(s => s.name === selectedServer);

  /* ─── Deriv WebSocket Connection ─── */
  const connectToAccount = useCallback(async () => {
    if (!loginId || !password || !currentServer) return;

    setConnecting(true);
    setConnectionError("");

    try {
      // Connect via Deriv WebSocket API
      const appId = 1089; // Deriv default app_id for testing
      const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Authorize and get MT5 account info
        ws.send(JSON.stringify({
          mt5_login: 1,
          login: loginId,
          password: password,
          server: currentServer.name,
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
          setConnectionError(data.error.message || "Connection failed");
          setConnecting(false);
          return;
        }

        if (data.mt5_login) {
          const info = data.mt5_login;
          setAccountInfo({
            login: info.login || loginId,
            server: currentServer.name,
            balance: info.balance || 0,
            equity: info.equity || 0,
            margin: info.margin || 0,
            freeMargin: info.margin_free || 0,
            leverage: info.leverage || "1:100",
            currency: info.currency || "USD",
            connected: true,
          });
          setConnected(true);
          setConnecting(false);
        }
      };

      ws.onerror = () => {
        setConnectionError("WebSocket connection failed");
        setConnecting(false);
      };

      ws.onclose = () => {
        if (connected) {
          setConnected(false);
          setAccountInfo(null);
        }
      };

      // Timeout after 15s
      setTimeout(() => {
        if (!connected && connecting) {
          setConnectionError("Connection timed out. Using direct terminal mode.");
          setConnecting(false);
          // Fallback: connect via iframe
          connectViaTerminal();
        }
      }, 15000);

    } catch (err: any) {
      setConnectionError(err.message || "Failed to connect");
      setConnecting(false);
    }
  }, [loginId, password, currentServer, connected, connecting]);

  /* ─── Fallback: Terminal iframe connection ─── */
  const connectViaTerminal = useCallback(() => {
    if (!currentServer) return;
    const url = `${currentServer.webTerminalUrl}?login=${loginId}&server=${currentServer.name}`;
    setConnected(true);
    setConnecting(false);
    setAccountInfo({
      login: loginId,
      server: currentServer.name,
      balance: 0,
      equity: 0,
      margin: 0,
      freeMargin: 0,
      leverage: "—",
      currency: "USD",
      connected: true,
    });
  }, [currentServer, loginId]);

  /* ─── Execute Trade ─── */
  const executeTrade = useCallback(async (type: "BUY" | "SELL") => {
    if (!connected || !symbol || !lots) return;
    setTradeLoading(type);

    const order: TradeOrder = {
      id: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      symbol,
      type,
      lots: parseFloat(lots),
      price: 0,
      status: "pending",
      timestamp: new Date(),
      server: selectedServer,
      login: loginId,
      sl: slPips ? parseFloat(slPips) : undefined,
      tp: tpPips ? parseFloat(tpPips) : undefined,
    };

    setTrades(prev => [order, ...prev]);

    try {
      // Attempt via WebSocket API
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          mt5_new_order: 1,
          login: loginId,
          symbol: symbol,
          order_type: type === "BUY" ? "buy" : "sell",
          volume: parseFloat(lots),
          ...(slPips ? { stop_loss: parseFloat(slPips) } : {}),
          ...(tpPips ? { take_profit: parseFloat(tpPips) } : {}),
        }));

        // Listen for response
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.mt5_new_order) {
            setTrades(prev => prev.map(t =>
              t.id === order.id
                ? { ...t, status: "filled", price: data.mt5_new_order.price || 0 }
                : t
            ));
            setTradeLoading(null);
            wsRef.current?.removeEventListener("message", handler);
          } else if (data.error) {
            setTrades(prev => prev.map(t =>
              t.id === order.id
                ? { ...t, status: "failed", error: data.error.message }
                : t
            ));
            setTradeLoading(null);
            wsRef.current?.removeEventListener("message", handler);
          }
        };
        wsRef.current.addEventListener("message", handler);

        // Timeout
        setTimeout(() => {
          wsRef.current?.removeEventListener("message", handler);
          setTrades(prev => prev.map(t =>
            t.id === order.id && t.status === "pending"
              ? { ...t, status: "failed", error: "Order timeout — use terminal for execution" }
              : t
          ));
          setTradeLoading(null);
        }, 10000);
      } else {
        // No WebSocket — mark as needing terminal execution
        setTimeout(() => {
          setTrades(prev => prev.map(t =>
            t.id === order.id
              ? { ...t, status: "failed", error: "Direct API unavailable — open terminal to execute" }
              : t
          ));
          setTradeLoading(null);
        }, 1500);
      }
    } catch (err: any) {
      setTrades(prev => prev.map(t =>
        t.id === order.id
          ? { ...t, status: "failed", error: err.message }
          : t
      ));
      setTradeLoading(null);
    }
  }, [connected, symbol, lots, slPips, tpPips, selectedServer, loginId]);

  /* ─── Disconnect ─── */
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setAccountInfo(null);
    setConnectionError("");
  };

  /* ─── Open Full Terminal ─── */
  const openTerminal = () => {
    if (!currentServer) return;
    const url = `${currentServer.webTerminalUrl}?login=${loginId}&server=${currentServer.name}`;
    window.open(url, "_blank");
  };

  /* ─── Lot size helpers ─── */
  const adjustLots = (delta: number) => {
    const current = parseFloat(lots) || 0;
    const newVal = Math.max(0.01, +(current + delta).toFixed(2));
    setLots(newVal.toString());
  };

  return (
    <div className="space-y-4">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>⚡</div>
          <div>
            <h2 className="text-sm font-bold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>MT5 Trade Executor</h2>
            <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>HEADLESS EXECUTION ENGINE • ADMIN ONLY</p>
          </div>
        </div>
        {connected && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00e5a0" }} />
            <span className="text-[10px] font-mono" style={{ color: "#00e5a0" }}>CONNECTED</span>
          </div>
        )}
      </div>

      {/* ═══ CONNECTION PANEL ═══ */}
      {!connected ? (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>

          {/* Platform Selector */}
          <div className="mb-4">
            <label className="block text-[10px] font-mono tracking-widest mb-2" style={{ color: "rgba(255,255,255,.3)" }}>PLATFORM</label>
            <div className="flex gap-2">
              {(["svg", "bvi"] as const).map(p => (
                <button key={p} onClick={() => setPlatform(p)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
                  style={{
                    background: platform === p ? (p === "svg" ? "rgba(99,102,241,.12)" : "rgba(236,72,153,.12)") : "rgba(255,255,255,.03)",
                    border: `1px solid ${platform === p ? (p === "svg" ? "rgba(99,102,241,.3)" : "rgba(236,72,153,.3)") : "rgba(255,255,255,.06)"}`,
                    color: platform === p ? (p === "svg" ? "#818cf8" : "#f472b6") : "rgba(255,255,255,.3)",
                  }}>
                  Deriv {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Server Selector */}
          <div className="mb-4">
            <label className="block text-[10px] font-mono tracking-widest mb-2" style={{ color: "rgba(255,255,255,.3)" }}>SERVER</label>
            <div className="grid grid-cols-2 gap-2">
              {filteredServers.map(s => (
                <button key={s.name} onClick={() => setSelectedServer(s.name)}
                  className="py-2.5 px-3 rounded-xl text-[11px] font-mono cursor-pointer transition-all text-left"
                  style={{
                    background: selectedServer === s.name ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)",
                    border: `1px solid ${selectedServer === s.name ? "rgba(0,229,160,.25)" : "rgba(255,255,255,.06)"}`,
                    color: selectedServer === s.name ? "#00e5a0" : "rgba(255,255,255,.4)",
                  }}>
                  <div className="flex items-center justify-between">
                    <span>{s.displayName}</span>
                    {s.type === "demo" && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b" }}>DEMO</span>
                    )}
                    {selectedServer === s.name && <span className="text-xs">✓</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Login Fields */}
          <div className="grid grid-cols-1 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>MT5 LOGIN ID</label>
              <input type="text" value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="e.g. 50123456"
                className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono"
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            </div>
            <div>
              <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>PASSWORD</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="MT5 password"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono pr-12"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
                  style={{ color: "rgba(255,255,255,.3)" }}>{showPassword ? "🙈" : "👁️"}</button>
              </div>
            </div>
          </div>

          {/* Error */}
          {connectionError && (
            <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.15)" }}>
              <p className="text-[11px] font-mono" style={{ color: "#ff4d6a" }}>{connectionError}</p>
            </div>
          )}

          {/* Connect Button */}
          <button onClick={connectToAccount} disabled={connecting || !loginId || !password}
            className="w-full py-3.5 rounded-xl text-sm font-bold cursor-pointer transition-all"
            style={{
              background: connecting ? "rgba(255,255,255,.05)" : "linear-gradient(135deg, #00e5a0, #00b87d)",
              color: connecting ? "rgba(255,255,255,.3)" : "#0a0b0f",
              opacity: (!loginId || !password) ? 0.4 : 1,
            }}>
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                Connecting to {selectedServer}...
              </span>
            ) : "Connect & Login"}
          </button>
        </div>
      ) : (
        <>
          {/* ═══ ACCOUNT INFO BAR ═══ */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#00e5a0" }} />
                <span className="text-xs font-mono font-bold text-white">{accountInfo?.login}</span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full" style={{
                  background: currentServer?.type === "demo" ? "rgba(245,158,11,.1)" : "rgba(0,229,160,.1)",
                  color: currentServer?.type === "demo" ? "#f59e0b" : "#00e5a0",
                }}>{selectedServer}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={openTerminal} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all hover:opacity-80"
                  style={{ background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.2)", color: "#818cf8" }}>
                  Open Terminal ↗
                </button>
                <button onClick={disconnect} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all hover:opacity-80"
                  style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "#ff4d6a" }}>
                  Disconnect
                </button>
              </div>
            </div>

            {/* Account Stats */}
            {accountInfo && accountInfo.balance > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "BALANCE", value: `$${accountInfo.balance.toFixed(2)}`, color: "#fff" },
                  { label: "EQUITY", value: `$${accountInfo.equity.toFixed(2)}`, color: "#00e5a0" },
                  { label: "FREE MARGIN", value: `$${accountInfo.freeMargin.toFixed(2)}`, color: "#4da0ff" },
                  { label: "LEVERAGE", value: accountInfo.leverage, color: "#f59e0b" },
                ].map((s, i) => (
                  <div key={i} className="rounded-lg p-2.5 text-center" style={{ background: "rgba(255,255,255,.02)" }}>
                    <div className="text-[8px] font-mono tracking-widest mb-1" style={{ color: "rgba(255,255,255,.25)" }}>{s.label}</div>
                    <div className="text-xs font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ TRADE EXECUTION PANEL ═══ */}
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm">🎯</span>
              <h3 className="text-xs font-bold text-white tracking-wider" style={{ fontFamily: "'Outfit',sans-serif" }}>QUICK EXECUTION</h3>
            </div>

            {/* Symbol Selector */}
            <div className="mb-4">
              <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>SYMBOL</label>
              <div className="relative">
                <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                  onFocus={() => setShowSymbolPicker(true)}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono font-bold"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                {showSymbolPicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl p-2 z-10 max-h-48 overflow-auto"
                    style={{ background: "#1a1b23", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
                    <div className="flex flex-wrap gap-1.5">
                      {POPULAR_SYMBOLS.map(s => (
                        <button key={s} onClick={() => { setSymbol(s); setShowSymbolPicker(false); }}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all"
                          style={{
                            background: symbol === s ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.04)",
                            border: `1px solid ${symbol === s ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
                            color: symbol === s ? "#00e5a0" : "rgba(255,255,255,.5)",
                          }}>{s}</button>
                      ))}
                    </div>
                    <button onClick={() => setShowSymbolPicker(false)} className="w-full mt-2 py-1.5 rounded-lg text-[9px] font-mono cursor-pointer"
                      style={{ background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.25)" }}>Close</button>
                  </div>
                )}
              </div>
            </div>

            {/* Lot Size */}
            <div className="mb-4">
              <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>LOT SIZE</label>
              <div className="flex items-center gap-2">
                <button onClick={() => adjustLots(-0.01)} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold cursor-pointer"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>−</button>
                <input type="text" value={lots} onChange={e => setLots(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-center text-sm text-white outline-none font-mono font-bold"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <button onClick={() => adjustLots(0.01)} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold cursor-pointer"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>+</button>
              </div>
              {/* Quick lots */}
              <div className="flex gap-1.5 mt-2">
                {["0.01", "0.05", "0.10", "0.50", "1.00"].map(l => (
                  <button key={l} onClick={() => setLots(l)} className="flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer"
                    style={{
                      background: lots === l ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)",
                      border: `1px solid ${lots === l ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.05)"}`,
                      color: lots === l ? "#00e5a0" : "rgba(255,255,255,.3)",
                    }}>{l}</button>
                ))}
              </div>
            </div>

            {/* SL / TP */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,77,106,.4)" }}>STOP LOSS (price)</label>
                <input type="text" value={slPips} onChange={e => setSlPips(e.target.value)} placeholder="Optional"
                  className="w-full px-3 py-2.5 rounded-xl text-xs text-white outline-none font-mono"
                  style={{ background: "rgba(255,77,106,.04)", border: "1px solid rgba(255,77,106,.1)" }} />
              </div>
              <div>
                <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(0,229,160,.4)" }}>TAKE PROFIT (price)</label>
                <input type="text" value={tpPips} onChange={e => setTpPips(e.target.value)} placeholder="Optional"
                  className="w-full px-3 py-2.5 rounded-xl text-xs text-white outline-none font-mono"
                  style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }} />
              </div>
            </div>

            {/* BUY / SELL Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => executeTrade("BUY")} disabled={tradeLoading !== null}
                className="py-4 rounded-xl text-sm font-bold cursor-pointer transition-all relative overflow-hidden"
                style={{
                  background: tradeLoading === "BUY" ? "rgba(0,229,160,.15)" : "linear-gradient(135deg, #00e5a0, #00b87d)",
                  color: tradeLoading === "BUY" ? "#00e5a0" : "#0a0b0f",
                  opacity: tradeLoading === "SELL" ? 0.4 : 1,
                }}>
                {tradeLoading === "BUY" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current/20 border-t-current animate-spin" />
                    Executing...
                  </span>
                ) : (
                  <>
                    <div className="text-lg font-black">BUY</div>
                    <div className="text-[9px] font-mono opacity-70">{symbol} • {lots} lots</div>
                  </>
                )}
              </button>
              <button onClick={() => executeTrade("SELL")} disabled={tradeLoading !== null}
                className="py-4 rounded-xl text-sm font-bold cursor-pointer transition-all relative overflow-hidden"
                style={{
                  background: tradeLoading === "SELL" ? "rgba(255,77,106,.15)" : "linear-gradient(135deg, #ff4d6a, #e6364f)",
                  color: "#fff",
                  opacity: tradeLoading === "BUY" ? 0.4 : 1,
                }}>
                {tradeLoading === "SELL" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current/20 border-t-current animate-spin" />
                    Executing...
                  </span>
                ) : (
                  <>
                    <div className="text-lg font-black">SELL</div>
                    <div className="text-[9px] font-mono opacity-70">{symbol} • {lots} lots</div>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ═══ TRADE LOG ═══ */}
          {trades.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-white tracking-wider" style={{ fontFamily: "'Outfit',sans-serif" }}>TRADE LOG</h3>
                <button onClick={() => setTrades([])} className="text-[9px] font-mono cursor-pointer" style={{ color: "rgba(255,255,255,.25)" }}>Clear</button>
              </div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {trades.map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded"
                        style={{
                          background: t.type === "BUY" ? "rgba(0,229,160,.1)" : "rgba(255,77,106,.1)",
                          color: t.type === "BUY" ? "#00e5a0" : "#ff4d6a",
                        }}>{t.type}</span>
                      <div>
                        <div className="text-xs font-mono font-bold text-white">{t.symbol} <span style={{ color: "rgba(255,255,255,.3)" }}>× {t.lots}</span></div>
                        <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{t.timestamp.toLocaleTimeString()}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                        style={{
                          background: t.status === "filled" ? "rgba(0,229,160,.08)" : t.status === "failed" ? "rgba(255,77,106,.08)" : "rgba(245,158,11,.08)",
                          color: t.status === "filled" ? "#00e5a0" : t.status === "failed" ? "#ff4d6a" : "#f59e0b",
                        }}>{t.status === "filled" ? `Filled @ ${t.price}` : t.status === "failed" ? "Failed" : "Pending..."}</span>
                      {t.error && <div className="text-[8px] font-mono mt-0.5 max-w-[180px] truncate" style={{ color: "rgba(255,77,106,.5)" }}>{t.error}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Hidden iframe for terminal fallback */}
      {connected && currentServer && (
        <iframe
          ref={iframeRef}
          src={`${currentServer.webTerminalUrl}?login=${loginId}&server=${currentServer.name}`}
          style={{ width: 0, height: 0, border: "none", position: "absolute", left: -9999 }}
          title="MT5 Terminal"
        />
      )}
    </div>
  );
}
