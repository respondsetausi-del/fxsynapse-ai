"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// Symbol mapping: what AI might return → Deriv symbol code
const SYMBOL_MAP: Record<string, string> = {
  "gold": "frxXAUUSD", "xauusd": "frxXAUUSD", "gold/usd": "frxXAUUSD",
  "eurusd": "frxEURUSD", "eur/usd": "frxEURUSD",
  "gbpusd": "frxGBPUSD", "gbp/usd": "frxGBPUSD",
  "usdjpy": "frxUSDJPY", "usd/jpy": "frxUSDJPY",
  "gbpjpy": "frxGBPJPY", "gbp/jpy": "frxGBPJPY",
  "audusd": "frxAUDUSD", "aud/usd": "frxAUDUSD",
  "nzdusd": "frxNZDUSD", "nzd/usd": "frxNZDUSD",
  "usdcad": "frxUSDCAD", "usd/cad": "frxUSDCAD",
  "usdchf": "frxUSDCHF", "usd/chf": "frxUSDCHF",
  "eurjpy": "frxEURJPY", "eur/jpy": "frxEURJPY",
  "eurgbp": "frxEURGBP", "eur/gbp": "frxEURGBP",
  "btcusd": "cryBTCUSD", "btc/usd": "cryBTCUSD", "bitcoin": "cryBTCUSD",
  "ethusd": "cryETHUSD", "eth/usd": "cryETHUSD", "ethereum": "cryETHUSD",
  "us30": "OTC_DJI", "dow jones": "OTC_DJI", "dow": "OTC_DJI",
  "nas100": "OTC_NDX", "nasdaq": "OTC_NDX", "us100": "OTC_NDX",
  "spx500": "OTC_SPX500", "sp500": "OTC_SPX500", "s&p": "OTC_SPX500",
  "vol 100": "R_100", "v100": "R_100", "volatility 100": "R_100",
  "vol 75": "R_75", "v75": "R_75", "volatility 75": "R_75",
  "vol 50": "R_50", "v50": "R_50", "volatility 50": "R_50",
  "vol 25": "R_25", "v25": "R_25", "volatility 25": "R_25",
  "boom 1000": "BOOM1000", "boom1000": "BOOM1000",
  "crash 1000": "CRASH1000", "crash1000": "CRASH1000",
  "boom 500": "BOOM500", "boom500": "BOOM500",
  "crash 500": "CRASH500", "crash500": "CRASH500",
};

function resolveSymbol(aiText: string, allSymbols: any[]): { id: string; name: string } | null {
  if (!aiText) return null;
  const t = aiText.toLowerCase().replace(/[^a-z0-9/ ]/g, "").trim();

  // Direct map
  if (SYMBOL_MAP[t]) {
    const sym = allSymbols.find((s: any) => s.symbol === SYMBOL_MAP[t]);
    return { id: SYMBOL_MAP[t], name: sym?.display_name || SYMBOL_MAP[t] };
  }

  // Partial match in map keys
  for (const [key, val] of Object.entries(SYMBOL_MAP)) {
    if (t.includes(key) || key.includes(t)) {
      const sym = allSymbols.find((s: any) => s.symbol === val);
      return { id: val, name: sym?.display_name || val };
    }
  }

  // Search in allSymbols
  const found = allSymbols.find((s: any) =>
    s.display_name?.toLowerCase().includes(t) || s.symbol?.toLowerCase().includes(t)
  );
  if (found) return { id: found.symbol, name: found.display_name };

  return null;
}

interface TradeLog {
  time: string;
  type: "info" | "ok" | "err" | "trade";
  msg: string;
}

