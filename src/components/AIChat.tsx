"use client";
import { useState, useRef, useEffect, useCallback } from "react";

/* ─── Tier Limits ─── */
const CHAT_LIMITS: Record<string, number> = {
  free: 3, basic: 15, starter: 30, pro: 100, unlimited: -1,
};

/* ─── Quick Prompts ─── */
const QUICK_PROMPTS = [
  { icon: "📊", label: "Analyse EUR/USD", prompt: "Analyse EUR/USD on the 1H timeframe. Give me bias, key levels, and entry ideas." },
  { icon: "🧠", label: "Smart money setup", prompt: "Explain how to identify a smart money order block entry with confluence." },
  { icon: "⚖️", label: "Position sizing", prompt: "I have a $500 account. How should I size a trade on GBP/USD with a 30 pip stop loss?" },
  { icon: "📰", label: "News impact", prompt: "What major economic events should I watch this week for USD pairs?" },
  { icon: "🔥", label: "Risk management", prompt: "Give me 5 rules for managing risk as a beginner forex trader." },
  { icon: "💡", label: "Trading plan", prompt: "Help me build a simple trading plan for swing trading forex." },
];

interface Message {
  role: "user" | "ai";
  text: string;
  timestamp: Date;
}

export default function AIChat({ userTier = "free" }: { userTier?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatsUsed, setChatsUsed] = useState(0);
  const [chatsLimit, setChatsLimit] = useState(CHAT_LIMITS[userTier] || 3);
  const [activeTier, setActiveTier] = useState(userTier);
  const [showPaywall, setShowPaywall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canChat = chatsLimit === -1 || chatsUsed < chatsLimit;
  const chatsRemaining = chatsLimit === -1 ? "∞" : `${Math.max(0, chatsLimit - chatsUsed)}`;

  /* ─── Fetch usage on mount ─── */
  useEffect(() => {
    fetch("/api/user/usage").then(r => r.json()).then(data => {
      if (data.chatsUsed !== undefined) {
        setChatsUsed(data.chatsUsed);
        setChatsLimit(data.chatsLimit === -1 ? -1 : data.chatsLimit);
        if (data.planId) setActiveTier(data.planId);
      }
    }).catch(() => {});
  }, []);

  /* ─── Auto-scroll ─── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  /* ─── Send message ─── */
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    if (!canChat) { setShowPaywall(true); return; }

    setError(null);
    const userMsg: Message = { role: "user", text: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSending(true);

    // Auto-resize textarea back
    if (inputRef.current) inputRef.current.style.height = "44px";

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].slice(-20), // Last 20 messages for context
          mode: "text",
        }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setShowPaywall(true);
        if (data.usage) {
          setChatsUsed(data.usage.chatsUsed);
          setChatsLimit(data.usage.chatsLimit);
        }
        setSending(false);
        return;
      }

      if (res.status === 401) {
        setError("Please sign in to chat.");
        setSending(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSending(false);
        return;
      }

      const aiMsg: Message = { role: "ai", text: data.text, timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);

      if (data.usage) {
        setChatsUsed(data.usage.chatsUsed);
        setChatsLimit(data.usage.chatsLimit === -1 ? -1 : data.usage.chatsLimit);
      }
    } catch {
      setError("Network error. Try again.");
    }
    setSending(false);
  }, [input, sending, canChat, messages]);

  /* ─── Handle Enter ─── */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ─── Auto-resize textarea ─── */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "44px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  /* ─── Simple markdown-ish rendering ─── */
  const renderText = (text: string) => {
    // Bold: **text**
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#00e5a0">$1</strong>');
    // Bullets
    html = html.replace(/^[•\-]\s/gm, '  ● ');
    // Line breaks
    html = html.replace(/\n/g, "<br/>");
    return html;
  };

  const tierOrder = ["free", "basic", "starter", "pro", "unlimited"];
  const currentIdx = tierOrder.indexOf(activeTier);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 180px)" }}>
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
            <span className="text-sm">🧠</span>
          </div>
          <div>
            <div className="text-[13px] font-bold text-white">FXSynapse AI</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>Trading Assistant</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{
          background: canChat ? "rgba(0,229,160,.06)" : "rgba(255,77,106,.06)",
          border: `1px solid ${canChat ? "rgba(0,229,160,.1)" : "rgba(255,77,106,.1)"}`,
        }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: canChat ? "#00e5a0" : "#ff4d6a" }} />
          <span className="text-[10px] font-bold" style={{ color: canChat ? "#00e5a0" : "#ff4d6a" }}>
            {chatsRemaining} messages left
          </span>
        </div>
      </div>

      {/* ─── Messages ─── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ scrollBehavior: "smooth" }}>
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(0,229,160,.08)", border: "1px solid rgba(0,229,160,.12)" }}>
              <span className="text-3xl">🧠</span>
            </div>
            <h3 className="text-base font-bold text-white mb-1">Ask me anything about trading</h3>
            <p className="text-[11px] text-center mb-5" style={{ color: "rgba(255,255,255,.35)", maxWidth: 280 }}>
              Analysis, strategy, risk management, smart money — I&apos;m your AI trading mentor.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q.prompt)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-all"
                  style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,229,160,.06)"; e.currentTarget.style.borderColor = "rgba(0,229,160,.15)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.06)"; }}
                >
                  <span className="text-sm">{q.icon}</span>
                  <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,.6)" }}>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-3"
              style={msg.role === "user" ? {
                background: "linear-gradient(135deg,rgba(0,229,160,.15),rgba(0,229,160,.08))",
                border: "1px solid rgba(0,229,160,.15)",
                borderBottomRightRadius: 6,
              } : {
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.06)",
                borderBottomLeftRadius: 6,
              }}
            >
              {msg.role === "ai" && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[9px]">🧠</span>
                  <span className="text-[9px] font-bold" style={{ color: "#00e5a0" }}>FXSynapse AI</span>
                </div>
              )}
              <div
                className="text-[13px] leading-relaxed"
                style={{ color: msg.role === "user" ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.75)" }}
                dangerouslySetInnerHTML={{ __html: renderText(msg.text) }}
              />
              <div className="text-[9px] mt-1.5" style={{ color: "rgba(255,255,255,.2)" }}>
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px]">🧠</span>
                <span className="text-[9px] font-bold" style={{ color: "#00e5a0" }}>FXSynapse AI</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00e5a0", animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00e5a0", animationDelay: "200ms", opacity: 0.6 }} />
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00e5a0", animationDelay: "400ms", opacity: 0.3 }} />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex justify-center">
            <div className="px-3 py-2 rounded-xl text-[11px]" style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "#ff4d6a" }}>
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ─── Input ─── */}
      <div className="px-4 pb-4 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
        {canChat ? (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about any pair, strategy, or concept..."
              className="flex-1 resize-none rounded-xl px-4 py-3 text-[13px] text-white placeholder-gray-500 outline-none"
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", height: 44, maxHeight: 120 }}
              disabled={sending}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
              className="rounded-xl px-4 py-3 text-[13px] font-bold cursor-pointer transition-all"
              style={{
                background: input.trim() && !sending ? "linear-gradient(135deg,#00e5a0,#00b87d)" : "rgba(255,255,255,.06)",
                color: input.trim() && !sending ? "#0a0b0f" : "rgba(255,255,255,.2)",
                border: "none",
                height: 44,
              }}
            >
              {sending ? "..." : "→"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowPaywall(true)}
            className="w-full py-3 rounded-xl text-[13px] font-bold cursor-pointer"
            style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.15)", color: "#ff4d6a" }}
          >
            🔒 Chat limit reached — Upgrade for more messages
          </button>
        )}
      </div>

      {/* ─── Paywall Modal ─── */}
      {showPaywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)" }}>
          <div className="rounded-2xl p-6 w-full max-w-sm mx-4" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.08)" }}>
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.15)" }}>
              <span className="text-xl">💬</span>
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-1">Chat Limit Reached</h3>
            <p className="text-[12px] text-center mb-4" style={{ color: "rgba(255,255,255,.45)" }}>
              You&apos;ve used all {chatsLimit} AI messages for today. Upgrade for more.
            </p>
            <div className="space-y-2">
              {[
                { id: "basic", name: "Basic", chats: "15/day", price: "R79" },
                { id: "starter", name: "Starter", chats: "30/day", price: "R199" },
                { id: "pro", name: "Pro", chats: "100/day", price: "R349" },
                { id: "unlimited", name: "Unlimited", chats: "∞", price: "R499" },
              ].filter(p => tierOrder.indexOf(p.id) > currentIdx).map(plan => (
                <a
                  key={plan.id}
                  href="/pricing"
                  className="flex items-center justify-between px-4 py-3 rounded-xl no-underline transition-all"
                  style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}
                >
                  <div>
                    <div className="text-[13px] font-bold text-white">{plan.name}</div>
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>{plan.chats} messages</div>
                  </div>
                  <div className="text-[13px] font-bold" style={{ color: "#00e5a0" }}>{plan.price}/mo</div>
                </a>
              ))}
            </div>
            <p className="text-[10px] text-center mt-3" style={{ color: "rgba(255,255,255,.25)" }}>
              R79 is less than one bad trade
            </p>
            <button
              onClick={() => setShowPaywall(false)}
              className="w-full mt-3 py-2 rounded-lg text-[11px] cursor-pointer"
              style={{ background: "none", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.3)" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
