"use client";
import { useState, useEffect, useRef } from "react";

interface Message {
  id?: string;
  sender: "visitor" | "admin";
  message: string;
  created_at?: string;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [started, setStarted] = useState(false);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getVisitorId = () => {
    if (typeof window === "undefined") return "";
    let vid = localStorage.getItem("fxs_chat_vid");
    if (!vid) { vid = crypto.randomUUID(); localStorage.setItem("fxs_chat_vid", vid); }
    return vid;
  };

  const fetchMessages = async () => {
    const vid = getVisitorId();
    if (!vid) return;
    try {
      const res = await fetch(`/api/chat?visitor_id=${vid}`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        const prev = messages.length;
        setMessages(data.messages);
        if (!open && data.messages.length > prev) {
          setUnread((u) => u + (data.messages.length - prev));
        }
        setStarted(true);
      }
    } catch {}
  };

  useEffect(() => {
    fetchMessages();
    // Poll every 5s for admin replies
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) { setUnread(0); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }
  }, [open, messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const vid = getVisitorId();
    setSending(true);

    const msg: Message = { sender: "visitor", message: input.trim(), created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, msg]);
    setInput("");

    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id: vid,
          name: name || undefined,
          email: email || undefined,
          message: msg.message,
          sender: "visitor",
        }),
      });
    } catch {}
    setSending(false);
  };

  const startChat = () => {
    if (!name.trim()) return;
    setStarted(true);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed z-[9999] flex items-center justify-center rounded-full shadow-lg cursor-pointer transition-transform hover:scale-105"
        style={{
          bottom: 20, right: 20, width: 56, height: 56,
          background: "linear-gradient(135deg,#00e5a0,#00b87d)",
          border: "none",
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        )}
        {unread > 0 && !open && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#ff4d6a", color: "#fff" }}>
            {unread}
          </div>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed z-[9998] flex flex-col" style={{
          bottom: 88, right: 20, width: 340, maxHeight: 460,
          background: "#12131a", border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,.6)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-3" style={{ background: "rgba(0,229,160,.06)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div>
              <div className="text-sm font-bold text-white">FXSynapse Support</div>
              <div className="text-[10px] font-mono flex items-center gap-1" style={{ color: "#00e5a0" }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#00e5a0" }} /> Online
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2" style={{ maxHeight: 300, minHeight: 200 }}>
            {!started ? (
              <div className="flex flex-col gap-3 mt-4">
                <p className="text-xs text-center" style={{ color: "rgba(255,255,255,.45)" }}>
                  Hi! 👋 How can we help? Enter your name to start chatting.
                </p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2.5 rounded-lg text-xs outline-none"
                  style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#fff" }}
                  onKeyDown={(e) => e.key === "Enter" && startChat()}
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (optional)"
                  className="w-full px-3 py-2.5 rounded-lg text-xs outline-none"
                  style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#fff" }}
                  onKeyDown={(e) => e.key === "Enter" && startChat()}
                />
                <button
                  onClick={startChat}
                  className="w-full py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                  style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f", border: "none" }}
                >
                  Start Chat
                </button>
              </div>
            ) : (
              <>
                {messages.length === 0 && (
                  <p className="text-xs text-center mt-4" style={{ color: "rgba(255,255,255,.3)" }}>
                    Send a message and we&apos;ll get back to you shortly!
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.sender === "visitor" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[80%] px-3 py-2 rounded-xl text-xs" style={{
                      background: m.sender === "visitor" ? "rgba(0,229,160,.12)" : "rgba(255,255,255,.05)",
                      color: m.sender === "visitor" ? "#00e5a0" : "rgba(255,255,255,.7)",
                      borderBottomRightRadius: m.sender === "visitor" ? 4 : 12,
                      borderBottomLeftRadius: m.sender === "admin" ? 4 : 12,
                    }}>
                      {m.message}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input */}
          {started && (
            <div className="px-3 py-2.5 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "#fff" }}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                className="px-3 py-2 rounded-lg cursor-pointer"
                style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", opacity: sending || !input.trim() ? 0.5 : 1 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
