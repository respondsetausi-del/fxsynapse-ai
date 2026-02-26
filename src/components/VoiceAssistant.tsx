"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Candle, RSI, SMA, EMA, MACD, BollingerBands, ATR, Stochastic,
  calculateSummary, detectCandlePatterns,
} from "@/lib/indicators";

interface Message { role: "ai" | "user"; text: string; }

const SYMBOL_ALIASES: Record<string, string> = {
  "gold": "frxXAUUSD", "xauusd": "frxXAUUSD", "xau usd": "frxXAUUSD", "xau": "frxXAUUSD",
  "eurusd": "frxEURUSD", "euro dollar": "frxEURUSD", "eur usd": "frxEURUSD",
  "gbpusd": "frxGBPUSD", "pound dollar": "frxGBPUSD", "cable": "frxGBPUSD",
  "usdjpy": "frxUSDJPY", "dollar yen": "frxUSDJPY",
  "gbpjpy": "frxGBPJPY", "pound yen": "frxGBPJPY",
  "audusd": "frxAUDUSD", "aussie": "frxAUDUSD",
  "usdcad": "frxUSDCAD", "nzdusd": "frxNZDUSD", "eurgbp": "frxEURGBP", "eurjpy": "frxEURJPY",
  "bitcoin": "cryBTCUSD", "btc": "cryBTCUSD", "btcusd": "cryBTCUSD",
  "ethereum": "cryETHUSD", "eth": "cryETHUSD", "ethusd": "cryETHUSD",
  "volatility 100": "R_100", "vol 100": "R_100", "v100": "R_100",
  "volatility 75": "R_75", "vol 75": "R_75", "v75": "R_75",
  "volatility 50": "R_50", "vol 50": "R_50",
  "boom 1000": "BOOM1000", "boom": "BOOM1000", "crash 1000": "CRASH1000", "crash": "CRASH1000",
};

const TF_MAP: Record<string, { value: number; label: string }> = {
  "m1": { value: 60, label: "M1" }, "1 minute": { value: 60, label: "M1" },
  "m5": { value: 300, label: "M5" }, "5 minute": { value: 300, label: "M5" }, "5 minutes": { value: 300, label: "M5" },
  "m15": { value: 900, label: "M15" }, "15 minute": { value: 900, label: "M15" }, "15 minutes": { value: 900, label: "M15" },
  "m30": { value: 1800, label: "M30" }, "30 minute": { value: 1800, label: "M30" },
  "h1": { value: 3600, label: "H1" }, "1 hour": { value: 3600, label: "H1" }, "one hour": { value: 3600, label: "H1" },
  "h4": { value: 14400, label: "H4" }, "4 hour": { value: 14400, label: "H4" }, "4 hours": { value: 14400, label: "H4" }, "four hour": { value: 14400, label: "H4" },
  "d1": { value: 86400, label: "D1" }, "daily": { value: 86400, label: "D1" }, "1 day": { value: 86400, label: "D1" },
};

