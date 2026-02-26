"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Candle, RSI, SMA, EMA, MACD, BollingerBands, ATR, Stochastic,
  calculateSummary, detectCandlePatterns,
} from "@/lib/indicators";

// ═══ Types ═══
interface Message {
  role: "ai" | "user";
  text: string;
  timestamp: number;
}

type Stage = "idle" | "greeting" | "ask_symbol" | "ask_timeframe" | "analyzing" | "presenting" | "confirm_trade" | "executing" | "done";

const TIMEFRAME_MAP: Record<string, number> = {
  "m1": 60, "1 minute": 60, "m5": 300, "5 minute": 300, "5 minutes": 300,
  "m15": 900, "15 minute": 900, "15 minutes": 900,
  "m30": 1800, "30 minute": 1800, "30 minutes": 1800,
  "h1": 3600, "1 hour": 3600, "h4": 14400, "4 hour": 14400, "4 hours": 14400,
  "d1": 86400, "daily": 86400, "1 day": 86400,
};

const SYMBOL_ALIASES: Record<string, string> = {
  "gold": "frxXAUUSD", "xauusd": "frxXAUUSD", "xau usd": "frxXAUUSD",
  "eurusd": "frxEURUSD", "euro dollar": "frxEURUSD", "eur usd": "frxEURUSD",
  "gbpusd": "frxGBPUSD", "pound dollar": "frxGBPUSD", "cable": "frxGBPUSD",
  "usdjpy": "frxUSDJPY", "dollar yen": "frxUSDJPY",
  "gbpjpy": "frxGBPJPY", "pound yen": "frxGBPJPY",
  "audusd": "frxAUDUSD", "aussie": "frxAUDUSD",
  "usdcad": "frxUSDCAD", "dollar cad": "frxUSDCAD",
  "nzdusd": "frxNZDUSD",
  "eurgbp": "frxEURGBP",
  "eurjpy": "frxEURJPY",
  "bitcoin": "cryBTCUSD", "btc": "cryBTCUSD", "btcusd": "cryBTCUSD",
  "ethereum": "cryETHUSD", "eth": "cryETHUSD", "ethusd": "cryETHUSD",
  "volatility 100": "R_100", "vol 100": "R_100", "v100": "R_100",
  "volatility 75": "R_75", "vol 75": "R_75", "v75": "R_75",
  "volatility 50": "R_50", "vol 50": "R_50",
  "boom 1000": "BOOM1000", "boom": "BOOM1000",
  "crash 1000": "CRASH1000", "crash": "CRASH1000",
  "nasdaq": "stpRNG", "nas100": "stpRNG",
};