export default function TradingTerminal() {
  // Connection
  const [loginId, setLoginId] = useState("21632565");
  const [server, setServer] = useState("DerivBVI-Server");
  const [apiToken, setApiToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [accountInfo, setAccountInfo] = useState<any>(null);

  // Trade settings
  const [lotSize, setLotSize] = useState("0.01");
  const [numTrades, setNumTrades] = useState("1");
  const [autoTrade, setAutoTrade] = useState(false);

  // Analysis
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState(false);

  // Trade execution
  const [executing, setExecuting] = useState(false);
  const [tradeResult, setTradeResult] = useState<any>(null);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [resolvedSymbol, setResolvedSymbol] = useState<{ id: string; name: string } | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const allSymbolsRef = useRef<any[]>([]);
  const connectedRef = useRef(false);
  const tokenRef = useRef("");
  const buyCallbackRef = useRef<{ resolve: (v: any) => void; reject: (e: string) => void } | null>(null);

  const log = useCallback((msg: string, type: TradeLog["type"] = "info") => {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setTradeLogs(prev => [{ time, type, msg }, ...prev].slice(0, 40));
  }, []);

  // ═══ Connect — MT5 iframe + Deriv WS for trading ═══
  const connect = useCallback(() => {
    if (!loginId.trim() || !server.trim()) return;

    // Load MT5 iframe
    const url = `https://mt5-real01-web-bvi.deriv.com/terminal?login=${encodeURIComponent(loginId)}&server=${encodeURIComponent(server)}`;
    setTerminalUrl(url);
    setConnected(true);

    // Connect Deriv WS for trade execution + symbols
    const token = apiToken.trim();
    tokenRef.current = token;

    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    wsRef.current = ws;

    ws.onopen = () => {
      log("WebSocket connected", "ok");
      if (token) {
        ws.send(JSON.stringify({ authorize: token }));
        log("Authorizing with API token...", "info");
      } else {
        ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.msg_type === "authorize") {
          if (data.error) {
            log(`❌ Auth failed: ${data.error.message}`, "err");
            setWsConnected(false);
            return;
          }
          const a = data.authorize;
          setAccountInfo(a);
          setWsConnected(true);
          log(`✅ Authorized: ${a.loginid} — ${a.currency} ${a.balance}`, "ok");
          // Get symbols
          ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
          // Subscribe balance
          ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        }

        if (data.msg_type === "active_symbols") {
          allSymbolsRef.current = data.active_symbols || [];
          log(`Loaded ${data.active_symbols?.length || 0} symbols`, "ok");
          if (!tokenRef.current) setWsConnected(true);
        }

        if (data.msg_type === "balance" && data.balance) {
          setAccountInfo((prev: any) => prev ? { ...prev, balance: data.balance.balance } : prev);
        }

        // Buy response
        if (data.msg_type === "buy") {
          if (data.error) {
            log(`❌ Trade failed: ${data.error.message}`, "err");
            if (buyCallbackRef.current) { buyCallbackRef.current.reject(data.error.message); buyCallbackRef.current = null; }
          } else {
            const b = data.buy;
            log(`✅ TRADE EXECUTED — Contract ID: ${b.contract_id}, Price: ${b.buy_price}`, "trade");
            if (buyCallbackRef.current) { buyCallbackRef.current.resolve(b); buyCallbackRef.current = null; }
          }
        }

        // Proposal response
        if (data.msg_type === "proposal") {
          if (data.error) {
            log(`❌ Proposal error: ${data.error.message}`, "err");
            if (buyCallbackRef.current) { buyCallbackRef.current.reject(data.error.message); buyCallbackRef.current = null; }
          }
        }

      } catch {}
    };

    ws.onclose = () => {
      log("WebSocket closed", "info");
      if (connectedRef.current) setTimeout(() => {
        if (connectedRef.current && wsRef.current?.readyState !== WebSocket.OPEN) {
          log("Reconnecting WS...", "info");
          const ws2 = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
          wsRef.current = ws2;
          ws2.onopen = () => {
            if (tokenRef.current) ws2.send(JSON.stringify({ authorize: tokenRef.current }));
            else ws2.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
          };
          ws2.onmessage = ws.onmessage;
          ws2.onclose = ws.onclose;
        }
      }, 3000);
    };

    connectedRef.current = true;
  }, [loginId, server, apiToken, log]);

  const disconnect = useCallback(() => {
    connectedRef.current = false;
    setConnected(false); setTerminalUrl(""); setWsConnected(false); setAccountInfo(null);
    setAnalysis(null); setCapturedImage(null); setCaptureMode(false); setTradeResult(null);
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
  }, []);

  // ═══ Handle screenshot paste/drop ═══
  const handleImage = useCallback((file: File | Blob) => {
    if (!file.type.startsWith("image/")) return;
    setCapturedBlob(file);
    const reader = new FileReader();
    reader.onload = () => { setCapturedImage(reader.result as string); setCaptureMode(false); };
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    if (!captureMode) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) handleImage(blob);
          e.preventDefault(); break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [captureMode, handleImage]);

  // ═══ AI Analysis ═══
  const analyzeChart = useCallback(async () => {
    if (!capturedBlob) return;
    setAnalyzing(true); setProgress(0); setError(null); setAnalysis(null); setTradeResult(null);
    log("📸 Sending chart to AI...", "info");
    const iv = setInterval(() => setProgress(p => p >= 90 ? 90 : p + Math.random() * 8 + 2), 300);

    try {
      const fd = new FormData();
      fd.append("image", capturedBlob, "chart_screenshot.png");

      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch("/api/analyze", { method: "POST", body: fd });
        if (res.status !== 529) break;
        if (attempt < 2) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
      }
      if (!res || res.status === 529) throw new Error("Server busy");
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Error ${res.status}`); }

      const data = await res.json();
      clearInterval(iv); setProgress(100);

      const A = data.analysis;
      log(`✅ AI Analysis: ${A.trend} — ${A.confidence}% confidence`, "ok");
      log(`   Entry: ${A.entry_price} | TP: ${A.take_profit} | SL: ${A.stop_loss} | R:R: ${A.risk_reward}`, "info");

      // Resolve symbol from AI pair field
      const symbolText = A.pair || A.symbol || A.instrument || "";
      const resolved = resolveSymbol(symbolText, allSymbolsRef.current);
      if (resolved) {
        setResolvedSymbol(resolved);
        log(`🔍 Symbol resolved: "${symbolText}" → ${resolved.name} (${resolved.id})`, "ok");
      } else {
        log(`⚠️ Could not resolve symbol: "${symbolText}" — select manually or trade from terminal`, "err");
        setResolvedSymbol(null);
      }

      setTimeout(() => {
        setAnalysis(A); setAnalyzing(false);
        // Auto-trade if enabled
        if (autoTrade && resolved && A.entry_price && A.stop_loss && A.take_profit && tokenRef.current) {
          log("⚡ Auto-trade enabled — executing...", "trade");
          executeTrade(A, resolved);
        }
      }, 400);
    } catch (err: any) {
      clearInterval(iv); setAnalyzing(false);
      log(`❌ Analysis failed: ${err?.message}`, "err");
      setError(err?.message || "Analysis failed");
    }
  }, [capturedBlob, autoTrade, log]); // eslint-disable-line

  // Auto-analyze on paste
  useEffect(() => {
    if (capturedBlob && !analyzing && !analysis) analyzeChart();
  }, [capturedBlob]); // eslint-disable-line

  // ═══ Execute Trade ═══
  const executeTrade = useCallback(async (A?: any, sym?: { id: string; name: string }) => {
    const a = A || analysis;
    const symbol = sym || resolvedSymbol;
    if (!a || !symbol || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      log("❌ Cannot execute: missing analysis, symbol, or WS connection", "err");
      return;
    }
    if (!tokenRef.current) {
      log("❌ Cannot execute: no API token — add your Deriv API token with Trade scope", "err");
      return;
    }

    setExecuting(true); setTradeResult(null);
    const lots = parseFloat(lotSize) || 0.01;
    const trades = parseInt(numTrades) || 1;
    const isBuy = a.trend?.toLowerCase().includes("bull") || a.trend?.toLowerCase().includes("buy");
    const direction = isBuy ? "BUY" : "SELL";
    const contractType = isBuy ? "MULTUP" : "MULTDOWN";

    log(`🚀 Executing ${trades}x ${direction} on ${symbol.name} — Lot: ${lots}`, "trade");
    log(`   Entry: ${a.entry_price} | SL: ${a.stop_loss} | TP: ${a.take_profit}`, "info");

    let successCount = 0;
    let lastResult: any = null;

    for (let i = 0; i < trades; i++) {
      try {
        log(`📤 Placing trade ${i + 1}/${trades}...`, "info");

        // Calculate SL/TP as pips/amount from entry
        const entry = parseFloat(a.entry_price) || 0;
        const sl = parseFloat(a.stop_loss) || 0;
        const tp = parseFloat(a.take_profit) || 0;
        const slDist = Math.abs(entry - sl);
        const tpDist = Math.abs(entry - tp);

        const stake = lots * 100; // Convert lot to approximate stake

        // Place buy order via Deriv API
        const buyPromise = new Promise<any>((resolve, reject) => {
          buyCallbackRef.current = { resolve, reject };

          const request: any = {
            buy: 1,
            price: stake,
            parameters: {
              contract_type: contractType,
              symbol: symbol.id,
              currency: accountInfo?.currency || "USD",
              amount: stake,
              basis: "stake",
              multiplier: Math.max(10, Math.round(lots * 1000)),
            },
          };

          // Add SL/TP if available
          if (slDist > 0) request.parameters.limit_order = { ...(request.parameters.limit_order || {}), stop_loss: parseFloat(slDist.toFixed(5)) };
          if (tpDist > 0) request.parameters.limit_order = { ...(request.parameters.limit_order || {}), take_profit: parseFloat(tpDist.toFixed(5)) };

          wsRef.current!.send(JSON.stringify(request));
          log(`→ ${JSON.stringify(request).substring(0, 150)}...`, "info");

          // Timeout
          setTimeout(() => {
            if (buyCallbackRef.current) { buyCallbackRef.current.reject("Trade timed out (15s)"); buyCallbackRef.current = null; }
          }, 15000);
        });

        const result = await buyPromise;
        lastResult = result;
        successCount++;
        log(`✅ Trade ${i + 1} executed — ID: ${result.contract_id}, Cost: ${result.buy_price}`, "trade");

        if (i < trades - 1) await new Promise(r => setTimeout(r, 500)); // Small delay between trades
      } catch (err: any) {
        log(`❌ Trade ${i + 1} failed: ${err}`, "err");
      }
    }

    setExecuting(false);
    setTradeResult({ success: successCount, total: trades, lastResult });

    if (successCount === trades) {
      log(`🎉 All ${trades} trades executed successfully!`, "trade");
    } else {
      log(`⚠️ ${successCount}/${trades} trades executed`, successCount > 0 ? "trade" : "err");
    }
  }, [analysis, resolvedSymbol, lotSize, numTrades, accountInfo, log]);

  const cc = (v: number) => v >= 80 ? "#00e5a0" : v >= 60 ? "#4da0ff" : v >= 40 ? "#f0b90b" : "#ff4d6a";
  const A = analysis;

  return (
    <div className="flex flex-col gap-3">
      {/* ═══ NOT CONNECTED ═══ */}
      {!connected ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.15)" }}>
                <span className="text-sm">⚡</span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">Trading Terminal</div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Connect to your account — scan charts, AI trades for you</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-[9px] font-mono mb-1 tracking-wider" style={{ color: "rgba(255,255,255,.3)" }}>LOGIN ID</label>
                <input type="text" value={loginId} onChange={e => setLoginId(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && connect()}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none font-mono"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} placeholder="e.g. 21632565" />
              </div>
              <div>
                <label className="block text-[9px] font-mono mb-1 tracking-wider" style={{ color: "rgba(255,255,255,.3)" }}>SERVER</label>
                <input type="text" value={server} onChange={e => setServer(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && connect()}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none font-mono"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} placeholder="e.g. DerivBVI-Server" />
              </div>
              <div>
                <label className="block text-[9px] font-mono mb-1 tracking-wider" style={{ color: "rgba(255,255,255,.3)" }}>API TOKEN <span style={{ color: "rgba(255,255,255,.15)" }}>(for auto-trade)</span></label>
                <input type="password" value={apiToken} onChange={e => setApiToken(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && connect()}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none font-mono"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} placeholder="Deriv API token (read+trade)" />
              </div>
            </div>

            {/* Trade Settings */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
              <div>
                <label className="block text-[8px] font-mono mb-1 tracking-wider" style={{ color: "rgba(255,255,255,.25)" }}>LOT SIZE</label>
                <input type="text" value={lotSize} onChange={e => setLotSize(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-sm text-white outline-none font-mono text-center"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
              </div>
              <div>
                <label className="block text-[8px] font-mono mb-1 tracking-wider" style={{ color: "rgba(255,255,255,.25)" }}>NUM TRADES</label>
                <input type="text" value={numTrades} onChange={e => setNumTrades(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-sm text-white outline-none font-mono text-center"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
              </div>
              <div className="col-span-2 flex items-end">
                <button onClick={() => setAutoTrade(!autoTrade)}
                  className="w-full py-2 rounded-lg text-[10px] font-bold font-mono cursor-pointer flex items-center justify-center gap-2"
                  style={{
                    background: autoTrade ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.03)",
                    border: `1px solid ${autoTrade ? "rgba(0,229,160,.25)" : "rgba(255,255,255,.06)"}`,
                    color: autoTrade ? "#00e5a0" : "rgba(255,255,255,.35)",
                  }}>
                  <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{
                    background: autoTrade ? "#00e5a0" : "rgba(255,255,255,.1)",
                    transition: "all .2s",
                  }}>
                    {autoTrade && <span className="text-[7px]" style={{ color: "#050507" }}>✓</span>}
                  </div>
                  AUTO-TRADE {autoTrade ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <div className="flex gap-2 items-center mb-3">
              <button onClick={connect}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-bold cursor-pointer transition-all hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", color: "#050507" }}>Connect</button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>Presets:</span>
              {[
                { label: "Deriv BVI Real", login: "21632565", srv: "DerivBVI-Server" },
                { label: "Deriv SVG Demo", login: "", srv: "DerivSVG-Demo" },
                { label: "Deriv BVI Demo", login: "", srv: "DerivBVI-Demo" },
              ].map(p => (
                <button key={p.label} onClick={() => { if (p.login) setLoginId(p.login); setServer(p.srv); }}
                  className="px-2 py-0.5 rounded text-[9px] font-mono cursor-pointer"
                  style={{ background: "rgba(77,160,255,.06)", border: "1px solid rgba(77,160,255,.1)", color: "#4da0ff" }}>{p.label}</button>
              ))}
            </div>
            <div className="mt-2 text-[8px] font-mono" style={{ color: "rgba(255,255,255,.12)" }}>
              API token: Deriv → Settings → API token → Create with Read + Trade scope. Without token, AI analysis works but trades must be placed manually.
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ═══ CONNECTED — Header ═══ */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 8px #00e5a0", animation: "pulse 2s infinite" }} />
                  <span className="text-[10px] font-mono font-bold" style={{ color: "#00e5a0" }}>CONNECTED</span>
                </div>
                <span className="text-[11px] font-mono text-white">{loginId}@{server}</span>
                {accountInfo && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(0,229,160,.06)", color: "#00e5a0" }}>
                    {accountInfo.currency} {parseFloat(accountInfo.balance).toFixed(2)}
                  </span>
                )}
                {wsConnected && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(77,160,255,.08)", color: "#4da0ff" }}>API ✓</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Trade settings inline */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.04)" }}>
                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>LOT</span>
                  <input type="text" value={lotSize} onChange={e => setLotSize(e.target.value)}
                    className="w-12 text-center text-[10px] font-mono text-white outline-none"
                    style={{ background: "transparent", border: "none" }} />
                  <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>×</span>
                  <input type="text" value={numTrades} onChange={e => setNumTrades(e.target.value)}
                    className="w-6 text-center text-[10px] font-mono text-white outline-none"
                    style={{ background: "transparent", border: "none" }} />
                </div>
                <button onClick={() => setAutoTrade(!autoTrade)}
                  className="px-2.5 py-1.5 rounded-lg text-[9px] font-mono font-bold cursor-pointer"
                  style={{
                    background: autoTrade ? "rgba(0,229,160,.12)" : "rgba(255,255,255,.03)",
                    border: `1px solid ${autoTrade ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
                    color: autoTrade ? "#00e5a0" : "rgba(255,255,255,.25)",
                  }}>{autoTrade ? "⚡ AUTO" : "AUTO"}</button>
                <button onClick={() => { setCaptureMode(true); setCapturedImage(null); setCapturedBlob(null); setAnalysis(null); setError(null); setTradeResult(null); }}
                  className="px-4 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1.5 transition-all hover:scale-105"
                  style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", border: "none" }}>
                  📸 AI Analyse
                </button>
                <button onClick={disconnect}
                  className="px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold cursor-pointer"
                  style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "#ff4d6a" }}>Disconnect</button>
              </div>
            </div>
          </div>

          {/* ═══ Capture Zone ═══ */}
          {captureMode && !capturedImage && (
            <div
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(0,229,160,.5)"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(0,229,160,.15)"; }}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleImage(e.dataTransfer.files[0]); }}
              className="rounded-2xl p-5 text-center cursor-pointer"
              style={{ background: "rgba(0,229,160,.03)", border: "2px dashed rgba(0,229,160,.15)" }}
              onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = () => { if (inp.files?.[0]) handleImage(inp.files[0]); }; inp.click(); }}>
              <div className="text-2xl mb-2">📸</div>
              <div className="text-sm font-bold text-white mb-1">Screenshot your chart</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>
                Use <span className="font-mono px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,.06)" }}>Win+Shift+S</span> or <span className="font-mono px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,.06)" }}>Cmd+Shift+4</span> then <span className="font-mono px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,.06)" }}>Ctrl+V</span> here
              </div>
              <div className="text-[9px] font-mono mt-2" style={{ color: "rgba(255,255,255,.15)" }}>Or drag & drop / click to upload</div>
              {autoTrade && tokenRef.current && (
                <div className="mt-2 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5" style={{ background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.12)" }}>
                  <span className="text-[9px] font-mono font-bold" style={{ color: "#00e5a0" }}>⚡ AUTO-TRADE ON — Will execute {numTrades}x {lotSize} lot after AI scan</span>
                </div>
              )}
              <div className="mt-2">
                <button onClick={(e) => { e.stopPropagation(); setCaptureMode(false); }}
                  className="px-3 py-1 rounded-lg text-[9px] font-mono cursor-pointer"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.2)" }}>Cancel</button>
              </div>
            </div>
          )}

          {/* ═══ MT5 Terminal ═══ */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.08)" }}>
            <iframe src={terminalUrl} className="w-full"
              style={{ height: "calc(100vh - 300px)", minHeight: 450, border: "none", background: "#1a1a2e" }}
              allow="clipboard-read; clipboard-write" title="Trading Terminal" />
          </div>

          {/* ═══ Analysis Progress ═══ */}
          {analyzing && !analysis && (
            <div className="rounded-2xl px-5 py-4" style={{ background: "rgba(168,85,247,.03)", border: "1px solid rgba(168,85,247,.1)" }}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm" style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>🔮</span>
                <span className="text-[12px] font-semibold text-white">AI analysing chart...</span>
              </div>
              <div className="w-full rounded-full" style={{ height: 4, background: "rgba(255,255,255,.05)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg,#a855f7,#00e5a0)" }} />
              </div>
            </div>
          )}

          {/* ═══ Error ═══ */}
          {error && (
            <div className="rounded-2xl px-5 py-3 flex items-center justify-between" style={{ background: "rgba(255,77,106,.05)", border: "1px solid rgba(255,77,106,.12)" }}>
              <span className="text-[11px] font-mono" style={{ color: "#ff4d6a" }}>❌ {error}</span>
              <button onClick={() => { setError(null); if (capturedBlob) analyzeChart(); }}
                className="text-[9px] font-mono font-bold cursor-pointer px-2 py-1 rounded"
                style={{ background: "rgba(255,77,106,.1)", border: "none", color: "#ff4d6a" }}>Retry</button>
            </div>
          )}

          {/* ═══ Analysis + Trade Execution ═══ */}
          {A && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-white">⚡ AI ANALYSIS</span>
                  {resolvedSymbol && <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ background: "rgba(0,229,160,.06)", color: "#00e5a0" }}>{resolvedSymbol.name}</span>}
                </div>
                <button onClick={() => { setCaptureMode(true); setCapturedImage(null); setCapturedBlob(null); setAnalysis(null); setTradeResult(null); }}
                  className="text-[9px] font-mono cursor-pointer px-2.5 py-1 rounded-lg"
                  style={{ background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.12)", color: "#00e5a0" }}>📸 New Scan</button>
              </div>

              <div className="flex flex-col lg:flex-row gap-4 p-4">
                {/* Left — Screenshot + Quick info */}
                <div className="lg:w-5/12 flex flex-col gap-2.5">
                  {capturedImage && (
                    <img src={capturedImage} alt="Chart" className="w-full rounded-xl" style={{ border: "1px solid rgba(255,255,255,.06)" }} />
                  )}
                  {A.notes && (
                    <div className="rounded-lg p-3" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }}>
                      <div className="text-[8px] font-mono uppercase tracking-wider mb-1" style={{ color: "#00e5a0" }}>⚡ AI</div>
                      <p className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,.5)" }}>{A.notes}</p>
                    </div>
                  )}
                </div>

                {/* Right — Trade setup + Execute */}
                <div className="lg:w-7/12 flex flex-col gap-2.5">
                  {/* Confidence */}
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>Confidence</span>
                    <span className="text-[13px] font-bold font-mono" style={{ color: cc(A.confidence) }}>{A.confidence}%</span>
                  </div>
                  <div className="w-full rounded-full" style={{ height: 4, background: "rgba(255,255,255,.05)" }}>
                    <div className="h-full rounded-full" style={{ width: `${A.confidence}%`, background: cc(A.confidence) }} />
                  </div>

                  {/* Trade setup card */}
                  <div className="rounded-xl p-4" style={{ background: "rgba(77,160,255,.04)", border: "1px solid rgba(77,160,255,.12)" }}>
                    <div className="text-[9px] font-mono uppercase tracking-wider mb-2" style={{ color: "#4da0ff" }}>🎯 TRADE SETUP</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {[
                        { l: "Trend", v: A.trend, c: A.trend?.toLowerCase().includes("bull") ? "#00e5a0" : "#ff4d6a" },
                        { l: "Symbol", v: resolvedSymbol?.name || A.pair || A.symbol || "—", c: "#fff" },
                        { l: "Entry", v: A.entry_price || A.entry_zone, c: "#00e5a0" },
                        { l: "Take Profit", v: A.take_profit, c: "#4da0ff" },
                        { l: "Stop Loss", v: A.stop_loss, c: "#ff4d6a" },
                        { l: "Risk:Reward", v: A.risk_reward, c: "#f0b90b" },
                        { l: "Lot Size", v: lotSize, c: "#fff" },
                        { l: "Trades", v: `${numTrades}x`, c: "#fff" },
                      ].filter(r => r.v).map((r, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{r.l}</span>
                          <span className="text-[10px] font-mono font-bold" style={{ color: r.c }}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Execute button */}
                  {!tradeResult && (
                    <button onClick={() => executeTrade()} disabled={executing || !resolvedSymbol || !tokenRef.current}
                      className="w-full py-3 rounded-xl text-[13px] font-bold cursor-pointer flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                      style={{
                        background: executing ? "rgba(168,85,247,.1)" : A.trend?.toLowerCase().includes("bull")
                          ? "linear-gradient(135deg,#00e5a0,#00b87d)" : "linear-gradient(135deg,#ff4d6a,#d43b55)",
                        border: "none", color: executing ? "#a855f7" : "#fff",
                        opacity: (!resolvedSymbol || !tokenRef.current) ? 0.35 : 1,
                      }}>
                      {executing ? (
                        <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> Executing...</>
                      ) : (
                        <>{A.trend?.toLowerCase().includes("bull") ? "🚀" : "📉"} Execute {numTrades}x {A.trend?.toLowerCase().includes("bull") ? "BUY" : "SELL"} — {lotSize} lot</>
                      )}
                    </button>
                  )}
                  {!tokenRef.current && (
                    <div className="text-[9px] font-mono text-center" style={{ color: "rgba(255,77,106,.6)" }}>⚠️ Add Deriv API token with Trade scope to enable execution</div>
                  )}

                  {/* Trade result */}
                  {tradeResult && (
                    <div className="rounded-xl p-3" style={{
                      background: tradeResult.success > 0 ? "rgba(0,229,160,.06)" : "rgba(255,77,106,.06)",
                      border: `1px solid ${tradeResult.success > 0 ? "rgba(0,229,160,.15)" : "rgba(255,77,106,.15)"}`,
                    }}>
                      <div className="text-[11px] font-bold mb-1" style={{ color: tradeResult.success > 0 ? "#00e5a0" : "#ff4d6a" }}>
                        {tradeResult.success === tradeResult.total ? "🎉 All trades executed!" : `⚠️ ${tradeResult.success}/${tradeResult.total} executed`}
                      </div>
                      {tradeResult.lastResult && (
                        <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>
                          Last contract: {tradeResult.lastResult.contract_id} — Cost: {tradeResult.lastResult.buy_price}
                        </div>
                      )}
                      <button onClick={() => { setCaptureMode(true); setCapturedImage(null); setCapturedBlob(null); setAnalysis(null); setTradeResult(null); }}
                        className="mt-2 w-full py-2 rounded-lg text-[10px] font-bold cursor-pointer"
                        style={{ background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.12)", color: "#00e5a0" }}>📸 Scan Next Chart</button>
                    </div>
                  )}

                  {/* Patterns / Confluences compact */}
                  {A.patterns && A.patterns.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {A.patterns.map((pt: any, i: number) => (
                        <span key={i} className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{
                          background: pt.significance === "high" ? "rgba(0,229,160,.06)" : "rgba(240,185,11,.06)",
                          color: pt.significance === "high" ? "#00e5a0" : "#f0b90b",
                        }}>🔍 {pt.name}</span>
                      ))}
                    </div>
                  )}
                  {A.confluences && A.confluences.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {A.confluences.map((cf: string, i: number) => (
                        <span key={i} className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(240,185,11,.05)", color: "#f0b90b" }}>✓ {cf}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ Trade Log ═══ */}
          {tradeLogs.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="text-[9px] font-mono font-bold" style={{ color: "rgba(255,255,255,.3)" }}>TRADE LOG</span>
                <button onClick={() => setTradeLogs([])} className="text-[8px] font-mono cursor-pointer"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.15)" }}>Clear</button>
              </div>
              <div className="max-h-40 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: "thin", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                {tradeLogs.map((l, i) => (
                  <div key={i} className="flex gap-2 py-0.5" style={{
                    color: l.type === "ok" ? "#00e5a0" : l.type === "err" ? "#ff4d6a" : l.type === "trade" ? "#f0b90b" : "rgba(255,255,255,.3)"
                  }}>
                    <span style={{ color: "rgba(255,255,255,.15)", flexShrink: 0 }}>{l.time}</span>
                    <span>{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