export default function VoiceAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [activeSymbol, setActiveSymbol] = useState("");
  const [activeSymbolDisplay, setActiveSymbolDisplay] = useState("");
  const [activeTfLabel, setActiveTfLabel] = useState("");
  const [wakeListening, setWakeListening] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const allSymbolsRef = useRef<any[]>([]);
  const candlesRef = useRef<Candle[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const pendingAnalysis = useRef(false);
  const tickSubRef = useRef<string | null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ═══ Speech Synthesis ═══
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

  // ═══ Speech Recognition ═══
  const listen = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") { reject("No window"); return; }
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { reject("Speech recognition not supported"); return; }
      const rec = new SR();
      rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
      rec.onresult = (e: any) => { setIsListening(false); resolve(e.results[0][0].transcript); };
      rec.onerror = () => { setIsListening(false); reject("error"); };
      rec.onend = () => setIsListening(false);
      rec.start(); setIsListening(true);
    });
  }, []);

  // ═══ WebSocket ═══
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    wsRef.current = ws;
    ws.onopen = () => { setWsConnected(true); ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" })); };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.msg_type === "active_symbols") allSymbolsRef.current = data.active_symbols || [];
        if (data.msg_type === "candles") {
          const c: Candle[] = (data.candles || []).map((x: any) => ({
            time: x.epoch, open: +x.open, high: +x.high, low: +x.low, close: +x.close, volume: 0,
          }));
          candlesRef.current = c;
          // If we're waiting for candles to analyse
          if (pendingAnalysis.current && c.length >= 30) {
            pendingAnalysis.current = false;
            runAnalysis(c);
          }
        }
        if (data.msg_type === "tick") {
          tickSubRef.current = data.subscription?.id || tickSubRef.current;
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
  }, []);

  useEffect(() => { connectWS(); return () => { wsRef.current?.close(); }; }, [connectWS]);

  // ═══ Resolve symbol from text ═══
  const resolveSymbol = useCallback((text: string): { symbol: string; display: string } | null => {
    const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    for (const [alias, symbol] of Object.entries(SYMBOL_ALIASES)) {
      if (lower.includes(alias)) {
        const found = allSymbolsRef.current.find(s => s.symbol === symbol);
        return { symbol, display: found?.display_name || symbol };
      }
    }
    const found = allSymbolsRef.current.find(s =>
      s.display_name.toLowerCase().includes(lower) || s.symbol.toLowerCase().includes(lower.replace(/\s/g, ""))
    );
    if (found) return { symbol: found.symbol, display: found.display_name };
    return null;
  }, []);

  // ═══ Resolve timeframe from text ═══
  const resolveTimeframe = useCallback((text: string): { value: number; label: string } | null => {
    const lower = text.toLowerCase().trim();
    for (const [key, tf] of Object.entries(TF_MAP)) {
      if (lower.includes(key)) return tf;
    }
    return null;
  }, []);

  // ═══ Run indicator analysis on candles ═══
  const runAnalysis = useCallback((candleData: Candle[]) => {
    if (candleData.length < 30) return;
    const closes = candleData.map(c => c.close);
    const last = candleData.length - 1;
    const price = candleData[last].close;
    const summary = calculateSummary(candleData);
    const patterns = detectCandlePatterns(candleData);
    const rsi = RSI(closes, 14)[last];
    const sma20 = SMA(closes, 20)[last];
    const sma50 = SMA(closes, 50)[last];
    const macd = MACD(closes);
    const bb = BollingerBands(closes);
    const atrVals = ATR(candleData, 14);
    const atr = atrVals[last] || price * 0.005;
    const stoch = Stochastic(candleData);

    let buy = 0, sell = 0;
    if (rsi !== null) { rsi < 40 ? buy += 2 : rsi > 60 ? sell += 2 : 0; }
    if (sma20 !== null) { price > sma20 ? buy++ : sell++; }
    if (sma50 !== null) { price > sma50 ? buy++ : sell++; }
    if (macd.macd[last] !== null && macd.signal[last] !== null) { macd.macd[last]! > macd.signal[last]! ? buy++ : sell++; }
    if (bb.lower[last] !== null && price < bb.lower[last]!) buy += 2;
    if (bb.upper[last] !== null && price > bb.upper[last]!) sell += 2;
    for (const p of patterns) { if (p.type === "bullish") buy += p.strength; if (p.type === "bearish") sell += p.strength; }

    const direction = buy >= sell ? "BUY" : "SELL";
    const confidence = Math.round((Math.max(buy, sell) / (buy + sell + 1)) * 100);
    const slDist = atr * 1.5, tpDist = atr * 2.5;
    const digits = price > 100 ? 2 : price > 1 ? 4 : 5;

    const result = {
      symbol: activeSymbolDisplay || activeSymbol,
      timeframe: activeTfLabel,
      direction, confidence,
      entry: +price.toFixed(digits),
      sl: +(direction === "BUY" ? price - slDist : price + slDist).toFixed(digits),
      tp: +(direction === "BUY" ? price + tpDist : price - tpDist).toFixed(digits),
      rr: +(tpDist / slDist).toFixed(1),
      rsi: rsi?.toFixed(1) || "N/A",
      sma20: sma20?.toFixed(digits) || "N/A",
      sma50: sma50?.toFixed(digits) || "N/A",
      macd: macd.macd[last]?.toFixed(3) || "N/A",
      macdSignal: macd.signal[last]?.toFixed(3) || "N/A",
      bbUpper: bb.upper[last]?.toFixed(digits) || "N/A",
      bbLower: bb.lower[last]?.toFixed(digits) || "N/A",
      atr: atr.toFixed(digits),
      stochK: stoch.k[last]?.toFixed(1) || "N/A",
      stochD: stoch.d[last]?.toFixed(1) || "N/A",
      patterns: patterns.map(p => `${p.emoji} ${p.name} (${p.type}, strength ${p.strength}/3)`),
      bias: summary?.overallBias || "neutral",
      buyScore: summary?.buyScore || buy,
      sellScore: summary?.sellScore || sell,
    };

    setAnalysis(result);
    // Send to AI with analysis context
    sendToAI("I've finished pulling the data. Here's the analysis.", result);
  }, [activeSymbol, activeSymbolDisplay, activeTfLabel]);

  // ═══ Send message to Claude API ═══
  const sendToAI = useCallback(async (userText: string, analysisData?: any) => {
    const userMsg: Message = { role: "user", text: userText };
    const updated = [...messagesRef.current, userMsg];
    setMessages(updated);
    setIsThinking(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.slice(-10), // Last 10 messages for context
          analysis: analysisData || null,
        }),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const aiMsg: Message = { role: "ai", text: data.text };
      setMessages(prev => [...prev, aiMsg]);
      setIsThinking(false);
      speak(data.text);

      // Check if AI response indicates we need to fetch data
      const lower = data.text.toLowerCase();
      if (lower.includes("pulling") || lower.includes("let me check") || lower.includes("one moment") || lower.includes("looking")) {
        // AI acknowledged, data fetch should already be in progress
      }
    } catch (err) {
      setIsThinking(false);
      const errMsg: Message = { role: "ai", text: "Hmm, I had a connection issue. Could you say that again?" };
      setMessages(prev => [...prev, errMsg]);
      speak(errMsg.text);
    }
  }, [speak]);

  // ═══ Process user input — detect symbols/timeframes, then chat ═══
  const handleInput = useCallback(async (text: string) => {
    const lower = text.toLowerCase();

    // Try to detect symbol
    const sym = resolveSymbol(lower);
    if (sym && !activeSymbol) {
      setActiveSymbol(sym.symbol);
      setActiveSymbolDisplay(sym.display);
    }

    // Try to detect timeframe + trigger fetch
    const tf = resolveTimeframe(lower);
    if (tf && (activeSymbol || sym)) {
      const symbol = sym?.symbol || activeSymbol;
      const display = sym?.display || activeSymbolDisplay;
      setActiveSymbol(symbol);
      setActiveSymbolDisplay(display);
      setActiveTfLabel(tf.label);
      // Fetch candles
      candlesRef.current = [];
      pendingAnalysis.current = true;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Forget old tick sub
        if (tickSubRef.current) wsRef.current.send(JSON.stringify({ forget: tickSubRef.current }));
        wsRef.current.send(JSON.stringify({ ticks_history: symbol, adjust_start_time: 1, count: 200, end: "latest", granularity: tf.value, style: "candles" }));
        wsRef.current.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      }
    }

    // If user says a symbol AND timeframe in same message, let AI know we're fetching
    if (sym && tf) {
      sendToAI(`Analyse ${sym.display} on the ${tf.label} timeframe`);
      return;
    }

    // Normal message to AI
    sendToAI(text);
  }, [activeSymbol, activeSymbolDisplay, resolveSymbol, resolveTimeframe, sendToAI]);

  // ═══ Voice input ═══
  const handleVoiceInput = useCallback(async () => {
    try {
      const text = await listen();
      handleInput(text);
    } catch { /* cancelled or error */ }
  }, [listen, handleInput]);

  // ═══ Text submit ═══
  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    handleInput(textInput.trim());
    setTextInput("");
  };

  // ═══ Wake word detection (continuous listening) ═══
  const startWakeWordListener = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript.toLowerCase();
        if (transcript.includes("hey synapse") || transcript.includes("hey fx") || transcript.includes("hey f x") || transcript.includes("hey fxsynapse")) {
          rec.stop();
          setWakeListening(false);
          // Trigger active listening
          speak("Yes?").then(() => handleVoiceInput());
          return;
        }
      }
    };
    rec.onerror = () => setWakeListening(false);
    rec.onend = () => {
      // Restart if wake listening is still active
      if (wakeListening) try { rec.start(); } catch { setWakeListening(false); }
    };
    rec.start();
    setWakeListening(true);
  }, [speak, handleVoiceInput, wakeListening]);

  const stopWakeWordListener = useCallback(() => { setWakeListening(false); }, []);

  // ═══ Reset ═══
  const reset = () => {
    setMessages([]); setAnalysis(null); setActiveSymbol(""); setActiveSymbolDisplay(""); setActiveTfLabel("");
    candlesRef.current = []; pendingAnalysis.current = false;
    window.speechSynthesis.cancel();
  };

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
              {isThinking ? "Thinking..." : isSpeaking ? "Speaking..." : isListening ? "Listening..." : "Voice + Text trading assistant"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => wakeListening ? stopWakeWordListener() : startWakeWordListener()}
            className="px-2.5 py-1.5 rounded-lg text-[9px] font-mono cursor-pointer"
            style={{ background: wakeListening ? "rgba(168,85,247,.12)" : "rgba(255,255,255,.03)", border: `1px solid ${wakeListening ? "rgba(168,85,247,.25)" : "rgba(255,255,255,.06)"}`, color: wakeListening ? "#a855f7" : "rgba(255,255,255,.3)" }}>
            {wakeListening ? '🎙 "Hey Synapse" ON' : '🎙 Wake Word'}
          </button>
          <button onClick={() => setVoiceEnabled(!voiceEnabled)}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono cursor-pointer"
            style={{ background: voiceEnabled ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${voiceEnabled ? "rgba(0,229,160,.15)" : "rgba(255,255,255,.06)"}`, color: voiceEnabled ? "#00e5a0" : "rgba(255,255,255,.3)" }}>
            {voiceEnabled ? "🔊" : "🔇"}
          </button>
          <button onClick={reset} className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono cursor-pointer" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.12)", color: "#ff4d6a" }}>↺</button>
        </div>
      </div>

      {/* Chat area */}
      <div className="p-4 space-y-3 overflow-y-auto" style={{ minHeight: 280, maxHeight: 420, scrollbarWidth: "thin" }}>
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🎙️</div>
            <div className="text-[14px] font-bold text-white mb-1">Talk to FXSynapse AI</div>
            <div className="text-[11px] max-w-xs mx-auto mb-5" style={{ color: "rgba(255,255,255,.3)", lineHeight: 1.7 }}>
              Voice or text. Ask me to analyse any pair. I&apos;ll give you entry, TP, SL and execute on your command.
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              {["Hey, analyse Gold on H1", "Check EURUSD", "Look at Bitcoin daily"].map((ex) => (
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
              borderBottomRightRadius: msg.role === "user" ? 6 : 20,
              borderBottomLeftRadius: msg.role === "ai" ? 6 : 20,
            }}>
              <div className="text-[9px] font-mono mb-0.5" style={{ color: msg.role === "user" ? "#4da0ff" : "#00e5a0" }}>
                {msg.role === "user" ? "You" : "FXSynapse AI"}
              </div>
              <div className="text-[12px] leading-relaxed text-white">{msg.text}</div>
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.1)", borderBottomLeftRadius: 6 }}>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(n => <div key={n} className="w-1.5 h-1.5 rounded-full" style={{ background: "#00e5a0", animation: `bounce 1.4s ${n * 0.2}s infinite` }} />)}
                </div>
                <span className="text-[10px] font-mono" style={{ color: "#00e5a0" }}>Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {/* Analysis card */}
        {analysis && (
          <div className="rounded-xl p-4 mx-1" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[12px] font-bold text-white">{analysis.symbol} • {analysis.timeframe}</span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg" style={{
                background: analysis.direction === "BUY" ? "rgba(0,229,160,.12)" : "rgba(255,77,106,.12)",
                color: analysis.direction === "BUY" ? "#00e5a0" : "#ff4d6a",
              }}>{analysis.direction} {analysis.confidence}%</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                { label: "Entry", value: analysis.entry, color: "#fff" },
                { label: "Stop Loss", value: analysis.sl, color: "#ff4d6a" },
                { label: "Take Profit", value: analysis.tp, color: "#00e5a0" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg px-2.5 py-2 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                  <div className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{item.label}</div>
                  <div className="text-[12px] font-mono font-bold" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>
              <span>R:R {analysis.rr}:1</span><span>RSI {analysis.rsi}</span><span>ATR {analysis.atr}</span>
              {analysis.patterns.length > 0 && <span>{analysis.patterns.length} pattern{analysis.patterns.length > 1 ? "s" : ""}</span>}
            </div>
          </div>
        )}

        {/* Speaking visualizer */}
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
            animation: isListening ? "pulse 1s infinite" : "none",
            opacity: isThinking ? 0.5 : 1,
          }}>
          {isListening ? (
            <div className="flex gap-0.5 items-end" style={{ height: 14 }}>
              {[1,2,3].map(n => <div key={n} className="w-[3px] bg-red-400 rounded-full" style={{ animation: `soundWave 0.4s ${n * 0.1}s ease infinite alternate` }} />)}
            </div>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          )}
        </button>
        <div className="flex-1 flex items-center rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
          <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
            placeholder={isListening ? "Listening..." : "Type or tap mic to talk..."}
            className="flex-1 px-4 py-3 text-[12px] text-white outline-none bg-transparent" style={{ border: "none" }} />
          <button onClick={handleTextSubmit} disabled={!textInput.trim() || isThinking}
            className="px-4 py-3 text-[11px] font-bold cursor-pointer" style={{ background: "none", border: "none", color: textInput.trim() ? "#00e5a0" : "rgba(255,255,255,.15)" }}>Send</button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between px-4 py-1.5" style={{ background: "rgba(255,255,255,.01)", borderTop: "1px solid rgba(255,255,255,.03)" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ background: wsConnected ? "#00e5a0" : "#ff4d6a" }} /><span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{wsConnected ? "LIVE DATA" : "OFFLINE"}</span></div>
          {activeSymbol && <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.12)" }}>{activeSymbolDisplay} {activeTfLabel}</span>}
        </div>
        <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.08)" }}>Powered by Claude AI</span>
      </div>

      <style jsx>{`
        @keyframes soundWave { from { height: 3px; } to { height: 14px; } }
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
      `}</style>
    </div>
  );
}