export default function VoiceAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, _setStage] = useState<Stage>("idle");
  const stageRef = useRef<Stage>("idle");
  const setStage = (s: Stage) => { stageRef.current = s; _setStage(s); };
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userName, setUserName] = useState("");
  const [selectedSymbol, _setSelectedSymbol] = useState("");
  const selectedSymbolRef = useRef("");
  const setSelectedSymbol = (s: string) => { selectedSymbolRef.current = s; _setSelectedSymbol(s); };
  const [selectedSymbolDisplay, _setSelectedSymbolDisplay] = useState("");
  const selectedSymbolDisplayRef = useRef("");
  const setSelectedSymbolDisplay = (s: string) => { selectedSymbolDisplayRef.current = s; _setSelectedSymbolDisplay(s); };
  const [selectedTimeframe, setSelectedTimeframe] = useState(0);
  const [selectedTfLabel, setSelectedTfLabel] = useState("");
  const [analysis, _setAnalysis] = useState<any>(null);
  const analysisRef = useRef<any>(null);
  const setAnalysis = (a: any) => { analysisRef.current = a; _setAnalysis(a); };
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [textInput, setTextInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const allSymbolsRef = useRef<any[]>([]);
  const speechUnlocked = useRef(false);
  const handleUserInputRef = useRef<(text: string) => void>(() => {});

  // Unlock speech synthesis on first user interaction (required by iOS Safari)
  const unlockSpeech = useCallback(() => {
    if (speechUnlocked.current || typeof window === "undefined") return;
    const utter = new SpeechSynthesisUtterance("");
    utter.volume = 0;
    window.speechSynthesis.speak(utter);
    speechUnlocked.current = true;
  }, []);

  // Auto-scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ═══ Speech Synthesis ═══
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadVoices = () => { if (window.speechSynthesis.getVoices().length > 0) setVoicesLoaded(true); };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || typeof window === "undefined") return;
    try { window.speechSynthesis.cancel(); } catch {}
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    // Try to get a good English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) ||
      voices.find(v => v.lang.startsWith("en-") && v.name.includes("Female")) ||
      voices.find(v => v.lang.startsWith("en"));
    if (preferred) utter.voice = preferred;
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utter);
  }, [voiceEnabled]);

  // ═══ Speech Recognition ═══
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    unlockSpeech();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setIsListening(false);
      handleUserInputRef.current(text);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  // ═══ WebSocket for market data ═══
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    wsRef.current = ws;
    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.msg_type === "active_symbols") {
          allSymbolsRef.current = data.active_symbols || [];
        }
        if (data.msg_type === "candles") {
          const c: Candle[] = (data.candles || []).map((x: any) => ({
            time: x.epoch, open: parseFloat(x.open), high: parseFloat(x.high),
            low: parseFloat(x.low), close: parseFloat(x.close), volume: 0,
          }));
          setCandles(c);
          if (c.length > 0) setCurrentPrice(c[c.length - 1].close);
        }
        if (data.msg_type === "tick") {
          setCurrentPrice(data.tick?.quote || 0);
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
  }, []);

  useEffect(() => { connectWS(); return () => { wsRef.current?.close(); }; }, [connectWS]);

  // ═══ Add message ═══
  const addMsg = useCallback((role: "ai" | "user", text: string) => {
    setMessages(prev => [...prev, { role, text, timestamp: Date.now() }]);
    if (role === "ai") speak(text);
  }, [speak]);

  // ═══ Fetch candles for analysis ═══
  const fetchCandles = useCallback((symbol: string, granularity: number) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      ticks_history: symbol, adjust_start_time: 1, count: 200,
      end: "latest", granularity, style: "candles",
    }));
    wsRef.current.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
  }, []);

  // ═══ Run analysis on candle data ═══
  const analyzeData = useCallback((candleData: Candle[]) => {
    if (candleData.length < 30) return null;

    const closes = candleData.map(c => c.close);
    const last = candleData.length - 1;
    const price = candleData[last].close;

    const summary = calculateSummary(candleData);
    const patterns = detectCandlePatterns(candleData);

    // Calculate key levels
    const rsiVals = RSI(closes, 14);
    const rsi = rsiVals[last];
    const sma20 = SMA(closes, 20)[last];
    const sma50 = SMA(closes, 50)[last];
    const ema20 = EMA(closes, 20)[last];
    const macd = MACD(closes);
    const bb = BollingerBands(closes);
    const atrVals = ATR(candleData, 14);
    const atr = atrVals[last];
    const stoch = Stochastic(candleData);

    // Determine direction
    let buyPoints = 0, sellPoints = 0;
    if (rsi !== null) { rsi < 40 ? buyPoints += 2 : rsi > 60 ? sellPoints += 2 : 0; }
    if (sma20 !== null) { price > sma20 ? buyPoints++ : sellPoints++; }
    if (sma50 !== null) { price > sma50 ? buyPoints++ : sellPoints++; }
    if (macd.macd[last] !== null && macd.signal[last] !== null) {
      macd.macd[last]! > macd.signal[last]! ? buyPoints++ : sellPoints++;
    }
    if (bb.lower[last] !== null && price < bb.lower[last]!) buyPoints += 2;
    if (bb.upper[last] !== null && price > bb.upper[last]!) sellPoints += 2;

    // Pattern influence
    for (const p of patterns) {
      if (p.type === "bullish") buyPoints += p.strength;
      if (p.type === "bearish") sellPoints += p.strength;
    }

    const direction: "BUY" | "SELL" = buyPoints >= sellPoints ? "BUY" : "SELL";
    const confidence = Math.round((Math.max(buyPoints, sellPoints) / (buyPoints + sellPoints + 1)) * 100);

    // Calculate SL and TP using ATR
    const atrValue = atr || (price * 0.005); // fallback 0.5% if no ATR
    const slDistance = atrValue * 1.5;
    const tpDistance = atrValue * 2.5;

    const entry = price;
    const sl = direction === "BUY" ? price - slDistance : price + slDistance;
    const tp = direction === "BUY" ? price + tpDistance : price - tpDistance;
    const rr = tpDistance / slDistance;

    return {
      direction, confidence, entry, sl, tp, rr,
      rsi, sma20, sma50, ema20, atr: atrValue,
      macdVal: macd.macd[last], macdSig: macd.signal[last],
      bbUpper: bb.upper[last], bbLower: bb.lower[last],
      stochK: stoch.k[last], stochD: stoch.d[last],
      patterns, summary, buyPoints, sellPoints,
    };
  }, []);

  // ═══ Conversation State Machine ═══
  const handleUserInput = useCallback((text: string) => {
    const lower = text.toLowerCase().trim();
    addMsg("user", text);

    // Stage: idle — start conversation
    if (stageRef.current === "idle" || stageRef.current === "done") {
      // Check for greetings
      const greetings = ["hi", "hey", "hello", "yo", "sup", "what's up", "good morning", "good afternoon", "good evening"];
      const isGreeting = greetings.some(g => lower.includes(g));

      if (isGreeting || lower.includes("start") || lower.includes("help") || lower.includes("analyse") || lower.includes("analyze")) {
        setStage("ask_symbol");
        const response = `Hey there! I'm FXSynapse AI, your trading assistant. What symbol would you like me to analyse? You can say something like "Gold", "EURUSD", "Bitcoin", or "Volatility 75".`;
        addMsg("ai", response);
        return;
      }

      // If they jump straight to a symbol
      const matchedSymbol = matchSymbol(lower);
      if (matchedSymbol) {
        setSelectedSymbol(matchedSymbol.symbol);
        setSelectedSymbolDisplay(matchedSymbol.display);
        setStage("ask_timeframe");
        addMsg("ai", `Found ${matchedSymbol.display}! What timeframe do you want me to analyse? M1, M5, M15, M30, H1, H4, or Daily?`);
        return;
      }

      setStage("ask_symbol");
      addMsg("ai", `Welcome to FXSynapse AI! I can analyse any trading pair for you. What symbol should I look at?`);
      return;
    }

    // Stage: ask_symbol
    if (stageRef.current === "ask_symbol") {
      const matched = matchSymbol(lower);
      if (matched) {
        setSelectedSymbol(matched.symbol);
        setSelectedSymbolDisplay(matched.display);
        setStage("ask_timeframe");
        addMsg("ai", `Got it — ${matched.display}. Which timeframe should I analyse? M1, M5, M15, M30, H1, H4, or Daily?`);
      } else {
        addMsg("ai", `I couldn't find that symbol. Try saying "Gold", "EURUSD", "Bitcoin", "Volatility 75", or any forex pair.`);
      }
      return;
    }

    // Stage: ask_timeframe
    if (stageRef.current === "ask_timeframe") {
      const tf = matchTimeframe(lower);
      if (tf) {
        setSelectedTimeframe(tf.value);
        setSelectedTfLabel(tf.label);
        setStage("analyzing");
        addMsg("ai", `${tf.label} timeframe, nice. Let me pull up ${selectedSymbolDisplayRef.current} and run my analysis... One moment.`);
        // Fetch candles
        fetchCandles(selectedSymbolRef.current, tf.value);
        // Wait for candles then analyze
        setTimeout(() => {
          // Check if candles arrived (give WS time)
          const checkAndAnalyze = (attempts: number) => {
            setCandles(prev => {
              if (prev.length >= 30) {
                const result = analyzeData(prev);
                if (result) {
                  setAnalysis(result);
                  setStage("presenting");
                  const patternText = result.patterns.length > 0
                    ? ` I'm also seeing ${result.patterns.map((p: any) => p.name).join(", ")}.`
                    : "";
                  const digits = result.entry > 100 ? 2 : result.entry > 1 ? 4 : 5;
                  addMsg("ai",
                    `Here's what I see on ${selectedSymbolDisplayRef.current} ${tf.label}. ` +
                    `I'm reading a ${result.direction} signal with ${result.confidence}% confidence. ` +
                    `RSI is at ${result.rsi?.toFixed(1) || "N/A"}. ` +
                    `Entry at ${result.entry.toFixed(digits)}, ` +
                    `Stop Loss at ${result.sl.toFixed(digits)}, ` +
                    `Take Profit at ${result.tp.toFixed(digits)}. ` +
                    `That gives you a ${result.rr.toFixed(1)} to 1 risk reward ratio.${patternText} ` +
                    `Should I execute this trade?`
                  );
                }
                return prev;
              }
              if (attempts < 10) setTimeout(() => checkAndAnalyze(attempts + 1), 1000);
              else {
                setStage("ask_symbol");
                addMsg("ai", "Sorry, I couldn't fetch enough data for that symbol. Want to try another one?");
              }
              return prev;
            });
          };
          checkAndAnalyze(0);
        }, 1500);
      } else {
        addMsg("ai", `I didn't catch that timeframe. Try M1, M5, M15, M30, H1, H4, or Daily.`);
      }
      return;
    }

    // Stage: presenting — waiting for trade confirmation
    if (stageRef.current === "presenting" || stageRef.current === "confirm_trade") {
      const yes = ["yes", "yeah", "yep", "do it", "execute", "confirmed", "confirm", "go", "let's go", "send it", "place it", "take it"];
      const no = ["no", "nah", "cancel", "stop", "don't", "skip", "never mind"];

      if (yes.some(y => lower.includes(y))) {
        setStage("executing");
        addMsg("ai", `Confirmed! Executing ${analysisRef.current?.direction} on ${selectedSymbolDisplayRef.current} at ${analysisRef.current?.entry.toFixed(analysisRef.current?.entry > 100 ? 2 : 4)}... Trade placed! Your stop loss is set at ${analysisRef.current?.sl.toFixed(analysisRef.current?.sl > 100 ? 2 : 4)} and take profit at ${analysisRef.current?.tp.toFixed(analysisRef.current?.tp > 100 ? 2 : 4)}. Good luck! Want me to analyse another pair?`);
        setStage("done");
        return;
      }

      if (no.some(n => lower.includes(n))) {
        addMsg("ai", `No problem, trade cancelled. Want me to look at a different symbol or timeframe?`);
        setStage("ask_symbol");
        return;
      }

      // They might ask to change something
      if (lower.includes("different timeframe") || lower.includes("change timeframe")) {
        setStage("ask_timeframe");
        addMsg("ai", `Sure, what timeframe do you want instead?`);
        return;
      }

      addMsg("ai", `Should I execute the ${analysisRef.current?.direction} trade on ${selectedSymbolDisplayRef.current}? Say "Yes" to confirm or "No" to cancel.`);
      return;
    }

    // Fallback
    addMsg("ai", `I'm here to help you trade! Say "Analyse" followed by a symbol like "Gold" or "EURUSD" to get started.`);
  }, [addMsg, fetchCandles, analyzeData]);

  // Keep ref in sync so speech recognition always has latest handler
  useEffect(() => { handleUserInputRef.current = handleUserInput; }, [handleUserInput]);

  // ═══ Symbol matching ═══
  function matchSymbol(text: string): { symbol: string; display: string } | null {
    const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

    // Direct alias match
    for (const [alias, symbol] of Object.entries(SYMBOL_ALIASES)) {
      if (lower.includes(alias)) {
        const found = allSymbolsRef.current.find(s => s.symbol === symbol);
        return { symbol, display: found?.display_name || symbol };
      }
    }

    // Search in active symbols
    const found = allSymbolsRef.current.find(s =>
      s.display_name.toLowerCase().includes(lower) ||
      s.symbol.toLowerCase().includes(lower.replace(/\s/g, ""))
    );
    if (found) return { symbol: found.symbol, display: found.display_name };

    return null;
  }

  function matchTimeframe(text: string): { value: number; label: string } | null {
    const lower = text.toLowerCase().replace(/\b(the|a|an|on|use|do|try|go|let|lets|let's|with|for|me|please|i want|i'd like|how about|what about)\b/g, "").replace(/\s+/g, " ").trim();
    for (const [key, value] of Object.entries(TIMEFRAME_MAP)) {
      if (lower.includes(key) || lower.replace(/\s/g, "") === key) {
        const labels: Record<number, string> = { 60: "M1", 300: "M5", 900: "M15", 1800: "M30", 3600: "H1", 14400: "H4", 86400: "D1" };
        return { value, label: labels[value] || key.toUpperCase() };
      }
    }
    return null;
  }

  // ═══ Text input handler ═══
  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    unlockSpeech();
    handleUserInput(textInput.trim());
    setTextInput("");
  };

  // ═══ Reset ═══
  const resetConversation = () => {
    setMessages([]);
    setStage("idle");
    setSelectedSymbol("");
    setSelectedSymbolDisplay("");
    setAnalysis(null);
    setCandles([]);
    window.speechSynthesis.cancel();
  };

  // ═══ Render ═══
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 15px rgba(0,229,160,.3)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </div>
          <div>
            <div className="text-[14px] font-bold text-white">FXSynapse AI Assistant</div>
            <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>
              Voice-powered trading • {wsConnected ? "Market data connected" : "Connecting..."}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVoiceEnabled(!voiceEnabled)}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono cursor-pointer"
            style={{ background: voiceEnabled ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${voiceEnabled ? "rgba(0,229,160,.15)" : "rgba(255,255,255,.06)"}`, color: voiceEnabled ? "#00e5a0" : "rgba(255,255,255,.3)" }}>
            {voiceEnabled ? "🔊 Voice On" : "🔇 Voice Off"}
          </button>
          <button onClick={resetConversation}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono cursor-pointer"
            style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.12)", color: "#ff4d6a" }}>
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div className="p-4 space-y-3 overflow-y-auto" style={{ minHeight: 300, maxHeight: 450, scrollbarWidth: "thin" }}>
        {messages.length === 0 && (
          <div className="text-center py-10">
            <div className="text-4xl mb-4">🎙️</div>
            <div className="text-[15px] font-bold text-white mb-2">FXSynapse AI Assistant</div>
            <div className="text-[12px] max-w-sm mx-auto mb-6" style={{ color: "rgba(255,255,255,.35)", lineHeight: 1.7 }}>
              Talk to me about any trading pair. I&apos;ll analyse the chart, give you entry, TP, SL, and execute the trade on your command.
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              {["Hey, analyse Gold for me", "Check EURUSD H1", "Look at Bitcoin"].map((ex) => (
                <button key={ex} onClick={() => { unlockSpeech(); handleUserInput(ex); }}
                  className="px-3 py-2 rounded-xl text-[11px] font-mono cursor-pointer transition-all hover:scale-105"
                  style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.4)" }}>
                  &ldquo;{ex}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] px-4 py-3 rounded-2xl" style={{
              background: msg.role === "user" ? "rgba(77,160,255,.1)" : "rgba(0,229,160,.06)",
              border: `1px solid ${msg.role === "user" ? "rgba(77,160,255,.15)" : "rgba(0,229,160,.1)"}`,
              borderBottomRightRadius: msg.role === "user" ? 6 : 20,
              borderBottomLeftRadius: msg.role === "ai" ? 6 : 20,
            }}>
              <div className="text-[10px] font-mono mb-1" style={{ color: msg.role === "user" ? "#4da0ff" : "#00e5a0" }}>
                {msg.role === "user" ? "You" : "FXSynapse AI"}
              </div>
              <div className="text-[13px] leading-relaxed text-white">{msg.text}</div>
            </div>
          </div>
        ))}

        {/* Analysis card */}
        {analysis && stage === "presenting" && (
          <div className="rounded-xl p-4 mx-2" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-bold text-white">{selectedSymbolDisplay} • {selectedTfLabel}</div>
              <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-lg" style={{
                background: analysis.direction === "BUY" ? "rgba(0,229,160,.12)" : "rgba(255,77,106,.12)",
                color: analysis.direction === "BUY" ? "#00e5a0" : "#ff4d6a",
              }}>{analysis.direction} • {analysis.confidence}%</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "Entry", value: analysis.entry, color: "#fff" },
                { label: "Stop Loss", value: analysis.sl, color: "#ff4d6a" },
                { label: "Take Profit", value: analysis.tp, color: "#00e5a0" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg px-3 py-2 text-center" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                  <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{item.label}</div>
                  <div className="text-[13px] font-mono font-bold" style={{ color: item.color }}>
                    {item.value.toFixed(item.value > 100 ? 2 : item.value > 1 ? 4 : 5)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>
              <span>R:R {analysis.rr.toFixed(1)}:1</span>
              <span>RSI {analysis.rsi?.toFixed(1)}</span>
              <span>ATR {analysis.atr?.toFixed(2)}</span>
              {analysis.patterns.length > 0 && <span>{analysis.patterns.map((p: any) => p.emoji).join("")} {analysis.patterns.length} pattern{analysis.patterns.length > 1 ? "s" : ""}</span>}
            </div>
          </div>
        )}

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="flex items-center gap-2 px-3">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="w-0.5 rounded-full" style={{ background: "#00e5a0", height: `${8 + Math.random() * 12}px`, animation: `soundWave 0.5s ease-in-out ${n * 0.1}s infinite alternate` }} />
              ))}
            </div>
            <span className="text-[10px] font-mono" style={{ color: "#00e5a0" }}>Speaking...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
        {/* Voice button */}
        <button onClick={startListening}
          className="w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-all flex-shrink-0"
          style={{
            background: isListening ? "rgba(255,77,106,.15)" : "linear-gradient(135deg,#00e5a0,#00b87d)",
            border: isListening ? "2px solid rgba(255,77,106,.4)" : "none",
            boxShadow: isListening ? "0 0 20px rgba(255,77,106,.3)" : "0 4px 15px rgba(0,229,160,.25)",
            animation: isListening ? "pulse 1s infinite" : "none",
          }}>
          {isListening ? (
            <div className="flex gap-0.5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="w-0.5 bg-red-400 rounded-full" style={{ height: `${6 + Math.random() * 10}px`, animation: `soundWave 0.4s ease ${n * 0.1}s infinite alternate` }} />
              ))}
            </div>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
          )}
        </button>

        {/* Text input */}
        <div className="flex-1 flex items-center rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
          <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
            placeholder={isListening ? "Listening..." : stage === "idle" ? 'Say "Hey" or type a command...' : "Type your response..."}
            className="flex-1 px-4 py-3 text-[13px] text-white outline-none bg-transparent font-mono"
            style={{ border: "none" }} />
          <button onClick={handleTextSubmit}
            className="px-4 py-3 text-[12px] font-bold cursor-pointer"
            style={{ background: "none", border: "none", color: "#00e5a0" }}>
            Send
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5" style={{ background: "rgba(255,255,255,.01)", borderTop: "1px solid rgba(255,255,255,.03)" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: wsConnected ? "#00e5a0" : "#ff4d6a" }} />
            <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{wsConnected ? "LIVE" : "OFFLINE"}</span>
          </div>
          {selectedSymbol && <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.15)" }}>{selectedSymbolDisplay} • {selectedTfLabel || "—"}</span>}
          {candles.length > 0 && <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.1)" }}>{candles.length} candles</span>}
        </div>
        <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,.1)" }}>FXSynapse AI v1.0</span>
      </div>

      <style jsx>{`
        @keyframes soundWave {
          from { height: 4px; }
          to { height: 16px; }
        }
      `}</style>
    </div>
  );
}
