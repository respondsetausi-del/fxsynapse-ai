"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Candle, RSI, SMA, EMA, MACD, BollingerBands, ATR, Stochastic,
  calculateSummary, detectCandlePatterns,
} from "@/lib/indicators";

interface Message { role: "ai" | "user"; text: string; }
interface LogEntry { time: string; msg: string; type: "info" | "ok" | "err" | "ws"; }

const SYMBOL_ALIASES: Record<string, string> = {
  "gold": "frxXAUUSD", "xauusd": "frxXAUUSD", "xau usd": "frxXAUUSD", "xau": "frxXAUUSD",
  "eurusd": "frxEURUSD", "euro dollar": "frxEURUSD", "eur usd": "frxEURUSD", "euro": "frxEURUSD",
  "gbpusd": "frxGBPUSD", "pound dollar": "frxGBPUSD", "cable": "frxGBPUSD", "pound": "frxGBPUSD",
  "usdjpy": "frxUSDJPY", "dollar yen": "frxUSDJPY", "yen": "frxUSDJPY",
  "gbpjpy": "frxGBPJPY", "pound yen": "frxGBPJPY",
  "audusd": "frxAUDUSD", "aussie": "frxAUDUSD",
  "usdcad": "frxUSDCAD", "nzdusd": "frxNZDUSD", "eurgbp": "frxEURGBP", "eurjpy": "frxEURJPY",
  "bitcoin": "cryBTCUSD", "btc": "cryBTCUSD", "btcusd": "cryBTCUSD",
  "ethereum": "cryETHUSD", "eth": "cryETHUSD", "ethusd": "cryETHUSD",
  "volatility 100": "R_100", "vol 100": "R_100", "v100": "R_100", "volatility100": "R_100",
  "volatility 75": "R_75", "vol 75": "R_75", "v75": "R_75", "volatility75": "R_75",
  "volatility 50": "R_50", "vol 50": "R_50", "v50": "R_50",
  "volatility 25": "R_25", "vol 25": "R_25", "v25": "R_25",
  "volatility 10": "R_10", "vol 10": "R_10", "v10": "R_10",
  "boom 1000": "BOOM1000", "boom": "BOOM1000", "boom1000": "BOOM1000",
  "crash 1000": "CRASH1000", "crash": "CRASH1000", "crash1000": "CRASH1000",
  "boom 500": "BOOM500", "crash 500": "CRASH500",
  "nas": "stpRNG", "nasdaq": "stpRNG", "nas100": "stpRNG",
};

const TF_MAP: Record<string, { value: number; label: string }> = {
  "m1": { value: 60, label: "M1" }, "1 minute": { value: 60, label: "M1" },
  "m5": { value: 300, label: "M5" }, "5 minute": { value: 300, label: "M5" }, "5 minutes": { value: 300, label: "M5" },
  "m15": { value: 900, label: "M15" }, "15 minute": { value: 900, label: "M15" }, "15 minutes": { value: 900, label: "M15" },
  "m30": { value: 1800, label: "M30" }, "30 minute": { value: 1800, label: "M30" },
  "h1": { value: 3600, label: "H1" }, "1 hour": { value: 3600, label: "H1" }, "one hour": { value: 3600, label: "H1" },
  "h4": { value: 14400, label: "H4" }, "4 hour": { value: 14400, label: "H4" }, "4 hours": { value: 14400, label: "H4" },
  "d1": { value: 86400, label: "D1" }, "daily": { value: 86400, label: "D1" }, "1 day": { value: 86400, label: "D1" },
};

