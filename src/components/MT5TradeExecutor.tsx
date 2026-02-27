"use client";
import { useState, useEffect, useRef } from "react";

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
  status: "pending" | "filled" | "failed";
  timestamp: Date;
  error?: string;
  screenshot?: string;
}

/* ─── Server Configs ─── */
const SERVERS: ServerConfig[] = [
  { name: "DerivSVG-Demo", displayName: "SVG Demo", platform: "svg", type: "demo", webTerminalUrl: "https://mt5-real02-web-svg.deriv.com/terminal" },
  { name: "DerivSVG-Server", displayName: "SVG Server", platform: "svg", type: "real", webTerminalUrl: "https://mt5-real02-web-svg.deriv.com/terminal" },
  { name: "DerivSVG-Server-02", displayName: "SVG Server 02", platform: "svg", type: "real", webTerminalUrl: "https://mt5-real02-web-svg.deriv.com/terminal" },
  { name: "DerivSVG-Server-03", displayName: "SVG Server 03", platform: "svg", type: "real", webTerminalUrl: "https://mt5-real03-web-svg.deriv.com/terminal" },
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

export default function MT5TradeExecutor() {
  const [platform, setPlatform] = useState<"svg" | "bvi">("svg");
  const [selectedServer, setSelectedServer] = useState("DerivSVG-Demo");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [terminalScreenshot, setTerminalScreenshot] = useState("");
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const [symbol, setSymbol] = useState("XAUUSD");
  const [lots, setLots] = useState("0.01");
  const [slPrice, setSlPrice] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [tradeLoading, setTradeLoading] = useState<"BUY" | "SELL" | null>(null);
  const [trades, setTrades] = useState<TradeOrder[]>([]);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [domMap, setDomMap] = useState<any>(null);
  const [discovering, setDiscovering] = useState(false);

  const filteredServers = SERVERS.filter(s => s.platform === platform);
  const currentServer = SERVERS.find(s => s.name === selectedServer);

  useEffect(() => {
    const first = filteredServers[0];
    if (first) setSelectedServer(first.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  useEffect(() => {
    if (autoRefresh && sessionId) {
      autoRefreshRef.current = setInterval(() => refreshScreenshot(), 5000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, sessionId]);

  const connectToAccount = async () => {
    if (!loginId || !password || !currentServer) return;
    setConnecting(true);
    setConnectionError("");
    try {
      const res = await fetch("/api/trade/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginId, password, server: selectedServer, serverUrl: currentServer.webTerminalUrl }),
      });
      const data = await res.json();
      if (data.error && !data.session?.id) { setConnectionError(data.error); setConnecting(false); return; }
      setSessionId(data.session.id);
      setConnected(true);
      if (data.screenshot) setTerminalScreenshot(data.screenshot);
      if (data.error) setConnectionError(data.error);
    } catch (err: any) { setConnectionError(err.message || "Connection failed"); }
    setConnecting(false);
  };

  const refreshScreenshot = async () => {
    if (!sessionId) return;
    setScreenshotLoading(true);
    try {
      const res = await fetch("/api/trade/screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      const data = await res.json();
      if (data.screenshot) setTerminalScreenshot(data.screenshot);
    } catch { /* ignore */ }
    setScreenshotLoading(false);
  };

  const discoverTerminal = async () => {
    if (!sessionId) return;
    setDiscovering(true);
    try {
      const res = await fetch("/api/trade/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      const data = await res.json();
      setDomMap(data.elements);
      if (data.screenshot) setTerminalScreenshot(data.screenshot);
    } catch { /* ignore */ }
    setDiscovering(false);
  };

  const executeTrade = async (type: "BUY" | "SELL") => {
    if (!connected || !symbol || !lots || !sessionId) return;
    setTradeLoading(type);
    const order: TradeOrder = { id: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, symbol, type, lots: parseFloat(lots), status: "pending", timestamp: new Date() };
    setTrades(prev => [order, ...prev]);
    try {
      const res = await fetch("/api/trade/execute", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, symbol, type, lots: parseFloat(lots), sl: slPrice || undefined, tp: tpPrice || undefined }),
      });
      const data = await res.json();
      setTrades(prev => prev.map(t => t.id === order.id ? { ...t, status: data.success ? "filled" : "failed", error: data.error, screenshot: data.screenshot } : t));
      if (data.screenshot) setTerminalScreenshot(data.screenshot);
    } catch (err: any) {
      setTrades(prev => prev.map(t => t.id === order.id ? { ...t, status: "failed", error: err.message } : t));
    }
    setTradeLoading(null);
  };

  const disconnect = async () => {
    if (sessionId) { await fetch("/api/trade/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) }).catch(() => {}); }
    setConnected(false); setSessionId(""); setTerminalScreenshot(""); setConnectionError(""); setDomMap(null); setAutoRefresh(false);
  };

  const adjustLots = (delta: number) => { setLots(Math.max(0.01, +(parseFloat(lots || "0") + delta).toFixed(2)).toString()); };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>⚡</div>
          <div>
            <h2 className="text-sm font-bold text-white" style={{ fontFamily: "'Outfit',sans-serif" }}>MT5 Trade Executor</h2>
            <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>PUPPETEER ENGINE • HEADLESS CHROME • ADMIN ONLY</p>
          </div>
        </div>
        {connected && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00e5a0" }} />
            <span className="text-[10px] font-mono" style={{ color: "#00e5a0" }}>SESSION ACTIVE</span>
          </div>
        )}
      </div>

      {!connected ? (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          {/* Platform */}
          <div className="mb-4">
            <label className="block text-[10px] font-mono tracking-widest mb-2" style={{ color: "rgba(255,255,255,.3)" }}>PLATFORM</label>
            <div className="flex gap-2">
              {(["svg", "bvi"] as const).map(p => (
                <button key={p} onClick={() => setPlatform(p)} className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
                  style={{ background: platform === p ? (p === "svg" ? "rgba(99,102,241,.12)" : "rgba(236,72,153,.12)") : "rgba(255,255,255,.03)", border: `1px solid ${platform === p ? (p === "svg" ? "rgba(99,102,241,.3)" : "rgba(236,72,153,.3)") : "rgba(255,255,255,.06)"}`, color: platform === p ? (p === "svg" ? "#818cf8" : "#f472b6") : "rgba(255,255,255,.3)" }}>
                  Deriv {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {/* Server */}
          <div className="mb-4">
            <label className="block text-[10px] font-mono tracking-widest mb-2" style={{ color: "rgba(255,255,255,.3)" }}>SERVER</label>
            <div className="grid grid-cols-2 gap-2">
              {filteredServers.map(s => (
                <button key={s.name} onClick={() => setSelectedServer(s.name)} className="py-2.5 px-3 rounded-xl text-[11px] font-mono cursor-pointer transition-all text-left"
                  style={{ background: selectedServer === s.name ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${selectedServer === s.name ? "rgba(0,229,160,.25)" : "rgba(255,255,255,.06)"}`, color: selectedServer === s.name ? "#00e5a0" : "rgba(255,255,255,.4)" }}>
                  <div className="flex items-center justify-between">
                    <span>{s.displayName}</span>
                    {s.type === "demo" && <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b" }}>DEMO</span>}
                    {selectedServer === s.name && <span className="text-xs">✓</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {/* Login */}
          <div className="grid grid-cols-1 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>MT5 LOGIN ID</label>
              <input type="text" value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="e.g. 50123456" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            </div>
            <div>
              <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>PASSWORD</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="MT5 password" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono pr-12" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer" style={{ color: "rgba(255,255,255,.3)" }}>{showPassword ? "🙈" : "👁️"}</button>
              </div>
            </div>
          </div>
          {connectionError && (
            <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.15)" }}>
              <p className="text-[11px] font-mono" style={{ color: "#ff4d6a" }}>{connectionError}</p>
            </div>
          )}
          <button onClick={connectToAccount} disabled={connecting || !loginId || !password} className="w-full py-3.5 rounded-xl text-sm font-bold cursor-pointer transition-all"
            style={{ background: connecting ? "rgba(255,255,255,.05)" : "linear-gradient(135deg, #00e5a0, #00b87d)", color: connecting ? "rgba(255,255,255,.3)" : "#0a0b0f", opacity: (!loginId || !password) ? 0.4 : 1 }}>
            {connecting ? (<span className="flex items-center justify-center gap-2"><span className="inline-block w-3 h-3 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />Launching headless Chrome...</span>) : "Connect via Puppeteer"}
          </button>
          <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(99,102,241,.04)", border: "1px solid rgba(99,102,241,.08)" }}>
            <p className="text-[9px] font-mono leading-relaxed" style={{ color: "rgba(255,255,255,.25)" }}>⚡ Launches headless Chrome → Opens MT5 Web Terminal → Automates login → Executes trades via DOM → Returns live screenshots</p>
          </div>
        </div>
      ) : (
        <>
          {/* SESSION BAR */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#00e5a0" }} />
                <span className="text-xs font-mono font-bold text-white">{loginId}</span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full" style={{ background: currentServer?.type === "demo" ? "rgba(245,158,11,.1)" : "rgba(0,229,160,.1)", color: currentServer?.type === "demo" ? "#f59e0b" : "#00e5a0" }}>{selectedServer}</span>
                <span className="text-[8px] font-mono px-2 py-0.5 rounded-full" style={{ background: "rgba(168,85,247,.1)", color: "#a855f7" }}>{sessionId.substring(0, 16)}...</span>
              </div>
              <div className="flex gap-2">
                <button onClick={refreshScreenshot} disabled={screenshotLoading} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer hover:opacity-80" style={{ background: "rgba(77,160,255,.08)", border: "1px solid rgba(77,160,255,.15)", color: "#4da0ff" }}>{screenshotLoading ? "⏳" : "📸"} Refresh</button>
                <button onClick={() => setAutoRefresh(!autoRefresh)} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer hover:opacity-80" style={{ background: autoRefresh ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.04)", border: `1px solid ${autoRefresh ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.08)"}`, color: autoRefresh ? "#00e5a0" : "rgba(255,255,255,.3)" }}>{autoRefresh ? "⏸ Auto" : "▶ Auto"}</button>
                <button onClick={disconnect} className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer hover:opacity-80" style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "#ff4d6a" }}>Disconnect</button>
              </div>
            </div>
          </div>

          {/* TERMINAL SCREENSHOT */}
          {terminalScreenshot && (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between px-4 py-2" style={{ background: "rgba(255,255,255,.03)" }}>
                <span className="text-[10px] font-mono font-bold" style={{ color: "rgba(255,255,255,.4)" }}>🖥️ TERMINAL VIEW</span>
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{autoRefresh ? "Auto-refreshing every 5s" : "Click Refresh to update"}</span>
              </div>
              <img src={`data:image/jpeg;base64,${terminalScreenshot}`} alt="MT5 Terminal" className="w-full" style={{ maxHeight: 400, objectFit: "contain", background: "#000" }} />
            </div>
          )}

          {/* TRADE PANEL */}
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm">🎯</span>
              <h3 className="text-xs font-bold text-white tracking-wider" style={{ fontFamily: "'Outfit',sans-serif" }}>QUICK EXECUTION</h3>
            </div>
            {/* Symbol */}
            <div className="mb-4 relative">
              <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>SYMBOL</label>
              <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} onFocus={() => setShowSymbolPicker(true)} className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono font-bold" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
              {showSymbolPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl p-2 z-10 max-h-48 overflow-auto" style={{ background: "#1a1b23", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_SYMBOLS.map(s => (
                      <button key={s} onClick={() => { setSymbol(s); setShowSymbolPicker(false); }} className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer" style={{ background: symbol === s ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.04)", border: `1px solid ${symbol === s ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`, color: symbol === s ? "#00e5a0" : "rgba(255,255,255,.5)" }}>{s}</button>
                    ))}
                  </div>
                  <button onClick={() => setShowSymbolPicker(false)} className="w-full mt-2 py-1.5 rounded-lg text-[9px] font-mono cursor-pointer" style={{ background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.25)" }}>Close</button>
                </div>
              )}
            </div>
            {/* Lots */}
            <div className="mb-4">
              <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>LOT SIZE</label>
              <div className="flex items-center gap-2">
                <button onClick={() => adjustLots(-0.01)} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>−</button>
                <input type="text" value={lots} onChange={e => setLots(e.target.value)} className="flex-1 px-4 py-2.5 rounded-xl text-center text-sm text-white outline-none font-mono font-bold" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <button onClick={() => adjustLots(0.01)} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>+</button>
              </div>
              <div className="flex gap-1.5 mt-2">
                {["0.01", "0.05", "0.10", "0.50", "1.00"].map(l => (
                  <button key={l} onClick={() => setLots(l)} className="flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer" style={{ background: lots === l ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${lots === l ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.05)"}`, color: lots === l ? "#00e5a0" : "rgba(255,255,255,.3)" }}>{l}</button>
                ))}
              </div>
            </div>
            {/* SL/TP */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,77,106,.4)" }}>STOP LOSS (price)</label>
                <input type="text" value={slPrice} onChange={e => setSlPrice(e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 rounded-xl text-xs text-white outline-none font-mono" style={{ background: "rgba(255,77,106,.04)", border: "1px solid rgba(255,77,106,.1)" }} />
              </div>
              <div>
                <label className="block text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(0,229,160,.4)" }}>TAKE PROFIT (price)</label>
                <input type="text" value={tpPrice} onChange={e => setTpPrice(e.target.value)} placeholder="Optional" className="w-full px-3 py-2.5 rounded-xl text-xs text-white outline-none font-mono" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }} />
              </div>
            </div>
            {/* BUY / SELL */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => executeTrade("BUY")} disabled={tradeLoading !== null} className="py-4 rounded-xl font-bold cursor-pointer transition-all" style={{ background: tradeLoading === "BUY" ? "rgba(0,229,160,.15)" : "linear-gradient(135deg, #00e5a0, #00b87d)", color: tradeLoading === "BUY" ? "#00e5a0" : "#0a0b0f", opacity: tradeLoading === "SELL" ? 0.4 : 1 }}>
                {tradeLoading === "BUY" ? (<span className="flex items-center justify-center gap-2"><span className="inline-block w-3 h-3 rounded-full border-2 border-current/20 border-t-current animate-spin" />Executing...</span>) : (<><div className="text-lg font-black">BUY</div><div className="text-[9px] font-mono opacity-70">{symbol} • {lots} lots</div></>)}
              </button>
              <button onClick={() => executeTrade("SELL")} disabled={tradeLoading !== null} className="py-4 rounded-xl font-bold cursor-pointer transition-all" style={{ background: tradeLoading === "SELL" ? "rgba(255,77,106,.15)" : "linear-gradient(135deg, #ff4d6a, #e6364f)", color: "#fff", opacity: tradeLoading === "BUY" ? 0.4 : 1 }}>
                {tradeLoading === "SELL" ? (<span className="flex items-center justify-center gap-2"><span className="inline-block w-3 h-3 rounded-full border-2 border-current/20 border-t-current animate-spin" />Executing...</span>) : (<><div className="text-lg font-black">SELL</div><div className="text-[9px] font-mono opacity-70">{symbol} • {lots} lots</div></>)}
              </button>
            </div>
          </div>

          {/* TRADE LOG */}
          {trades.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-white tracking-wider" style={{ fontFamily: "'Outfit',sans-serif" }}>TRADE LOG</h3>
                <button onClick={() => setTrades([])} className="text-[9px] font-mono cursor-pointer" style={{ color: "rgba(255,255,255,.25)" }}>Clear</button>
              </div>
              <div className="space-y-2 max-h-80 overflow-auto">
                {trades.map(t => (
                  <div key={t.id}>
                    <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded" style={{ background: t.type === "BUY" ? "rgba(0,229,160,.1)" : "rgba(255,77,106,.1)", color: t.type === "BUY" ? "#00e5a0" : "#ff4d6a" }}>{t.type}</span>
                        <div><div className="text-xs font-mono font-bold text-white">{t.symbol} <span style={{ color: "rgba(255,255,255,.3)" }}>× {t.lots}</span></div><div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{t.timestamp.toLocaleTimeString()}</div></div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: t.status === "filled" ? "rgba(0,229,160,.08)" : t.status === "failed" ? "rgba(255,77,106,.08)" : "rgba(245,158,11,.08)", color: t.status === "filled" ? "#00e5a0" : t.status === "failed" ? "#ff4d6a" : "#f59e0b" }}>{t.status === "filled" ? "✓ Executed" : t.status === "failed" ? "✗ Failed" : "⏳ Pending..."}</span>
                    </div>
                    {t.error && <div className="text-[9px] font-mono mt-1 ml-3" style={{ color: "rgba(255,77,106,.5)" }}>{t.error}</div>}
                    {t.screenshot && <img src={`data:image/jpeg;base64,${t.screenshot}`} alt="Trade result" className="mt-2 rounded-lg w-full" style={{ maxHeight: 200, objectFit: "contain", background: "#000" }} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DEBUG PANEL */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.06)" }}>
            <button onClick={() => setShowDebug(!showDebug)} className="w-full flex items-center justify-between px-4 py-3 cursor-pointer" style={{ background: "rgba(255,255,255,.02)" }}>
              <span className="text-[10px] font-mono font-bold" style={{ color: "rgba(255,255,255,.3)" }}>🔬 DEBUG • DOM DISCOVERY</span>
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,.2)" }}>{showDebug ? "▼" : "▶"}</span>
            </button>
            {showDebug && (
              <div className="p-4 space-y-3" style={{ background: "rgba(0,0,0,.2)" }}>
                <button onClick={discoverTerminal} disabled={discovering} className="w-full py-2.5 rounded-xl text-[11px] font-mono font-bold cursor-pointer" style={{ background: "rgba(168,85,247,.08)", border: "1px solid rgba(168,85,247,.2)", color: "#a855f7" }}>{discovering ? "Scanning DOM..." : "🔍 Discover Terminal DOM"}</button>
                {domMap && (
                  <div className="space-y-3">
                    {domMap.inputs?.length > 0 && (<div><div className="text-[9px] font-mono font-bold mb-1" style={{ color: "#f59e0b" }}>INPUTS ({domMap.inputs.length})</div><div className="space-y-1 max-h-32 overflow-auto">{domMap.inputs.map((el: any, i: number) => (<div key={i} className="text-[8px] font-mono px-2 py-1 rounded" style={{ background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.4)" }}><span style={{ color: "#f59e0b" }}>{el.type}</span>{` name="${el.name}" id="${el.id}"`}{el.placeholder && <span style={{ color: "rgba(255,255,255,.2)" }}>{` ph="${el.placeholder}"`}</span>}{el.visible ? <span style={{ color: "#00e5a0" }}> ✓vis</span> : <span style={{ color: "#ff4d6a" }}> ✗hid</span>}</div>))}</div></div>)}
                    {domMap.buttons?.length > 0 && (<div><div className="text-[9px] font-mono font-bold mb-1" style={{ color: "#4da0ff" }}>BUTTONS ({domMap.buttons.length})</div><div className="space-y-1 max-h-32 overflow-auto">{domMap.buttons.map((el: any, i: number) => (<div key={i} className="text-[8px] font-mono px-2 py-1 rounded" style={{ background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.4)" }}>{`"${el.text}" id="${el.id}"`}{el.visible ? <span style={{ color: "#00e5a0" }}> ✓vis</span> : <span style={{ color: "#ff4d6a" }}> ✗hid</span>}<span style={{ color: "rgba(255,255,255,.2)" }}>{` (${Math.round(el.rect.x)},${Math.round(el.rect.y)})`}</span></div>))}</div></div>)}
                    {domMap.canvas?.length > 0 && (<div><div className="text-[9px] font-mono font-bold mb-1" style={{ color: "#a855f7" }}>CANVAS ({domMap.canvas.length})</div><div className="space-y-1">{domMap.canvas.map((el: any, i: number) => (<div key={i} className="text-[8px] font-mono px-2 py-1 rounded" style={{ background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.4)" }}>{el.width}×{el.height}{` pos(${Math.round(el.rect.x)},${Math.round(el.rect.y)})`}</div>))}</div></div>)}
                    {domMap.dialogs?.length > 0 && (<div><div className="text-[9px] font-mono font-bold mb-1" style={{ color: "#00e5a0" }}>DIALOGS ({domMap.dialogs.length})</div><div className="space-y-1">{domMap.dialogs.map((el: any, i: number) => (<div key={i} className="text-[8px] font-mono px-2 py-1 rounded" style={{ background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.4)" }}>{`id="${el.id}"`} {el.visible ? "✓vis" : "✗hid"}</div>))}</div></div>)}
                    <div className="text-[8px] font-mono pt-2" style={{ color: "rgba(255,255,255,.15)", borderTop: "1px solid rgba(255,255,255,.04)" }}>{domMap.canvas?.length > 0 ? "⚠️ Canvas detected — terminal uses WebGL. DOM selectors limited to dialogs & overlays." : "✓ No canvas — DOM-based terminal, selectors should work."}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
