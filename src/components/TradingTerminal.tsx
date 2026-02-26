"use client";
import { useState, useRef, useCallback, useEffect } from "react";

export default function TradingTerminal() {
  // Connection
  const [loginId, setLoginId] = useState("21632565");
  const [server, setServer] = useState("DerivBVI-Server");
  const [connected, setConnected] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState("");

  // Analysis
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState(false);

  const pasteRef = useRef<HTMLDivElement>(null);

  // ═══ Connect — load MT5 iframe ═══
  const connect = useCallback(() => {
    if (!loginId.trim() || !server.trim()) return;
    const url = `https://mt5-real01-web-bvi.deriv.com/terminal?login=${encodeURIComponent(loginId)}&server=${encodeURIComponent(server)}`;
    setTerminalUrl(url);
    setConnected(true);
  }, [loginId, server]);

  const disconnect = useCallback(() => {
    setConnected(false); setTerminalUrl("");
    setAnalysis(null); setCapturedImage(null); setCaptureMode(false);
  }, []);

  // ═══ Handle image from paste / drop / file ═══
  const handleImage = useCallback((file: File | Blob) => {
    if (!file.type.startsWith("image/")) return;
    setCapturedBlob(file instanceof Blob ? file : file);
    const reader = new FileReader();
    reader.onload = () => { setCapturedImage(reader.result as string); setCaptureMode(false); };
    reader.readAsDataURL(file);
  }, []);

  // Paste listener
  useEffect(() => {
    if (!captureMode) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) handleImage(blob);
          e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [captureMode, handleImage]);

  // ═══ Send to AI ═══
  const analyzeChart = useCallback(async () => {
    if (!capturedBlob) return;
    setAnalyzing(true); setProgress(0); setError(null); setAnalysis(null);
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
      if (!res || res.status === 529) throw new Error("Server busy — try again");
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Error ${res.status}`); }

      const data = await res.json();
      clearInterval(iv); setProgress(100);
      setTimeout(() => { setAnalysis(data.analysis); setAnalyzing(false); }, 400);
    } catch (err: any) {
      clearInterval(iv); setAnalyzing(false);
      setError(err?.message || "Analysis failed");
    }
  }, [capturedBlob]);

  // Auto-analyze when image captured
  useEffect(() => {
    if (capturedBlob && !analyzing && !analysis) analyzeChart();
  }, [capturedBlob]); // eslint-disable-line

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
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Connect to your account for live charts & AI analysis</div>
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
              <div className="flex items-end gap-2">
                <button onClick={connect}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold cursor-pointer transition-all hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", color: "#050507" }}>
                  Connect
                </button>
              </div>
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
          </div>
        </div>
      ) : (
        <>
          {/* ═══ CONNECTED — Header bar ═══ */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#00e5a0", boxShadow: "0 0 8px #00e5a0", animation: "pulse 2s infinite" }} />
                  <span className="text-[10px] font-mono font-bold" style={{ color: "#00e5a0" }}>CONNECTED</span>
                </div>
                <span className="text-[11px] font-mono text-white">{loginId}@{server}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Screenshot / Analyze button */}
                <button onClick={() => { setCaptureMode(true); setCapturedImage(null); setCapturedBlob(null); setAnalysis(null); setError(null); }}
                  className="px-4 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1.5 transition-all hover:scale-105"
                  style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#050507", border: "none" }}>
                  📸 AI Analyse Chart
                </button>
                <button onClick={() => window.open(terminalUrl, "_blank")}
                  className="px-2.5 py-1.5 rounded-lg text-[9px] font-mono cursor-pointer"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.35)" }}>↗ Pop Out</button>
                <button onClick={disconnect}
                  className="px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold cursor-pointer"
                  style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "#ff4d6a" }}>Disconnect</button>
              </div>
            </div>
          </div>

          {/* ═══ Capture Mode — Paste / Drop zone ═══ */}
          {captureMode && !capturedImage && (
            <div ref={pasteRef}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(0,229,160,.5)"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(0,229,160,.15)"; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(0,229,160,.15)"; if (e.dataTransfer.files[0]) handleImage(e.dataTransfer.files[0]); }}
              className="rounded-2xl p-6 text-center cursor-pointer transition-all"
              style={{ background: "rgba(0,229,160,.03)", border: "2px dashed rgba(0,229,160,.15)" }}
              onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = () => { if (inp.files?.[0]) handleImage(inp.files[0]); }; inp.click(); }}>
              <div className="text-3xl mb-3">📸</div>
              <div className="text-sm font-bold text-white mb-1">Capture your chart</div>
              <div className="text-[11px] mb-3" style={{ color: "rgba(255,255,255,.4)" }}>
                Screenshot the chart below, then come back here
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <span className="text-[10px]">⌨️</span>
                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.5)" }}>Ctrl+V to paste</span>
                  </div>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,.15)" }}>or</span>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <span className="text-[10px]">📁</span>
                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.5)" }}>Drop / Click to upload</span>
                  </div>
                </div>
                <div className="text-[9px] font-mono mt-1" style={{ color: "rgba(255,255,255,.2)" }}>
                  Tip: Use Win+Shift+S (Windows) or Cmd+Shift+4 (Mac) to screenshot the chart, then paste here
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setCaptureMode(false); }}
                className="mt-3 px-3 py-1 rounded-lg text-[9px] font-mono cursor-pointer"
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.25)" }}>Cancel</button>
            </div>
          )}

          {/* ═══ MT5 Terminal Iframe ═══ */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 8px 32px rgba(0,0,0,.3)" }}>
            <iframe
              src={terminalUrl}
              className="w-full"
              style={{ height: "calc(100vh - 280px)", minHeight: 500, border: "none", background: "#1a1a2e" }}
              allow="clipboard-read; clipboard-write"
              title="Trading Terminal"
            />
          </div>

          {/* ═══ Analysis Progress ═══ */}
          {analyzing && !analysis && (
            <div className="rounded-2xl px-5 py-4" style={{ background: "rgba(168,85,247,.03)", border: "1px solid rgba(168,85,247,.1)" }}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm" style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>🔮</span>
                <span className="text-[12px] font-semibold text-white">FXSynapse AI is analysing your chart...</span>
              </div>
              <div className="w-full rounded-full" style={{ height: 4, background: "rgba(255,255,255,.05)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg,#a855f7,#00e5a0)", boxShadow: "0 0 12px rgba(168,85,247,.4)" }} />
              </div>
              {capturedImage && (
                <div className="mt-3">
                  <img src={capturedImage} alt="Captured chart" className="w-full rounded-xl" style={{ maxHeight: 200, objectFit: "contain", border: "1px solid rgba(255,255,255,.06)", opacity: 0.6 }} />
                </div>
              )}
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

          {/* ═══ Analysis Result ═══ */}
          {A && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="text-[11px] font-bold text-white">⚡ AI ANALYSIS RESULT</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setCaptureMode(true); setCapturedImage(null); setCapturedBlob(null); setAnalysis(null); }}
                    className="text-[9px] font-mono cursor-pointer px-2.5 py-1 rounded-lg"
                    style={{ background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.12)", color: "#00e5a0" }}>📸 New Scan</button>
                  <button onClick={() => { setAnalysis(null); setCapturedImage(null); }}
                    className="text-[9px] font-mono cursor-pointer px-2 py-1 rounded"
                    style={{ background: "rgba(255,255,255,.04)", border: "none", color: "rgba(255,255,255,.2)" }}>✕</button>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-4 p-4">
                {/* Screenshot */}
                {capturedImage && (
                  <div className="lg:w-1/2">
                    <img src={capturedImage} alt="Analysed chart" className="w-full rounded-xl" style={{ border: "1px solid rgba(255,255,255,.06)" }} />
                  </div>
                )}

                {/* Analysis */}
                <div className="lg:w-1/2 flex flex-col gap-2.5">
                  {/* Confidence bar */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>Confidence</span>
                      <span className="text-[12px] font-bold font-mono" style={{ color: cc(A.confidence) }}>{A.confidence}%</span>
                    </div>
                    <div className="w-full rounded-full" style={{ height: 4, background: "rgba(255,255,255,.05)" }}>
                      <div className="h-full rounded-full" style={{ width: `${A.confidence}%`, background: cc(A.confidence), boxShadow: `0 0 8px ${cc(A.confidence)}40` }} />
                    </div>
                  </div>

                  {/* AI Notes */}
                  {A.notes && (
                    <div className="rounded-lg p-3" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }}>
                      <div className="text-[8px] font-mono uppercase tracking-wider mb-1" style={{ color: "#00e5a0" }}>⚡ AI ANALYSIS</div>
                      <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,.55)" }}>{A.notes}</p>
                    </div>
                  )}

                  {/* Trade setup */}
                  <div className="rounded-lg p-3" style={{ background: "rgba(77,160,255,.04)", border: "1px solid rgba(77,160,255,.1)" }}>
                    <div className="text-[8px] font-mono uppercase tracking-wider mb-1.5" style={{ color: "#4da0ff" }}>🎯 TRADE SETUP</div>
                    <div className="flex flex-col gap-1">
                      {[
                        { l: "Trend", v: A.trend, c: A.trend?.toLowerCase().includes("bull") ? "#00e5a0" : A.trend?.toLowerCase().includes("bear") ? "#ff4d6a" : "#f0b90b" },
                        { l: "Entry", v: A.entry_price || A.entry_zone, c: "#00e5a0" },
                        { l: "Take Profit", v: A.take_profit, c: "#4da0ff" },
                        { l: "Stop Loss", v: A.stop_loss, c: "#ff4d6a" },
                        { l: "Risk:Reward", v: A.risk_reward, c: "#f0b90b" },
                        { l: "Setup Grade", v: A.setup_grade ? `Grade ${A.setup_grade}` : null, c: A.setup_grade === "A" ? "#00e5a0" : A.setup_grade === "B" ? "#4da0ff" : "#f0b90b" },
                      ].filter(r => r.v).map((r, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{r.l}</span>
                          <span className="text-[10px] font-mono font-semibold" style={{ color: r.c }}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Structure / Levels */}
                  {A.structure && (
                    <div className="flex justify-between rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Structure</span>
                      <span className="text-[9px] font-mono text-right" style={{ color: "rgba(255,255,255,.5)", maxWidth: "65%" }}>{A.structure}</span>
                    </div>
                  )}

                  {/* Patterns */}
                  {A.patterns && A.patterns.length > 0 && (
                    <div className="rounded-lg p-3" style={{ background: "rgba(156,106,222,.04)", border: "1px solid rgba(156,106,222,.08)" }}>
                      <div className="text-[8px] font-mono uppercase tracking-wider mb-1" style={{ color: "#9b6ade" }}>🔍 PATTERNS</div>
                      {A.patterns.map((pt: any, i: number) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-[9px]" style={{ color: "rgba(255,255,255,.5)" }}>{pt.name}</span>
                          <div className="flex items-center gap-1.5">
                            {pt.location && <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{pt.location}</span>}
                            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{
                              background: pt.significance === "high" ? "rgba(0,229,160,.08)" : "rgba(240,185,11,.08)",
                              color: pt.significance === "high" ? "#00e5a0" : "#f0b90b",
                            }}>{pt.significance}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Order Blocks */}
                  {A.order_blocks && A.order_blocks.length > 0 && (
                    <div className="rounded-lg p-3" style={{ background: "rgba(240,185,11,.03)", border: "1px solid rgba(240,185,11,.08)" }}>
                      <div className="text-[8px] font-mono uppercase tracking-wider mb-1" style={{ color: "#f0b90b" }}>📦 ORDER BLOCKS</div>
                      {A.order_blocks.map((ob: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-[9px]" style={{ color: ob.type?.includes("bullish") ? "#00e5a0" : "#ff4d6a" }}>
                            {ob.type?.includes("bullish") ? "▲ Bullish OB" : "▼ Bearish OB"}
                          </span>
                          <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{ob.high} — {ob.low}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* FVGs */}
                  {A.fvgs && A.fvgs.length > 0 && (
                    <div className="rounded-lg p-3" style={{ background: "rgba(77,160,255,.03)", border: "1px solid rgba(77,160,255,.08)" }}>
                      <div className="text-[8px] font-mono uppercase tracking-wider mb-1" style={{ color: "#4da0ff" }}>⚡ FVGs</div>
                      {A.fvgs.map((fvg: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-[9px]" style={{ color: fvg.type === "bullish" ? "#00e5a0" : "#ff4d6a" }}>
                            {fvg.type === "bullish" ? "▲ Bullish" : "▼ Bearish"}
                          </span>
                          <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{fvg.high} — {fvg.low}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Confluences */}
                  {A.confluences && A.confluences.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {A.confluences.map((cf: string, i: number) => (
                        <span key={i} className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(240,185,11,.06)", color: "#f0b90b", border: "1px solid rgba(240,185,11,.1)" }}>✓ {cf}</span>
                      ))}
                    </div>
                  )}

                  {/* Liquidity */}
                  {A.liquidity_levels && A.liquidity_levels.length > 0 && (
                    <div className="rounded-lg p-3" style={{ background: "rgba(240,185,11,.03)", border: "1px solid rgba(240,185,11,.06)" }}>
                      <div className="text-[8px] font-mono uppercase tracking-wider mb-1" style={{ color: "#f0b90b" }}>💧 LIQUIDITY</div>
                      {A.liquidity_levels.map((liq: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-[9px]" style={{ color: liq.type?.includes("buy") ? "#00e5a0" : "#ff4d6a" }}>
                            {liq.type?.includes("buy") ? "▲" : "▼"} {liq.type} @ {liq.price}
                          </span>
                          <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{liq.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