export default function VoiceAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [wsStatus, setWsStatus] = useState<"offline" | "connecting" | "connected" | "ready">("offline");
  const [symbolCount, setSymbolCount] = useState(0);
  const [analysis, setAnalysis] = useState<any>(null);
  const [statusText, setStatusText] = useState("");
  const [debugLogs, setDebugLogs] = useState<LogEntry[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const allSymbolsRef = useRef<any[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activeCtx = useRef({ symbol: "", display: "", tfLabel: "" });
  // Promise-based candle fetching
  const candleCallbackRef = useRef<{ resolve: (c: Candle[]) => void; reject: (e: string) => void } | null>(null);
  const reconnectTimer = useRef<any>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ═══ Debug logger ═══
  const log = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    const entry: LogEntry = { time: new Date().toLocaleTimeString(), msg, type };
    setDebugLogs(prev => [...prev.slice(-30), entry]);
    console.log(`[FXSynapse ${type.toUpperCase()}]`, msg);
  }, []);

  // ═══ Speech ═══
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!voiceEnabled || typeof window === "undefined") { resolve(); return; }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0; utter.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const pref = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) ||
        voices.find(v => v.lang.startsWith("en-") && !v.name.includes("Whisper")) ||
        voices.find(v => v.lang.startsWith("en"));
      if (pref) utter.voice = pref;
      utter.onstart = () => setIsSpeaking(true);
      utter.onend = () => { setIsSpeaking(false); resolve(); };
      utter.onerror = () => { setIsSpeaking(false); resolve(); };
      window.speechSynthesis.speak(utter);
    });
  }, [voiceEnabled]);

  const listen = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const SR = (window as any)?.SpeechRecognition || (window as any)?.webkitSpeechRecognition;
      if (!SR) { reject("not supported"); return; }
      const rec = new SR();
      rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
      rec.onresult = (e: any) => { setIsListening(false); resolve(e.results[0][0].transcript); };
      rec.onerror = () => { setIsListening(false); reject("error"); };
      rec.onend = () => setIsListening(false);
      rec.start(); setIsListening(true);
    });
  }, []);

  // ═══ WebSocket Connection ═══
  const connectWS = useCallback(() => {
    // Clean up existing
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }

    log("Connecting to Deriv WebSocket...", "ws");
    setWsStatus("connecting");

    try {
      const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
      wsRef.current = ws;

      ws.onopen = () => {
        log("✅ WebSocket OPEN — requesting symbols...", "ok");
        setWsStatus("connected");
        // Request all available symbols
        ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // ── Active symbols response ──
          if (data.msg_type === "active_symbols") {
            const syms = data.active_symbols || [];
            allSymbolsRef.current = syms;
            setSymbolCount(syms.length);
            setWsStatus("ready");
            log(`✅ Loaded ${syms.length} symbols — READY`, "ok");
          }

          // ── Candle history response ──
          if (data.msg_type === "candles") {
            const candles: Candle[] = (data.candles || []).map((x: any) => ({
              time: x.epoch, open: +x.open, high: +x.high, low: +x.low, close: +x.close, volume: 0,
            }));
            log(`📊 Received ${candles.length} candles`, "ok");
            if (candleCallbackRef.current) {
              candleCallbackRef.current.resolve(candles);
              candleCallbackRef.current = null;
            }
          }

          // ── Tick response (live price updates) ──
          if (data.msg_type === "tick") {
            // silently accept
          }

          // ── Error from Deriv ──
          if (data.error) {
            const errMsg = data.error.message || JSON.stringify(data.error);
            log(`❌ Deriv error: ${errMsg}`, "err");
            if (candleCallbackRef.current) {
              candleCallbackRef.current.reject(`Deriv: ${errMsg}`);
              candleCallbackRef.current = null;
            }
          }

        } catch (parseErr) {
          log(`❌ Failed to parse WS message`, "err");
        }
      };

      ws.onclose = (e) => {
        log(`WebSocket closed (code: ${e.code})`, "ws");
        setWsStatus("offline");
        wsRef.current = null;
        // Reject any pending candle request
        if (candleCallbackRef.current) {
          candleCallbackRef.current.reject("WebSocket disconnected");
          candleCallbackRef.current = null;
        }
        // Auto-reconnect after 3s
        reconnectTimer.current = setTimeout(() => {
          log("Auto-reconnecting...", "ws");
          connectWS();
        }, 3000);
      };

      ws.onerror = (e) => {
        log(`❌ WebSocket error`, "err");
        setWsStatus("offline");
      };

    } catch (err) {
      log(`❌ Failed to create WebSocket: ${err}`, "err");
      setWsStatus("offline");
    }
  }, [log]);

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) try { wsRef.current.close(); } catch {}
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connectWS]);

  // ═══ Wait until WS is ready (symbols loaded) ═══
  const waitForReady = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Already ready
      if (wsRef.current?.readyState === WebSocket.OPEN && allSymbolsRef.current.length > 0) {
        resolve(); return;
      }
      log("Waiting for WS to be ready...", "info");
      let elapsed = 0;
      const iv = setInterval(() => {
        elapsed += 200;
        if (wsRef.current?.readyState === WebSocket.OPEN && allSymbolsRef.current.length > 0) {
          clearInterval(iv);
          log("WS ready ✓", "ok");
          resolve();
        }
        if (elapsed > 8000) {
          clearInterval(iv);
          log("⏰ WS timeout — not ready after 8s", "err");
          reject("Market data connection timeout. Try reconnecting.");
        }
      }, 200);
    });
  }, [log]);

  // ═══ Fetch candles — Promise-based ═══
  const fetchCandles = useCallback((symbol: string, granularity: number): Promise<Candle[]> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject("WebSocket not connected"); return;
      }

      log(`Requesting 200 candles: ${symbol} granularity=${granularity}`, "ws");

      // Set up callback before sending
      candleCallbackRef.current = { resolve, reject };

      // Send candle history request
      const req = { ticks_history: symbol, adjust_start_time: 1, count: 200, end: "latest", granularity, style: "candles" };
      log(`→ ${JSON.stringify(req)}`, "ws");
      ws.send(JSON.stringify(req));

      // Timeout safety
      setTimeout(() => {
        if (candleCallbackRef.current) {
          log("⏰ Candle fetch timeout (10s)", "err");
          candleCallbackRef.current.reject("Candle data timeout — market might be closed for this symbol");
          candleCallbackRef.current = null;
        }
      }, 10000);
    });
  }, [log]);

  // ═══ Run full indicator analysis ═══
  const runAnalysis = useCallback((candleData: Candle[], symbolDisplay: string, tfLabel: string) => {
    if (candleData.length < 30) {
      log(`Only ${candleData.length} candles — need at least 30`, "err");
      return null;
    }
    log(`Running analysis on ${candleData.length} candles...`, "info");
    const closes = candleData.map(c => c.close);
    const last = candleData.length - 1;
    const price = candleData[last].close;
    let summary: any = null;
    try { summary = calculateSummary(candleData); } catch {}
    let patterns: any[] = [];
    try { patterns = detectCandlePatterns(candleData); } catch {}

    const rsi = RSI(closes, 14)[last];
    const sma20 = SMA(closes, 20)[last];
    const sma50 = SMA(closes, 50)[last];
    const macd = MACD(closes);
    const bb = BollingerBands(closes);
    const atrVals = ATR(candleData, 14);
    const atr = atrVals[last] || price * 0.005;
    const stoch = Stochastic(candleData);

    let buy = 0, sell = 0;
    if (rsi !== null) { if (rsi < 40) buy += 2; else if (rsi > 60) sell += 2; }
    if (sma20 !== null) { if (price > sma20) buy++; else sell++; }
    if (sma50 !== null) { if (price > sma50) buy++; else sell++; }
    if (macd.macd[last] !== null && macd.signal[last] !== null) { if (macd.macd[last]! > macd.signal[last]!) buy++; else sell++; }
    if (bb.lower[last] !== null && price < bb.lower[last]!) buy += 2;
    if (bb.upper[last] !== null && price > bb.upper[last]!) sell += 2;
    for (const p of patterns) { if (p.type === "bullish") buy += p.strength; if (p.type === "bearish") sell += p.strength; }

    const direction = buy >= sell ? "BUY" : "SELL";
    const confidence = Math.round((Math.max(buy, sell) / (buy + sell + 1)) * 100);
    const slDist = atr * 1.5, tpDist = atr * 2.5;
    const digits = price > 100 ? 2 : price > 1 ? 4 : 5;

    const result = {
      symbol: symbolDisplay, timeframe: tfLabel, direction, confidence,
      entry: +price.toFixed(digits),
      sl: +(direction === "BUY" ? price - slDist : price + slDist).toFixed(digits),
      tp: +(direction === "BUY" ? price + tpDist : price - tpDist).toFixed(digits),
      rr: +(tpDist / slDist).toFixed(1),
      rsi: rsi?.toFixed(1) || "N/A", sma20: sma20?.toFixed(digits) || "N/A", sma50: sma50?.toFixed(digits) || "N/A",
      macd: macd.macd[last]?.toFixed(3) || "N/A", macdSignal: macd.signal[last]?.toFixed(3) || "N/A",
      bbUpper: bb.upper[last]?.toFixed(digits) || "N/A", bbLower: bb.lower[last]?.toFixed(digits) || "N/A",
      atr: atr.toFixed(digits), stochK: stoch.k[last]?.toFixed(1) || "N/A", stochD: stoch.d[last]?.toFixed(1) || "N/A",
      patterns: patterns.map(p => `${p.emoji} ${p.name} (${p.type}, ${p.strength}/3)`),
      bias: summary?.overallBias || "neutral", buyScore: buy, sellScore: sell, candleCount: candleData.length,
    };
    log(`✅ Analysis complete: ${result.direction} ${result.confidence}% @ ${result.entry}`, "ok");
    return result;
  }, [log]);

  // ═══ Symbol + TF resolution ═══
  const resolveSymbol = useCallback((text: string): { symbol: string; display: string } | null => {
    const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    // Check aliases first
    for (const [alias, symbol] of Object.entries(SYMBOL_ALIASES)) {
      if (lower.includes(alias)) {
        const found = allSymbolsRef.current.find((s: any) => s.symbol === symbol);
        const display = found?.display_name || symbol.replace("frx", "").replace("cry", "");
        log(`Symbol matched: "${alias}" → ${symbol} (${display})`, "info");
        return { symbol, display };
      }
    }
    // Search in active symbols
    const found = allSymbolsRef.current.find((s: any) =>
      s.display_name?.toLowerCase().includes(lower) || s.symbol?.toLowerCase().includes(lower.replace(/\s/g, ""))
    );
    if (found) {
      log(`Symbol found in active list: ${found.symbol} (${found.display_name})`, "info");
      return { symbol: found.symbol, display: found.display_name };
    }
    return null;
  }, [log]);

  const resolveTimeframe = useCallback((text: string): { value: number; label: string } | null => {
    const lower = text.toLowerCase().trim();
    for (const [key, tf] of Object.entries(TF_MAP)) {
      if (lower.includes(key)) return tf;
    }
    return null;
  }, []);

  // ═══ Send to Claude API ═══
  const sendToAI = useCallback(async (msgs: Message[], analysisData?: any): Promise<string> => {
    try {
      const body = { messages: msgs.slice(-12), analysis: analysisData || null };
      log(`Calling Claude API (${msgs.length} messages)...`, "info");
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        log(`❌ Claude API error: ${res.status} ${errText}`, "err");
        throw new Error(errText);
      }
      const data = await res.json();
      log(`✅ Claude response received`, "ok");
      return data.text || "Sorry, could you try again?";
    } catch (err: any) {
      log(`❌ AI error: ${err?.message || err}`, "err");
      return "I had a connection issue. Could you say that again?";
    }
  }, [log]);

  // ═══ MAIN INPUT HANDLER ═══
  const handleInput = useCallback(async (text: string) => {
    log(`User: "${text}"`, "info");
    const userMsg: Message = { role: "user", text };
    const newMsgs = [...messagesRef.current, userMsg];
    setMessages(newMsgs);
    setIsThinking(true);
    setStatusText("");

    const sym = resolveSymbol(text);
    const tf = resolveTimeframe(text);

    // Track context
    if (sym) { activeCtx.current.symbol = sym.symbol; activeCtx.current.display = sym.display; }
    if (tf) { activeCtx.current.tfLabel = tf.label; }

    // ── Got symbol + timeframe → full analysis ──
    const finalSym = sym ? sym : (activeCtx.current.symbol ? { symbol: activeCtx.current.symbol, display: activeCtx.current.display } : null);
    const finalTf = tf ? tf : null;

    // Trigger analysis if we have BOTH and at least one is NEW
    if (finalSym && finalTf && (sym || tf)) {
      setStatusText(`Connecting to ${finalSym.display}...`);

      // 1. Wait for WS + symbols
      try {
        await waitForReady();
      } catch (err: any) {
        const errMsg: Message = { role: "ai", text: `I can't connect to market data right now. ${err}` };
        setMessages(prev => [...prev, errMsg]); setIsThinking(false);
        speak(errMsg.text); return;
      }

      // 2. Tell user we're fetching
      setStatusText(`Fetching ${finalSym.display} ${finalTf.label}...`);
      const fetchMsg: Message = { role: "ai", text: `Pulling up ${finalSym.display} on the ${finalTf.label} timeframe — one sec...` };
      setMessages(prev => [...prev, fetchMsg]);
      speak(fetchMsg.text);

      // 3. Fetch candles
      try {
        const candles = await fetchCandles(finalSym.symbol, finalTf.value);

        if (candles.length < 30) {
          const errMsg: Message = { role: "ai", text: `Only got ${candles.length} candles — not enough for a proper analysis. The market might be closed or this symbol has limited history on ${finalTf.label}. Try a lower timeframe?` };
          setMessages(prev => [...prev, errMsg]); setIsThinking(false);
          speak(errMsg.text); return;
        }

        // 4. Run indicators
        setStatusText(`Analysing ${candles.length} candles...`);
        const result = runAnalysis(candles, finalSym.display, finalTf.label);
        if (!result) {
          const errMsg: Message = { role: "ai", text: "Analysis failed — couldn't calculate indicators. Try a different symbol or timeframe?" };
          setMessages(prev => [...prev, errMsg]); setIsThinking(false);
          speak(errMsg.text); return;
        }

        setAnalysis(result);
        setStatusText("");

        // 5. Send to Claude for natural voice presentation
        const allMsgs = [...newMsgs, fetchMsg];
        const aiText = await sendToAI(allMsgs, result);
        const aiMsg: Message = { role: "ai", text: aiText };
        setMessages(prev => [...prev, aiMsg]);
        setIsThinking(false);
        speak(aiText);

      } catch (err: any) {
        setStatusText("");
        log(`Fetch failed: ${err}`, "err");
        const errMsg: Message = { role: "ai", text: `Couldn't get candle data for ${finalSym.display}. ${typeof err === "string" ? err : "The market might be closed or symbol unavailable."}` };
        setMessages(prev => [...prev, errMsg]); setIsThinking(false);
        speak(errMsg.text);
      }
      return;
    }

    // ── Only symbol, no timeframe → ask for it ──
    if (sym && !tf && !activeCtx.current.tfLabel) {
      log("Got symbol but no timeframe, asking AI...", "info");
    }

    // ── Normal chat (or asking for tf) → send to Claude ──
    const aiText = await sendToAI(newMsgs);
    const aiMsg: Message = { role: "ai", text: aiText };
    setMessages(prev => [...prev, aiMsg]);
    setIsThinking(false);
    setStatusText("");
    speak(aiText);
  }, [resolveSymbol, resolveTimeframe, waitForReady, fetchCandles, runAnalysis, sendToAI, speak, log]);

  // ═══ Voice + text handlers ═══
  const handleVoiceInput = useCallback(async () => {
    try { const text = await listen(); handleInput(text); } catch {}
  }, [listen, handleInput]);

  const handleTextSubmit = () => { if (!textInput.trim()) return; handleInput(textInput.trim()); setTextInput(""); };

  const reset = () => {
    setMessages([]); setAnalysis(null); setStatusText("");
    activeCtx.current = { symbol: "", display: "", tfLabel: "" };
    window.speechSynthesis.cancel();
    setIsThinking(false); setIsSpeaking(false);
  };

  const wsColor = wsStatus === "ready" ? "#00e5a0" : wsStatus === "connected" ? "#f0b90b" : wsStatus === "connecting" ? "#f0b90b" : "#ff4d6a";
  const wsLabel = wsStatus === "ready" ? `LIVE • ${symbolCount}` : wsStatus === "connected" ? "LOADING SYMBOLS" : wsStatus === "connecting" ? "CONNECTING" : "OFFLINE";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 15px rgba(0,229,160,.3)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            </div>
            {(isSpeaking || isThinking) && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: isSpeaking ? "#00e5a0" : "#f0b90b", boxShadow: `0 0 8px ${isSpeaking ? "#00e5a0" : "#f0b90b"}`, animation: "pulse 1s infinite" }} />}
          </div>
          <div>
            <div className="text-[14px] font-bold text-white">FXSynapse AI</div>
            <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>
              {statusText || (isThinking ? "Processing..." : isSpeaking ? "Speaking..." : isListening ? "Listening..." : "Voice + Text")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection badge — click to reconnect */}
          <button onClick={() => { log("Manual reconnect triggered", "ws"); connectWS(); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all hover:scale-105" style={{
            background: `${wsColor}10`, border: `1px solid ${wsColor}25`,
          }}>
            <div className="w-2 h-2 rounded-full" style={{ background: wsColor, boxShadow: `0 0 6px ${wsColor}`, animation: wsStatus === "connecting" ? "pulse 1s infinite" : "none" }} />
            <span className="text-[8px] font-mono font-bold" style={{ color: wsColor }}>{wsLabel}</span>
          </button>
          {/* Debug toggle */}
          <button onClick={() => setShowDebug(!showDebug)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer" style={{ background: showDebug ? "rgba(168,85,247,.1)" : "rgba(255,255,255,.03)", border: `1px solid ${showDebug ? "rgba(168,85,247,.2)" : "rgba(255,255,255,.06)"}` }}>
            <span className="text-[10px]">🐛</span>
          </button>
          <button onClick={() => setVoiceEnabled(!voiceEnabled)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer" style={{ background: voiceEnabled ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${voiceEnabled ? "rgba(0,229,160,.15)" : "rgba(255,255,255,.06)"}` }}>
            <span className="text-[11px]">{voiceEnabled ? "🔊" : "🔇"}</span>
          </button>
          <button onClick={reset} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.12)", color: "#ff4d6a", fontSize: 12 }}>↺</button>
        </div>
      </div>

      {/* Debug panel */}
      {showDebug && (
        <div className="px-4 py-2 max-h-40 overflow-y-auto" style={{ background: "rgba(0,0,0,.3)", borderBottom: "1px solid rgba(255,255,255,.04)", scrollbarWidth: "thin" }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono font-bold" style={{ color: "#a855f7" }}>DEBUG LOG</span>
            <button onClick={() => setDebugLogs([])} className="text-[8px] font-mono cursor-pointer" style={{ color: "rgba(255,255,255,.2)", background: "none", border: "none" }}>Clear</button>
          </div>
          {debugLogs.length === 0 && <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.1)" }}>No logs yet...</div>}
          {debugLogs.map((l, i) => (
            <div key={i} className="text-[8px] font-mono py-0.5" style={{ color: l.type === "ok" ? "#00e5a0" : l.type === "err" ? "#ff4d6a" : l.type === "ws" ? "#4da0ff" : "rgba(255,255,255,.25)" }}>
              <span style={{ color: "rgba(255,255,255,.1)" }}>{l.time}</span> {l.msg}
            </div>
          ))}
        </div>
      )}

      {/* Chat */}
      <div className="p-4 space-y-3 overflow-y-auto" style={{ minHeight: 240, maxHeight: showDebug ? 300 : 400, scrollbarWidth: "thin" }}>
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🎙️</div>
            <div className="text-[14px] font-bold text-white mb-1">Talk to FXSynapse AI</div>
            <div className="text-[11px] max-w-xs mx-auto mb-2" style={{ color: "rgba(255,255,255,.3)", lineHeight: 1.7 }}>
              Say a symbol and timeframe. I pull live candles, run 7 indicators, detect patterns, and give you the trade setup.
            </div>
            {wsStatus !== "ready" && (
              <div className="text-[10px] font-mono mb-3 px-3 py-1.5 rounded-lg inline-block" style={{ background: "rgba(240,185,11,.06)", border: "1px solid rgba(240,185,11,.12)", color: "#f0b90b" }}>
                ⏳ {wsStatus === "connecting" ? "Connecting to market data..." : wsStatus === "connected" ? "Loading symbols..." : "Offline — tap the status badge to reconnect"}
              </div>
            )}
            <div className="flex gap-2 justify-center flex-wrap">
              {["Analyse Gold on H1", "Check EURUSD H4", "Bitcoin daily"].map((ex) => (
                <button key={ex} onClick={() => handleInput(ex)} className="px-3 py-2 rounded-xl text-[10px] font-mono cursor-pointer transition-all hover:scale-105" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.4)" }}>&ldquo;{ex}&rdquo;</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] px-4 py-2.5 rounded-2xl" style={{
              background: msg.role === "user" ? "rgba(77,160,255,.1)" : "rgba(0,229,160,.06)",
              border: `1px solid ${msg.role === "user" ? "rgba(77,160,255,.15)" : "rgba(0,229,160,.1)"}`,
              borderBottomRightRadius: msg.role === "user" ? 6 : 20, borderBottomLeftRadius: msg.role === "ai" ? 6 : 20,
            }}>
              <div className="text-[9px] font-mono mb-0.5" style={{ color: msg.role === "user" ? "#4da0ff" : "#00e5a0" }}>{msg.role === "user" ? "You" : "FXSynapse AI"}</div>
              <div className="text-[12px] leading-relaxed text-white whitespace-pre-wrap">{msg.text}</div>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.1)", borderBottomLeftRadius: 6 }}>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">{[0,1,2].map(n => <div key={n} className="w-1.5 h-1.5 rounded-full" style={{ background: "#00e5a0", animation: `bounce 1.4s ${n * 0.2}s infinite` }} />)}</div>
                <span className="text-[10px] font-mono" style={{ color: "#00e5a0" }}>{statusText || "Thinking..."}</span>
              </div>
            </div>
          </div>
        )}

        {analysis && (
          <div className="rounded-xl p-4 mx-1" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[12px] font-bold text-white">{analysis.symbol} • {analysis.timeframe}</span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg" style={{ background: analysis.direction === "BUY" ? "rgba(0,229,160,.12)" : "rgba(255,77,106,.12)", color: analysis.direction === "BUY" ? "#00e5a0" : "#ff4d6a" }}>{analysis.direction} {analysis.confidence}%</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[{ label: "Entry", value: analysis.entry, color: "#fff" }, { label: "Stop Loss", value: analysis.sl, color: "#ff4d6a" }, { label: "Take Profit", value: analysis.tp, color: "#00e5a0" }].map((item) => (
                <div key={item.label} className="rounded-lg px-2.5 py-2 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                  <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{item.label}</div>
                  <div className="text-[12px] font-mono font-bold" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>
              <span>R:R {analysis.rr}:1</span><span>RSI {analysis.rsi}</span><span>ATR {analysis.atr}</span><span>{analysis.candleCount} candles</span>
              {analysis.patterns.length > 0 && <span>{analysis.patterns.length} pattern{analysis.patterns.length > 1 ? "s" : ""}</span>}
            </div>
          </div>
        )}

        {isSpeaking && (
          <div className="flex items-center gap-2 px-3">
            <div className="flex gap-0.5 items-end" style={{ height: 16 }}>
              {[1,2,3,4,5,6,7].map(n => <div key={n} className="w-[3px] rounded-full" style={{ background: "#00e5a0", animation: `soundWave 0.5s ${n * 0.07}s ease-in-out infinite alternate` }} />)}
            </div>
            <span className="text-[9px] font-mono" style={{ color: "#00e5a0" }}>Speaking...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <button onClick={handleVoiceInput} disabled={isListening || isThinking}
          className="w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-all flex-shrink-0"
          style={{
            background: isListening ? "rgba(255,77,106,.15)" : "linear-gradient(135deg,#00e5a0,#00b87d)",
            border: isListening ? "2px solid rgba(255,77,106,.4)" : "none",
            boxShadow: isListening ? "0 0 20px rgba(255,77,106,.3)" : "0 4px 15px rgba(0,229,160,.25)",
            animation: isListening ? "pulse 1s infinite" : "none", opacity: isThinking ? 0.5 : 1,
          }}>
          {isListening ? (
            <div className="flex gap-0.5 items-end" style={{ height: 14 }}>{[1,2,3].map(n => <div key={n} className="w-[3px] bg-red-400 rounded-full" style={{ animation: `soundWave 0.4s ${n * 0.1}s ease infinite alternate` }} />)}</div>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          )}
        </button>
        <div className="flex-1 flex items-center rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
          <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
            placeholder={isListening ? "Listening..." : "Type or tap mic..."} className="flex-1 px-4 py-3 text-[12px] text-white outline-none bg-transparent" style={{ border: "none" }} />
          <button onClick={handleTextSubmit} disabled={!textInput.trim() || isThinking} className="px-4 py-3 text-[11px] font-bold cursor-pointer" style={{ background: "none", border: "none", color: textInput.trim() ? "#00e5a0" : "rgba(255,255,255,.15)" }}>Send</button>
        </div>
      </div>

      <style jsx>{`
        @keyframes soundWave { from { height: 3px; } to { height: 14px; } }
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
      `}</style>
    </div>
  );
}
