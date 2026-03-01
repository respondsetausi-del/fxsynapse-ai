"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const SymbolMonitor = dynamic(() => import("@/components/SymbolMonitor"), { ssr: false });
const VoiceAssistant = dynamic(() => import("@/components/VoiceAssistant"), { ssr: false });
const TradingTerminal = dynamic(() => import("@/components/TradingTerminal"), { ssr: false });
const MT5TradeExecutor = dynamic(() => import("@/components/MT5TradeExecutor"), { ssr: false });
const AISignalEngine = dynamic(() => import("@/components/AISignalEngine"), { ssr: false });

/* ─── Types ─── */
interface Stats {
  totalUsers: number; scansToday: number; scansTotal: number; scansWeek: number; activeToday: number;
  revenueMonth: number; revenueLastMonth: number; revenueAllTime: number;
  planDistribution: Record<string, number>; blockedCount: number;
  chartDays: { date: string; label: string; revenue: number; signups: number; scans: number }[];
  retentionRate: number; churnRate: number; churned: number; uniqueActive7d: number; uniqueEverScanned: number;
  newUsersThisMonth: number; newUsersLastMonth: number; conversionRate: number; totalPaid: number;
}
interface UserRow {
  id: string; email: string; full_name: string; role: string; plan_id: string;
  credits_balance: number; daily_scans_used: number; subscription_status: string;
  monthly_scans_used: number; total_scans: number; created_at: string; is_blocked: boolean; blocked_reason: string | null;
  last_seen_at: string | null;
  plans: { name: string; price_cents: number; monthly_scans?: number; daily_scans?: number } | null;
}
interface PaymentRow {
  id: string; user_id: string; yoco_checkout_id: string; amount_cents: number;
  currency: string; type: string; plan_id: string; credits_amount: number;
  status: string; created_at: string;
  profiles: { email: string; full_name: string };
}
interface EmailLog {
  id: string; recipient_id: string; recipient_email: string; subject: string;
  body: string; status: string; created_at: string;
}
interface Badges {
  users: number; payments: number; paymentsCompleted: number; chat: number;
  affiliates: number; pendingPayments: number; failedPayments: number;
}
interface PaymentSummary {
  pending: { count: number; amount: number };
  completed: { count: number; amount: number };
  failed: { count: number; amount: number };
}

type Tab = "overview" | "users" | "revenue" | "retention" | "payments" | "email" | "funnel" | "chat" | "affiliates" | "tests";
type ModalType = "credits" | "plan" | "role" | "trial" | "block" | "email" | "delete";
type UserFilter = "all" | "starter" | "pro" | "premium" | "blocked" | "unpaid";

/* ─── Helpers ─── */
const fmt = (c: number) => `R${(c / 100).toFixed(2)}`;
const fmtK = (c: number) => c >= 100000 ? `R${(c / 100000).toFixed(1)}k` : `R${(c / 100).toFixed(0)}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtShort = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
const timeAgo = (d: string | null) => {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

/* ─── Mini Chart Component ─── */
function MiniChart({ data, dataKey, color, height = 80 }: { data: { label: string; [k: string]: unknown }[]; dataKey: string; color: string; height?: number }) {
  if (!data.length) return null;
  const vals = data.map((d) => (d[dataKey] as number) || 0);
  const max = Math.max(...vals, 1);
  const w = 100 / vals.length;
  return (
    <div style={{ height, position: "relative", display: "flex", alignItems: "flex-end", gap: "1px", padding: "0 2px" }}>
      {vals.map((v, i) => (
        <div key={i} title={`${data[i].label}: ${dataKey === "revenue" ? fmtK(v) : v}`}
          style={{ flex: 1, maxWidth: `${w}%`, height: `${Math.max((v / max) * 100, 2)}%`, background: color, borderRadius: "2px 2px 0 0", opacity: 0.7, transition: "all 0.2s", cursor: "crosshair" }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.7"; }}
        />
      ))}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ label, value, sub, color, icon, delta }: { label: string; value: string | number; sub?: string; color?: string; icon?: string; delta?: number }) {
  return (
    <div className="rounded-xl p-4 relative overflow-hidden" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-mono tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.3)" }}>{label}</div>
          <div className="text-2xl font-bold" style={{ color: color || "#fff", fontFamily: "'Outfit',sans-serif" }}>{value}</div>
          {sub && <div className="text-[10px] mt-1 font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{sub}</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {icon && <span className="text-lg">{icon}</span>}
          {delta !== undefined && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{
              background: delta >= 0 ? "rgba(0,229,160,.1)" : "rgba(255,77,106,.1)",
              color: delta >= 0 ? "#00e5a0" : "#ff4d6a",
            }}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Ring Chart ─── */
function RingChart({ data, size = 120 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const r = size / 2 - 8;
  const c = Math.PI * 2 * r;
  let offset = 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {data.map((d, i) => {
          const pct = d.value / total;
          const dash = pct * c;
          const gap = c - dash;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={d.color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset}
              style={{ transition: "all 0.5s ease" }}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        <div className="text-lg font-bold text-white">{total}</div>
        <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>USERS</div>
      </div>
    </div>
  );
}

/* ─── MAIN PAGE ─── */
export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [funnelData, setFunnelData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ratingsData, setRatingsData] = useState<any>(null);
  const [emailLogsTotal, setEmailLogsTotal] = useState(0);
  const [emailLogsPage, setEmailLogsPage] = useState(1);
  const [modal, setModal] = useState<{ user: UserRow; type: ModalType } | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [modalDesc, setModalDesc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [bulkEmail, setBulkEmail] = useState(false);
  const [bulkTarget, setBulkTarget] = useState("all");
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkBody, setBulkBody] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [quickSendOpen, setQuickSendOpen] = useState(false);
  const [quickSendTo, setQuickSendTo] = useState("");
  const [quickSendSubject, setQuickSendSubject] = useState("");
  const [quickSendBody, setQuickSendBody] = useState("");
  const [quickSending, setQuickSending] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyingPayments, setVerifyingPayments] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditing, setAuditing] = useState(false);
  const [chatThreads, setChatThreads] = useState<any[]>([]);
  const [chatActive, setChatActive] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatReply, setChatReply] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [affData, setAffData] = useState<any>(null);
  const [affPayouts, setAffPayouts] = useState<any[]>([]);
  const [affChatConvos, setAffChatConvos] = useState<any[]>([]);
  const [affChatActive, setAffChatActive] = useState<string | null>(null);
  const [affChatMessages, setAffChatMessages] = useState<any[]>([]);
  const [affChatReply, setAffChatReply] = useState("");
  const [affChatSending, setAffChatSending] = useState(false);
  const [badges, setBadges] = useState<Badges>({ users: 0, payments: 0, paymentsCompleted: 0, chat: 0, affiliates: 0, pendingPayments: 0, failedPayments: 0 });
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [terminalLogin, setTerminalLogin] = useState("21632565");
  const [terminalServer, setTerminalServer] = useState("DerivBVI-Server");
  const [terminalUrl, setTerminalUrl] = useState("https://mt5-real01-web-bvi.deriv.com/terminal?login=21632565&server=DerivBVI-Server");
  const [terminalConnected, setTerminalConnected] = useState(false);
  const affChatEndRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/users?page=${page}&search=${encodeURIComponent(search)}&filter=${userFilter}`);
    if (res.ok) { const d = await res.json(); setUsers(d.users); setTotal(d.total); }
  }, [page, search, userFilter]);

  const fetchPayments = useCallback(async () => {
    const res = await fetch(`/api/admin/payments?page=${paymentsPage}`);
    if (res.ok) { const d = await res.json(); setPayments(d.payments); setPaymentsTotal(d.total); if (d.summary) setPaymentSummary(d.summary); }
  }, [paymentsPage]);

  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/badges");
      if (res.ok) setBadges(await res.json());
    } catch { /* silent */ }
  }, []);

  const fetchEmailLogs = useCallback(async () => {
    const res = await fetch(`/api/admin/email?page=${emailLogsPage}`);
    if (res.ok) { const d = await res.json(); setEmailLogs(d.logs); setEmailLogsTotal(d.total); }
  }, [emailLogsPage]);

  useEffect(() => { fetchStats().then(() => setLoading(false)); }, [fetchStats]);
  useEffect(() => { if (tab === "users" || tab === "overview") fetchUsers(); }, [tab, fetchUsers]);
  useEffect(() => { if (tab === "payments") fetchPayments(); }, [tab, fetchPayments]);
  // Pre-fetch payment summary for badge accuracy
  useEffect(() => { fetch("/api/admin/payments?page=1").then(r => r.json()).then(d => { if (d.summary) setPaymentSummary(d.summary); }).catch(() => {}); }, []);
  useEffect(() => { if (tab === "email") fetchEmailLogs(); }, [tab, fetchEmailLogs]);

  // ── Badge polling — every 15s ──
  useEffect(() => {
    fetchBadges();
    const iv = setInterval(fetchBadges, 15000);
    return () => clearInterval(iv);
  }, [fetchBadges]);

  // ── Auto-refresh active tab silently — every 30s ──
  useEffect(() => {
    const refresh = () => {
      if (tab === "overview") { fetchStats(); fetchUsers(); }
      else if (tab === "users") fetchUsers();
      else if (tab === "payments") fetchPayments();
      else if (tab === "email") fetchEmailLogs();
      else if (tab === "revenue" || tab === "retention") fetchStats();
      else if (tab === "funnel") {
        fetch("/api/tracking?days=30").then(r => r.json()).then(d => setFunnelData(d)).catch(() => {});
        fetch("/api/ratings").then(r => r.json()).then(d => setRatingsData(d)).catch(() => {});
      }
      else if (tab === "affiliates") {
        Promise.all([
          fetch("/api/admin/affiliates?tab=overview").then(r => r.json()),
          fetch("/api/admin/affiliates?tab=payouts").then(r => r.json()),
        ]).then(([overview, payoutsData]) => {
          setAffData(overview);
          setAffPayouts(payoutsData.payouts || []);
        }).catch(() => {});
      }
    };
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [tab, fetchStats, fetchUsers, fetchPayments, fetchEmailLogs]);
  useEffect(() => {
    if (tab === "funnel") {
      fetch("/api/tracking?days=30").then(r => r.json()).then(d => setFunnelData(d)).catch(() => {});
      fetch("/api/ratings").then(r => r.json()).then(d => setRatingsData(d)).catch(() => {});
    }
  }, [tab]);

  // Chat: fetch threads
  useEffect(() => {
    if (tab === "chat") {
      const fetchThreads = () => fetch("/api/chat?admin=1").then(r => r.json()).then(d => setChatThreads(d.threads || [])).catch(() => {});
      fetchThreads();
      const iv = setInterval(fetchThreads, 5000);
      return () => clearInterval(iv);
    }
  }, [tab]);

  // Chat: fetch messages when thread selected
  useEffect(() => {
    if (chatActive) {
      const fetchMsgs = () => fetch(`/api/chat?visitor_id=${chatActive}`).then(r => r.json()).then(d => setChatMessages(d.messages || [])).catch(() => {});
      fetchMsgs();
      const iv = setInterval(fetchMsgs, 3000);
      return () => clearInterval(iv);
    }
  }, [chatActive]);

  // Affiliates: fetch data when tab selected
  useEffect(() => {
    if (tab === "affiliates") {
      Promise.all([
        fetch("/api/admin/affiliates?tab=overview").then(r => r.json()),
        fetch("/api/admin/affiliates?tab=payouts").then(r => r.json()),
      ]).then(([overview, payoutsData]) => {
        setAffData(overview);
        setAffPayouts(payoutsData.payouts || []);
      }).catch(() => {});
    }
  }, [tab]);

  // Affiliate chat: load conversations
  const loadAffChatConvos = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/affiliates/chat");
      if (res.ok) {
        const data = await res.json();
        setAffChatConvos(data.conversations || []);
      }
    } catch { /* silent */ }
  }, []);

  const loadAffChatMessages = useCallback(async (affiliateId: string) => {
    try {
      const res = await fetch(`/api/admin/affiliates/chat?affiliate_id=${affiliateId}`);
      if (res.ok) {
        const data = await res.json();
        setAffChatMessages(data.messages || []);
      }
    } catch { /* silent */ }
  }, []);

  const sendAffChatReply = async () => {
    if (!affChatReply.trim() || !affChatActive || affChatSending) return;
    setAffChatSending(true);
    try {
      const res = await fetch("/api/admin/affiliates/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliate_id: affChatActive, message: affChatReply.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setAffChatMessages(prev => [...prev, data.message]);
        setAffChatReply("");
        loadAffChatConvos();
      }
    } catch { /* silent */ }
    setAffChatSending(false);
  };

  useEffect(() => {
    if (tab === "affiliates") {
      loadAffChatConvos();
      const interval = setInterval(loadAffChatConvos, 15000);
      return () => clearInterval(interval);
    }
  }, [tab, loadAffChatConvos]);

  useEffect(() => {
    if (affChatActive) {
      loadAffChatMessages(affChatActive);
      const interval = setInterval(() => loadAffChatMessages(affChatActive), 10000);
      return () => clearInterval(interval);
    }
  }, [affChatActive, loadAffChatMessages]);

  useEffect(() => {
    if (affChatEndRef.current) affChatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [affChatMessages]);

  const sendChatReply = async () => {
    if (!chatReply.trim() || !chatActive) return;
    setChatSending(true);
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_id: chatActive, message: chatReply, sender: "admin", name: "FXSynapse Support" }),
      });
      setChatReply("");
      // Refresh messages
      const res = await fetch(`/api/chat?visitor_id=${chatActive}`);
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch {}
    setChatSending(false);
  };

  const handleSearchChange = (val: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setSearch(val); setPage(1); }, 300);
  };

  const handleAction = async () => {
    if (!modal) return;
    setActionLoading(true);
    try {
      if (modal.type === "email") {
        const res = await fetch("/api/admin/email", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: modal.user.id, email: modal.user.email, subject: emailSubject, body: emailBody }),
        });
        if (res.ok) { showToast(`Email sent to ${modal.user.email}`); setModal(null); setEmailSubject(""); setEmailBody(""); if (tab === "email") fetchEmailLogs(); }
        else showToast("Failed to send email", "error");
        setActionLoading(false);
        return;
      }

      if (modal.type === "block") {
        const isBlocked = modal.user.is_blocked;
        const res = await fetch("/api/admin/credits", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: isBlocked ? "unblock_user" : "block_user", userId: modal.user.id, reason: modalDesc }),
        });
        if (res.ok) { showToast(isBlocked ? `${modal.user.email} unblocked` : `${modal.user.email} blocked`); setModal(null); setModalValue(""); setModalDesc(""); fetchUsers(); fetchStats(); }
        setActionLoading(false);
        return;
      }

      if (modal.type === "trial") {
        const res = await fetch("/api/admin/gift-trial", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: modal.user.id, days: parseInt(modalValue) || 7 }),
        });
        if (res.ok) { showToast(`Pro trial gifted to ${modal.user.email}`); setModal(null); setModalValue(""); setModalDesc(""); fetchUsers(); fetchStats(); }
        setActionLoading(false);
        return;
      }

      if (modal.type === "delete") {
        const res = await fetch("/api/admin/delete-user", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: modal.user.id }),
        });
        if (res.ok) { showToast(`${modal.user.email} permanently deleted`); setModal(null); fetchUsers(); fetchStats(); }
        else { const err = await res.json().catch(() => ({})); showToast(`Delete failed: ${err.error || res.status}`, "error"); }
        setActionLoading(false);
        return;
      }

      let body: Record<string, unknown> = {};
      if (modal.type === "credits") body = { action: "allocate_credits", userId: modal.user.id, amount: parseInt(modalValue), description: modalDesc };
      else if (modal.type === "plan") body = { action: "change_plan", userId: modal.user.id, planId: modalValue };
      else if (modal.type === "role") body = { action: "set_role", userId: modal.user.id, role: modalValue };

      const res = await fetch("/api/admin/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        showToast(modal.type === "credits" ? `${modalValue} credits allocated` : `${modal.type} updated`);
        setModal(null); setModalValue(""); setModalDesc(""); fetchUsers(); fetchStats();
      } else showToast("Action failed", "error");
    } catch { showToast("Something went wrong", "error"); }
    setActionLoading(false);
  };

  const handleBulkEmail = async () => {
    if (!bulkSubject || !bulkBody) return;
    setBulkSending(true);
    try {
      // Detect if using a template
      const isTemplate = bulkBody.startsWith("[Template:");
      const templateId = isTemplate ? bulkBody.match(/\[Template: (.+?)\]/)?.[1] : null;
      
      const res = await fetch("/api/admin/email/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          subject: bulkSubject, 
          body: isTemplate ? undefined : bulkBody, 
          target: bulkTarget,
          templateId: templateId || undefined,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        showToast(`Sent to ${d.sent} users${d.failed > 0 ? ` (${d.failed} failed)` : ""}`);
        setBulkSubject(""); setBulkBody(""); setBulkEmail(false); fetchEmailLogs();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Bulk send failed", "error");
      }
    } catch { showToast("Error sending", "error"); }
    setBulkSending(false);
  };

  const handleQuickSend = async () => {
    if (!quickSendTo || !quickSendSubject || !quickSendBody) return;
    setQuickSending(true);
    try {
      const isTemplate = quickSendBody.startsWith("[Template:");
      const templateId = isTemplate ? quickSendBody.match(/\[Template: (.+?)\]/)?.[1]?.trim() : null;
      
      const res = await fetch("/api/admin/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: quickSendTo, 
          subject: quickSendSubject, 
          body: isTemplate ? undefined : quickSendBody,
          templateId: templateId || undefined,
        }),
      });
      if (res.ok) {
        showToast(`Email sent to ${quickSendTo}`);
        setQuickSendTo(""); setQuickSendSubject(""); setQuickSendBody(""); setQuickSendOpen(false); fetchEmailLogs();
      } else showToast("Failed to send email", "error");
    } catch { showToast("Error sending", "error"); }
    setQuickSending(false);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/"); };

  // ── Tab definitions ──
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "◎" },
    { id: "users", label: "Users", icon: "◉" },
    { id: "revenue", label: "Revenue", icon: "◈" },
    { id: "retention", label: "Retention", icon: "◇" },
    { id: "payments", label: "Payments", icon: "◆" },
    { id: "email", label: "Email", icon: "◁" },
    { id: "funnel", label: "Funnel", icon: "◐" },
    { id: "chat", label: "Chat", icon: "◌" },
    { id: "affiliates", label: "Affiliates", icon: "💰" },
    { id: "tests", label: "Tests", icon: "⚡" },
  ];

  const tabBadge = (id: Tab): number => {
    if (id === "users") return badges.users;
    if (id === "payments") return badges.payments;
    if (id === "revenue") return badges.paymentsCompleted;
    if (id === "chat") return badges.chat;
    if (id === "affiliates") return badges.affiliates;
    return 0;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#050507" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-lg" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", animation: "pulse 1.5s infinite" }} />
        <div className="text-xs font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Loading command center...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#050507" }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl" style={{
          background: toast.type === "success" ? "rgba(0,229,160,.15)" : "rgba(255,77,106,.15)",
          border: `1px solid ${toast.type === "success" ? "rgba(0,229,160,.3)" : "rgba(255,77,106,.3)"}`,
          color: toast.type === "success" ? "#00e5a0" : "#ff4d6a",
          backdropFilter: "blur(20px)", animation: "fadeUp 0.3s ease",
        }}>{toast.msg}</div>
      )}

      {/* ─── HEADER ─── */}
      <header className="flex items-center justify-between px-6 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.06)", background: "rgba(255,255,255,.01)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">FXSynapse</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,77,106,.12)", color: "#ff4d6a", letterSpacing: "1.5px" }}>COMMAND</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/dashboard?scanner=true")} className="text-[11px] font-mono px-3 py-1.5 rounded-lg cursor-pointer transition-all hover:opacity-80" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.45)" }}>← Scanner</button>
          <button onClick={handleLogout} className="text-[11px] font-mono px-3 py-1.5 rounded-lg cursor-pointer transition-all hover:opacity-80" style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.12)", color: "#ff4d6a" }}>Sign Out</button>
        </div>
      </header>

      {/* ─── TABS ─── */}
      <div className="flex gap-0.5 px-6 pt-3 pb-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {tabs.map((t) => {
          const count = tabBadge(t.id);
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-2 rounded-t-lg text-[11px] font-semibold cursor-pointer transition-all whitespace-nowrap relative"
              style={{
                background: tab === t.id ? "rgba(255,255,255,.04)" : "transparent",
                borderBottom: tab === t.id ? "2px solid #00e5a0" : "2px solid transparent",
                color: tab === t.id ? "#fff" : "rgba(255,255,255,.35)",
              }}>
              <span className="mr-1.5 opacity-60">{t.icon}</span>{t.label}
              {count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold" style={{
                  background: t.id === "payments" ? "rgba(240,185,11,.15)" : t.id === "chat" ? "rgba(255,77,106,.15)" : "rgba(0,229,160,.12)",
                  color: t.id === "payments" ? "#f0b90b" : t.id === "chat" ? "#ff4d6a" : "#00e5a0",
                  lineHeight: 1,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-5">

        {/* ═══════════════════════════════════ OVERVIEW TAB ═══════════════════════════════════ */}
        {tab === "overview" && stats && (
          <div className="space-y-5" style={{ animation: "fadeUp 0.3s ease" }}>
            {/* Top Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="TOTAL USERS" value={stats.totalUsers} icon="👥" color="#4da0ff" delta={pctChange(stats.newUsersThisMonth, stats.newUsersLastMonth)} />
              <StatCard label="ACTIVE TODAY" value={stats.activeToday} icon="⚡" color="#00e5a0" />
              <StatCard label="SCANS TODAY" value={stats.scansToday} icon="🔍" color="#00e5a0" sub={`${stats.scansWeek} this week`} />
              <StatCard label="REVENUE MTD" value={fmtK(stats.revenueMonth)} icon="💰" color="#f0b90b" delta={pctChange(stats.revenueMonth, stats.revenueLastMonth)} />
              <StatCard label="CONVERSION" value={`${stats.conversionRate}%`} icon="📈" color="#a855f7" sub={`${stats.totalPaid} paid users`} />
              <StatCard label="BLOCKED" value={stats.blockedCount} icon="🚫" color="#ff4d6a" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="text-[10px] font-mono tracking-widest mb-3" style={{ color: "rgba(255,255,255,.3)" }}>REVENUE — 30 DAYS</div>
                <MiniChart data={stats.chartDays} dataKey="revenue" color="#f0b90b" height={70} />
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="text-[10px] font-mono tracking-widest mb-3" style={{ color: "rgba(255,255,255,.3)" }}>SIGNUPS — 30 DAYS</div>
                <MiniChart data={stats.chartDays} dataKey="signups" color="#4da0ff" height={70} />
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="text-[10px] font-mono tracking-widest mb-3" style={{ color: "rgba(255,255,255,.3)" }}>SCANS — 30 DAYS</div>
                <MiniChart data={stats.chartDays} dataKey="scans" color="#00e5a0" height={70} />
              </div>
            </div>

            {/* Plan Distribution + Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl p-5 flex items-center gap-6" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                <RingChart data={[
                  { label: "Free", value: stats.planDistribution.free || 0, color: "rgba(255,255,255,.2)" },
                  { label: "Pro", value: stats.planDistribution.pro || 0, color: "#4da0ff" },
                  { label: "Premium", value: stats.planDistribution.premium || 0, color: "#f0b90b" },
                ]} />
                <div className="flex-1 space-y-2">
                  <div className="text-[10px] font-mono tracking-widest mb-3" style={{ color: "rgba(255,255,255,.3)" }}>PLAN MIX</div>
                  {[
                    { id: "starter", name: "Starter", color: "#4da0ff" },
                    { id: "pro", name: "Pro", color: "#4da0ff" },
                    { id: "premium", name: "Premium", color: "#f0b90b" },
                  ].map((p) => (
                    <div key={p.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                        <span className="text-xs text-white">{p.name}</span>
                      </div>
                      <span className="text-xs font-mono font-bold" style={{ color: p.color }}>{stats.planDistribution[p.id] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="text-[10px] font-mono tracking-widest mb-4" style={{ color: "rgba(255,255,255,.3)" }}>KEY METRICS</div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>7-Day Retention</span>
                    <span className="text-sm font-bold" style={{ color: stats.retentionRate >= 50 ? "#00e5a0" : stats.retentionRate >= 25 ? "#f0b90b" : "#ff4d6a" }}>{stats.retentionRate}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>Monthly Churn</span>
                    <span className="text-sm font-bold" style={{ color: stats.churnRate <= 10 ? "#00e5a0" : stats.churnRate <= 30 ? "#f0b90b" : "#ff4d6a" }}>{stats.churnRate}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>All-Time Revenue</span>
                    <span className="text-sm font-bold" style={{ color: "#f0b90b" }}>{fmtK(stats.revenueAllTime)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>Total Scans</span>
                    <span className="text-sm font-bold text-white">{stats.scansTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════ USERS TAB ═══════════════════════════════════ */}
        {tab === "users" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  {(["all", "starter", "pro", "premium", "unpaid", "blocked"] as UserFilter[]).map((f) => (
                    <button key={f} onClick={() => { setUserFilter(f); setPage(1); }}
                      className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold cursor-pointer capitalize transition-all"
                      style={{
                        background: userFilter === f ? (f === "blocked" ? "rgba(255,77,106,.12)" : "rgba(0,229,160,.1)") : "rgba(255,255,255,.03)",
                        border: `1px solid ${userFilter === f ? (f === "blocked" ? "rgba(255,77,106,.2)" : "rgba(0,229,160,.2)") : "rgba(255,255,255,.06)"}`,
                        color: userFilter === f ? (f === "blocked" ? "#ff4d6a" : "#00e5a0") : "rgba(255,255,255,.35)",
                      }}>{f}</button>
                  ))}
                </div>
                <input type="text" placeholder="Search email or name..." defaultValue={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="px-3 py-2 rounded-lg text-xs text-white outline-none w-full sm:w-64 font-mono"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      {["User", "Plan", "Monthly Usage", "Top-up", "Total Scans", "Last Seen", "Status", "Actions"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-mono font-semibold text-[10px] tracking-wider" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center"><div className="text-sm" style={{ color: "rgba(255,255,255,.3)" }}>No users found</div></td></tr>
                    ) : users.map((u) => (
                      <tr key={u.id} className="transition-colors hover:bg-white/[.02]" style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {u.is_blocked && <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                            <div>
                              <div className="text-white font-semibold text-[13px]">{u.full_name || "—"}</div>
                              <div className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>{u.email}</div>
                              <div className="flex gap-1 mt-0.5">
                                {u.role === "admin" && <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: "rgba(255,77,106,.12)", color: "#ff4d6a" }}>ADMIN</span>}
                                {u.is_blocked && <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: "rgba(255,77,106,.12)", color: "#ff4d6a" }}>BLOCKED</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold" style={{
                            background: u.plan_id === "premium" ? "rgba(240,185,11,.1)" : u.plan_id === "pro" ? "rgba(77,160,255,.1)" : "rgba(255,255,255,.04)",
                            color: u.plan_id === "premium" ? "#f0b90b" : u.plan_id === "pro" ? "#4da0ff" : "rgba(255,255,255,.35)",
                          }}>{u.plans?.name || u.plan_id}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {u.subscription_status === "active" ? (
                            <span style={{ color: "#00e5a0" }}>
                              {u.monthly_scans_used || 0}/{u.plans?.monthly_scans === -1 ? "∞" : (u.plans?.monthly_scans ?? u.plans?.daily_scans ?? 0)}
                            </span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,.3)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-white">{u.credits_balance}</td>
                        <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.45)" }}>{u.total_scans}</td>
                        <td className="px-4 py-3 font-mono text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>{timeAgo(u.last_seen_at)}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-mono" style={{ color: u.subscription_status === "active" ? "#00e5a0" : "rgba(255,255,255,.25)" }}>{u.subscription_status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            <Btn color="#00e5a0" label="Credits" onClick={() => { setModal({ user: u, type: "credits" }); setModalValue("10"); setModalDesc(""); }} />
                            <Btn color="#4da0ff" label="Plan" onClick={() => { setModal({ user: u, type: "plan" }); setModalValue(u.plan_id); }} />
                            <Btn color="#f0b90b" label="Role" onClick={() => { setModal({ user: u, type: "role" }); setModalValue(u.role); }} />
                            <Btn color={u.is_blocked ? "#00e5a0" : "#ff4d6a"} label={u.is_blocked ? "Unblock" : "Block"} onClick={() => { setModal({ user: u, type: "block" }); setModalDesc(""); }} />
                            <Btn color="#a855f7" label="Email" onClick={() => { setModal({ user: u, type: "email" }); setEmailSubject(""); setEmailBody(""); }} />
                            {(u.plan_id === "none" || u.plan_id === "free") && <Btn color="#a855f7" label="🎁 Trial" onClick={() => { setModal({ user: u, type: "trial" }); setModalValue("7"); }} />}
                            <Btn color="#ff4d6a" label="🗑️" onClick={() => { setModal({ user: u, type: "delete" }); }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between p-4" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{total} users total</span>
                <div className="flex gap-1">
                  <PgBtn label="Prev" disabled={page <= 1} onClick={() => setPage(page - 1)} />
                  <span className="px-3 py-1 text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Page {page}</span>
                  <PgBtn label="Next" disabled={page * 20 >= total} onClick={() => setPage(page + 1)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════ REVENUE TAB ═══════════════════════════════════ */}
        {tab === "revenue" && stats && (
          <div className="space-y-5" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="THIS MONTH" value={fmtK(stats.revenueMonth)} color="#f0b90b" icon="💰" delta={pctChange(stats.revenueMonth, stats.revenueLastMonth)} />
              <StatCard label="LAST MONTH" value={fmtK(stats.revenueLastMonth)} color="rgba(240,185,11,.6)" icon="📅" />
              <StatCard label="ALL TIME" value={fmtK(stats.revenueAllTime)} color="#f0b90b" icon="🏦" />
              <StatCard label="PAID USERS" value={stats.totalPaid} color="#4da0ff" icon="👤" sub={`${stats.conversionRate}% of all users`} />
            </div>

            <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="text-[10px] font-mono tracking-widest mb-4" style={{ color: "rgba(255,255,255,.3)" }}>DAILY REVENUE — LAST 30 DAYS</div>
              <MiniChart data={stats.chartDays} dataKey="revenue" color="#f0b90b" height={120} />
              <div className="flex justify-between mt-2">
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{stats.chartDays[0]?.label}</span>
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{stats.chartDays[stats.chartDays.length - 1]?.label}</span>
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="text-[10px] font-mono tracking-widest mb-4" style={{ color: "rgba(255,255,255,.3)" }}>DAILY SIGNUPS — LAST 30 DAYS</div>
              <MiniChart data={stats.chartDays} dataKey="signups" color="#4da0ff" height={90} />
              <div className="flex justify-between mt-2">
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{stats.chartDays[0]?.label}</span>
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{stats.chartDays[stats.chartDays.length - 1]?.label}</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════ RETENTION TAB ═══════════════════════════════════ */}
        {tab === "retention" && stats && (
          <div className="space-y-5" style={{ animation: "fadeUp 0.3s ease" }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="7-DAY RETENTION" value={`${stats.retentionRate}%`} color={stats.retentionRate >= 50 ? "#00e5a0" : stats.retentionRate >= 25 ? "#f0b90b" : "#ff4d6a"} icon="🔄" sub={`${stats.uniqueActive7d} of ${stats.uniqueEverScanned} users`} />
              <StatCard label="MONTHLY CHURN" value={`${stats.churnRate}%`} color={stats.churnRate <= 10 ? "#00e5a0" : stats.churnRate <= 30 ? "#f0b90b" : "#ff4d6a"} icon="📉" sub={`${stats.churned} users churned`} />
              <StatCard label="NEW THIS MONTH" value={stats.newUsersThisMonth} color="#4da0ff" icon="🆕" delta={pctChange(stats.newUsersThisMonth, stats.newUsersLastMonth)} />
              <StatCard label="CONVERSION RATE" value={`${stats.conversionRate}%`} color="#a855f7" icon="🎯" sub={`${stats.totalPaid} paying users`} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="text-[10px] font-mono tracking-widest mb-4" style={{ color: "rgba(255,255,255,.3)" }}>DAILY ACTIVITY — SCANS</div>
                <MiniChart data={stats.chartDays} dataKey="scans" color="#00e5a0" height={100} />
                <div className="flex justify-between mt-2">
                  <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{stats.chartDays[0]?.label}</span>
                  <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>{stats.chartDays[stats.chartDays.length - 1]?.label}</span>
                </div>
              </div>
              <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div className="text-[10px] font-mono tracking-widest mb-4" style={{ color: "rgba(255,255,255,.3)" }}>RETENTION BREAKDOWN</div>
                <div className="space-y-4">
                  <MetricBar label="Active 7d" value={stats.uniqueActive7d} max={stats.totalUsers} color="#00e5a0" />
                  <MetricBar label="Ever Scanned" value={stats.uniqueEverScanned} max={stats.totalUsers} color="#4da0ff" />
                  <MetricBar label="Paid Users" value={stats.totalPaid} max={stats.totalUsers} color="#f0b90b" />
                  <MetricBar label="Churned (mo)" value={stats.churned} max={stats.totalUsers} color="#ff4d6a" />
                </div>
              </div>
            </div>

            {/* Health Score */}
            <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="text-[10px] font-mono tracking-widest mb-3" style={{ color: "rgba(255,255,255,.3)" }}>HEALTH SCORE</div>
              {(() => {
                const score = Math.round(
                  (stats.retentionRate * 0.35) +
                  ((100 - stats.churnRate) * 0.25) +
                  (stats.conversionRate * 0.25) +
                  (Math.min(stats.activeToday / Math.max(stats.totalUsers, 1) * 100, 100) * 0.15)
                );
                const color = score >= 70 ? "#00e5a0" : score >= 40 ? "#f0b90b" : "#ff4d6a";
                const label = score >= 70 ? "Healthy" : score >= 40 ? "Needs Attention" : "Critical";
                return (
                  <div>
                    <div className="flex items-end gap-3 mb-2">
                      <span className="text-4xl font-bold" style={{ color }}>{score}</span>
                      <span className="text-sm font-semibold mb-1" style={{ color }}>{label}</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
                    </div>
                    <div className="grid grid-cols-4 gap-3 mt-4 text-[10px] font-mono" style={{ color: "rgba(255,255,255,.35)" }}>
                      <div>Retention (35%): {stats.retentionRate}%</div>
                      <div>Anti-Churn (25%): {100 - stats.churnRate}%</div>
                      <div>Conversion (25%): {stats.conversionRate}%</div>
                      <div>DAU ratio (15%): {Math.round(stats.activeToday / Math.max(stats.totalUsers, 1) * 100)}%</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════ PAYMENTS TAB ═══════════════════════════════════ */}
        {tab === "payments" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            {/* Payment Summary Cards */}
            {paymentSummary && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl p-4" style={{ background: "rgba(240,185,11,.04)", border: "1px solid rgba(240,185,11,.1)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono tracking-widest" style={{ color: "rgba(240,185,11,.6)" }}>⏳ PENDING</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(240,185,11,.1)", color: "#f0b90b" }}>{paymentSummary.pending.count}</span>
                  </div>
                  <div className="text-xl font-bold font-mono" style={{ color: "#f0b90b" }}>{fmt(paymentSummary.pending.amount)}</div>
                  <div className="text-[9px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.2)" }}>awaiting verification</div>
                </div>
                <div className="rounded-xl p-4" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono tracking-widest" style={{ color: "rgba(0,229,160,.6)" }}>✅ COMPLETED</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,229,160,.1)", color: "#00e5a0" }}>{paymentSummary.completed.count}</span>
                  </div>
                  <div className="text-xl font-bold font-mono" style={{ color: "#00e5a0" }}>{fmt(paymentSummary.completed.amount)}</div>
                  <div className="text-[9px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.2)" }}>total revenue collected</div>
                </div>
                <div className="rounded-xl p-4" style={{ background: "rgba(255,77,106,.04)", border: "1px solid rgba(255,77,106,.1)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono tracking-widest" style={{ color: "rgba(255,77,106,.6)" }}>✕ FAILED</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,77,106,.1)", color: "#ff4d6a" }}>{paymentSummary.failed.count}</span>
                  </div>
                  <div className="text-xl font-bold font-mono" style={{ color: "#ff4d6a" }}>{fmt(paymentSummary.failed.amount)}</div>
                  <div className="text-[9px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.2)" }}>needs follow-up</div>
                </div>
              </div>
            )}
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <h2 className="text-sm font-bold text-white">Payment History</h2>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    try {
                      const res = await fetch("/api/admin/register-webhook", { method: "POST" });
                      const data = await res.json();
                      if (data.success || data.message?.includes("already")) showToast(data.message || "Webhook registered! ✅");
                      else showToast(`Webhook error: ${data.error || "Unknown"}`, "error");
                    } catch { showToast("Failed to register webhook", "error"); }
                  }}
                    className="px-3 py-2 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                    style={{ background: "rgba(77,160,255,.1)", border: "1px solid rgba(77,160,255,.2)", color: "#4da0ff" }}>
                    🔗 Register Webhook
                  </button>
                  <button onClick={async () => {
                    setVerifyingPayments(true); setVerifyResult(null);
                    try {
                      const res = await fetch("/api/admin/verify-payments", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ force: false }),
                      });
                      const data = await res.json();
                      setVerifyResult(data);
                      if (data.activated > 0) { fetchPayments(); fetchUsers(); fetchStats(); }
                      showToast(`Verified: ${data.activated} activated out of ${data.checked}`);
                    } catch { showToast("Verification failed", "error"); }
                    setVerifyingPayments(false);
                  }} disabled={verifyingPayments}
                    className="px-4 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
                    style={{ background: "linear-gradient(135deg,#f0b90b,#d4a00a)", color: "#0a0b0f", opacity: verifyingPayments ? 0.5 : 1 }}>
                    {verifyingPayments ? "Checking..." : "⚡ Verify Pending"}
                  </button>
                  <button onClick={async () => {
                    if (!confirm("⚠️ This will revert ALL force-activated payments and downgrade those users to free. Continue?")) return;
                    try {
                      const res = await fetch("/api/admin/revert-payments", { method: "POST" });
                      const data = await res.json();
                      showToast(data.message);
                      fetchPayments(); fetchUsers(); fetchStats();
                    } catch { showToast("Revert failed", "error"); }
                  }}
                    className="px-3 py-2 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                    style={{ background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.2)", color: "#ff4d6a" }}>
                    🔄 Revert False
                  </button>
                  <button onClick={async () => {
                    const email = prompt("Enter user email to activate:");
                    if (!email) return;
                    const planId = prompt("Enter plan (basic/starter/pro/unlimited):");
                    if (!planId || !["basic","starter","pro","unlimited"].includes(planId)) { showToast("Invalid plan", "error"); return; }
                    if (!confirm(`Activate ${planId} plan for ${email}?`)) return;
                    try {
                      const res = await fetch("/api/admin/manual-activate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, planId }),
                      });
                      const data = await res.json();
                      if (data.success) { showToast(data.message); fetchPayments(); fetchUsers(); fetchStats(); }
                      else showToast(data.error || "Failed", "error");
                    } catch { showToast("Activation failed", "error"); }
                  }}
                    className="px-3 py-2 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                    style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.2)", color: "#00e5a0" }}>
                    ✅ Manual Activate
                  </button>
                </div>
              </div>
              {verifyResult && (
                <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)", background: "rgba(240,185,11,.03)" }}>
                  <div className="flex gap-4 flex-wrap text-[11px] font-mono">
                    <span style={{ color: "#00e5a0" }}>✅ Activated: {verifyResult.activated}</span>
                    <span style={{ color: "rgba(255,255,255,.4)" }}>Checked: {verifyResult.verified}/{verifyResult.total}</span>
                    {verifyResult.failed > 0 && <span style={{ color: "#ff4d6a" }}>Errors: {verifyResult.failed}</span>}
                  </div>
                  {verifyResult.results?.filter((r: { status: string }) => r.status === "activated").length > 0 && (
                    <div className="mt-2 space-y-1">
                      {verifyResult.results.filter((r: { status: string }) => r.status === "activated").map((r: { email: string; plan: string }, i: number) => (
                        <div key={i} className="text-[10px] font-mono" style={{ color: "#00e5a0" }}>✅ {r.email} → {r.plan}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      {["Date", "User", "Type", "Amount", "Plan/Credits", "Status", "Actions"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-mono font-semibold text-[10px] tracking-wider" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center"><div className="text-2xl mb-2">💳</div><div className="text-sm" style={{ color: "rgba(255,255,255,.3)" }}>No payments yet</div></td></tr>
                    ) : payments.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[.02]" style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                        <td className="px-4 py-3 font-mono text-[10px]" style={{ color: "rgba(255,255,255,.4)" }}>{fmtDate(p.created_at)}</td>
                        <td className="px-4 py-3"><div className="text-white font-semibold text-[13px]">{p.profiles?.full_name || "—"}</div><div className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>{p.profiles?.email}</div></td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: p.type === "subscription" ? "rgba(77,160,255,.1)" : "rgba(240,185,11,.1)", color: p.type === "subscription" ? "#4da0ff" : "#f0b90b" }}>{p.type}</span></td>
                        <td className="px-4 py-3 font-mono font-bold text-white">{fmt(p.amount_cents)}</td>
                        <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{p.type === "subscription" ? p.plan_id : `${p.credits_amount || 0} credits`}</td>
                        <td className="px-4 py-3"><span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: p.status === "completed" ? "rgba(0,229,160,.08)" : p.status === "failed" ? "rgba(255,77,106,.08)" : "rgba(240,185,11,.08)", color: p.status === "completed" ? "#00e5a0" : p.status === "failed" ? "#ff4d6a" : "#f0b90b" }}>{p.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {(p.status === "pending" || p.status === "failed") && (
                              <button onClick={async () => {
                                try {
                                  const res = await fetch("/api/admin/payment-followup", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ paymentId: p.id, templateId: "payment_issue" }),
                                  });
                                  const data = await res.json();
                                  if (data.success) showToast(`💬 Sent to ${data.email}`);
                                  else showToast(data.error || "Failed", "error");
                                } catch { showToast("Send failed", "error"); }
                              }}
                                className="px-2 py-1 rounded text-[9px] font-bold cursor-pointer"
                                style={{ background: "rgba(77,160,255,.1)", border: "1px solid rgba(77,160,255,.15)", color: "#4da0ff" }}
                                title="Send payment help email">
                                💬 Help
                              </button>
                            )}
                            {(p.status === "pending" || p.status === "failed") && (
                              <button onClick={async () => {
                                try {
                                  const res = await fetch("/api/admin/payment-followup", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ paymentId: p.id, templateId: "payment_retry" }),
                                  });
                                  const data = await res.json();
                                  if (data.success) showToast(`🔄 Retry sent to ${data.email}`);
                                  else showToast(data.error || "Failed", "error");
                                } catch { showToast("Send failed", "error"); }
                              }}
                                className="px-2 py-1 rounded text-[9px] font-bold cursor-pointer"
                                style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.15)", color: "#00e5a0" }}
                                title="Send retry encouragement">
                                🔄 Retry
                              </button>
                            )}
                            {p.status === "completed" && <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.2)" }}>—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {paymentsTotal > 0 && (
                <div className="flex items-center justify-between p-4" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                  <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{paymentsTotal} payments</span>
                  <div className="flex gap-1">
                    <PgBtn label="Prev" disabled={paymentsPage <= 1} onClick={() => setPaymentsPage(paymentsPage - 1)} />
                    <span className="px-3 py-1 text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Page {paymentsPage}</span>
                    <PgBtn label="Next" disabled={paymentsPage * 20 >= paymentsTotal} onClick={() => setPaymentsPage(paymentsPage + 1)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════ EMAIL TAB ═══════════════════════════════════ */}
        {tab === "email" && (
          <div className="space-y-5" style={{ animation: "fadeUp 0.3s ease" }}>
            {/* Quick Send to Any Email */}
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <div>
                  <h2 className="text-sm font-bold text-white">Quick Send</h2>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>Send email to any address — doesn&apos;t have to be a user</p>
                </div>
                <button onClick={() => setQuickSendOpen(!quickSendOpen)} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-all" style={{ background: quickSendOpen ? "rgba(255,77,106,.1)" : "rgba(168,85,247,.1)", border: `1px solid ${quickSendOpen ? "rgba(255,77,106,.2)" : "rgba(168,85,247,.2)"}`, color: quickSendOpen ? "#ff4d6a" : "#a855f7" }}>
                  {quickSendOpen ? "Cancel" : "✉️ Compose"}
                </button>
              </div>
              {quickSendOpen && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>USE TEMPLATE (optional)</label>
                    <select onChange={(e) => {
                      if (!e.target.value) return;
                      const templates: Record<string, { subject: string; body: string }> = {
                        winback_free_scan: { subject: "Your free AI chart scan is waiting — don't miss it", body: "[Template: 🔥 Your Free Scan is Waiting]" },
                        winback_urgency: { subject: "⏰ Your free scan expires soon — use it now", body: "[Template: ⏰ Last Chance]" },
                        convert_after_scan: { subject: "You tried it — now unlock unlimited scans", body: "[Template: 💎 Upgrade]" },
                        feature_showcase: { subject: "3 things FXSynapse AI can do that you haven't tried", body: "[Template: 🧠 Features]" },
                        payment_issue: { subject: "Having trouble with your payment? Let us help", body: "[Template: 💳 Payment Help]" },
                        payment_retry: { subject: "Your FXSynapse AI plan is one click away", body: "[Template: 🔄 Retry]" },
                        promo_limited: { subject: "🎉 Limited time: Get bonus scans when you subscribe today", body: "[Template: 🎉 Promo]" },
                      };
                      const t = templates[e.target.value];
                      if (t) { setQuickSendSubject(t.subject); setQuickSendBody(t.body); }
                    }}
                      className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
                      <option value="">— Select template or write custom —</option>
                      <optgroup label="🔥 Win Back">
                        <option value="winback_free_scan">🔥 Your Free Scan is Waiting</option>
                        <option value="winback_urgency">⏰ Last Chance: Free Scan Expiring</option>
                      </optgroup>
                      <optgroup label="💎 Conversion">
                        <option value="convert_after_scan">💎 Loved Your Scan? Get More</option>
                        <option value="feature_showcase">🧠 Did You Know? AI Features</option>
                      </optgroup>
                      <optgroup label="💳 Payment">
                        <option value="payment_issue">💳 Payment Trouble? We're Here</option>
                        <option value="payment_retry">🔄 Ready to Try Again?</option>
                      </optgroup>
                      <optgroup label="🎉 Promo">
                        <option value="promo_limited">🎉 Special Offer: Extra Scans</option>
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>TO (EMAIL ADDRESS)</label>
                    <input type="email" value={quickSendTo} onChange={(e) => setQuickSendTo(e.target.value)} placeholder="someone@example.com"
                      className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>SUBJECT</label>
                    <input type="text" value={quickSendSubject} onChange={(e) => setQuickSendSubject(e.target.value)} placeholder="Email subject..."
                      className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>BODY</label>
                    <textarea value={quickSendBody} onChange={(e) => setQuickSendBody(e.target.value)} placeholder="Write your message... (supports line breaks)" rows={5}
                      className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono resize-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                  </div>
                  <button onClick={handleQuickSend} disabled={quickSending || !quickSendTo || !quickSendSubject || !quickSendBody}
                    className="px-6 py-3 rounded-xl text-sm font-bold cursor-pointer transition-all"
                    style={{ background: "linear-gradient(135deg,#a855f7,#7c3aed)", color: "#fff", opacity: quickSending || !quickSendTo || !quickSendSubject || !quickSendBody ? 0.5 : 1 }}>
                    {quickSending ? "Sending..." : `Send to ${quickSendTo || "..."}`}
                  </button>
                </div>
              )}
            </div>

            {/* Bulk Email Section */}
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <div>
                  <h2 className="text-sm font-bold text-white">Broadcast Email</h2>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>Send email to all users or a filtered group</p>
                </div>
                <button onClick={() => setBulkEmail(!bulkEmail)} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-all" style={{ background: bulkEmail ? "rgba(255,77,106,.1)" : "rgba(0,229,160,.1)", border: `1px solid ${bulkEmail ? "rgba(255,77,106,.2)" : "rgba(0,229,160,.2)"}`, color: bulkEmail ? "#ff4d6a" : "#00e5a0" }}>
                  {bulkEmail ? "Cancel" : "Compose Broadcast"}
                </button>
              </div>
              {bulkEmail && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>TARGET AUDIENCE</label>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { id: "all", label: "All Users" },
                        { id: "free", label: "Free Users" },
                        { id: "never_scanned", label: "Never Scanned" },
                        { id: "starter", label: "Starter" },
                        { id: "pro", label: "Pro" },
                        { id: "premium", label: "Premium" },
                        { id: "active", label: "Active Subs" },
                      ].map((t) => (
                        <button key={t.id} onClick={() => setBulkTarget(t.id)}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all"
                          style={{
                            background: bulkTarget === t.id ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.03)",
                            border: `1px solid ${bulkTarget === t.id ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
                            color: bulkTarget === t.id ? "#00e5a0" : "rgba(255,255,255,.35)",
                          }}>{t.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>USE TEMPLATE (optional)</label>
                    <select onChange={(e) => {
                      if (!e.target.value) return;
                      const templates: Record<string, { subject: string }> = {
                        winback_free_scan: { subject: "Your free AI chart scan is waiting — don't miss it" },
                        winback_urgency: { subject: "⏰ Your free scan expires soon — use it now" },
                        convert_after_scan: { subject: "You tried it — now unlock unlimited scans" },
                        feature_showcase: { subject: "3 things FXSynapse AI can do that you haven't tried" },
                        payment_issue: { subject: "Having trouble with your payment? Let us help" },
                        payment_retry: { subject: "Your FXSynapse AI plan is one click away" },
                        promo_limited: { subject: "🎉 Limited time: Get bonus scans when you subscribe today" },
                      };
                      const t = templates[e.target.value];
                      if (t) { setBulkSubject(t.subject); setBulkBody(`[Template: ${e.target.value}]`); }
                    }}
                      className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
                      <option value="">— Select template or write custom —</option>
                      <optgroup label="🔥 Win Back (best for Never Scanned)">
                        <option value="winback_free_scan">🔥 Your Free Scan is Waiting</option>
                        <option value="winback_urgency">⏰ Last Chance: Free Scan Expiring</option>
                      </optgroup>
                      <optgroup label="💎 Conversion (best for Free users)">
                        <option value="convert_after_scan">💎 Loved Your Scan? Get More</option>
                        <option value="feature_showcase">🧠 Did You Know? AI Features</option>
                      </optgroup>
                      <optgroup label="💳 Payment (best for failed payments)">
                        <option value="payment_issue">💳 Payment Trouble? We're Here</option>
                        <option value="payment_retry">🔄 Ready to Try Again?</option>
                      </optgroup>
                      <optgroup label="🎉 Promo">
                        <option value="promo_limited">🎉 Special Offer: Extra Scans</option>
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>SUBJECT</label>
                    <input type="text" value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)} placeholder="Email subject..."
                      className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>BODY (ignored if template selected)</label>
                    <textarea value={bulkBody} onChange={(e) => setBulkBody(e.target.value)} placeholder="Write your message... (supports line breaks)" rows={5}
                      className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none font-mono resize-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                  </div>
                  <button onClick={handleBulkEmail} disabled={bulkSending || !bulkSubject || !bulkBody}
                    className="px-6 py-3 rounded-xl text-sm font-bold cursor-pointer transition-all"
                    style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f", opacity: bulkSending || !bulkSubject || !bulkBody ? 0.5 : 1 }}>
                    {bulkSending ? "Sending..." : `Send to ${bulkTarget === "all" ? "All Users" : bulkTarget + " users"}`}
                  </button>
                </div>
              )}
            </div>

            {/* Email Logs */}
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <h2 className="text-sm font-bold text-white">Email Log</h2>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>History of all emails sent from admin</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      {["Date", "Recipient", "Subject", "Status"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-mono font-semibold text-[10px] tracking-wider" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {emailLogs.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-12 text-center"><div className="text-2xl mb-2">📧</div><div className="text-sm" style={{ color: "rgba(255,255,255,.3)" }}>No emails sent yet</div></td></tr>
                    ) : emailLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-white/[.02]" style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                        <td className="px-4 py-3 font-mono text-[10px]" style={{ color: "rgba(255,255,255,.4)" }}>{fmtDate(l.created_at)}</td>
                        <td className="px-4 py-3 font-mono text-white text-[11px]">{l.recipient_email}</td>
                        <td className="px-4 py-3 text-white text-[11px]" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.subject}</td>
                        <td className="px-4 py-3"><span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: l.status === "sent" ? "rgba(0,229,160,.08)" : "rgba(255,77,106,.08)", color: l.status === "sent" ? "#00e5a0" : "#ff4d6a" }}>{l.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {emailLogsTotal > 0 && (
                <div className="flex items-center justify-between p-4" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                  <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{emailLogsTotal} emails</span>
                  <div className="flex gap-1">
                    <PgBtn label="Prev" disabled={emailLogsPage <= 1} onClick={() => setEmailLogsPage(emailLogsPage - 1)} />
                    <span className="px-3 py-1 text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Page {emailLogsPage}</span>
                    <PgBtn label="Next" disabled={emailLogsPage * 20 >= emailLogsTotal} onClick={() => setEmailLogsPage(emailLogsPage + 1)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════ FUNNEL TAB ═══════════════════════ */}
        {tab === "funnel" && (
          <div className="space-y-5" style={{ animation: "fadeUp 0.3s ease" }}>
            {!funnelData ? (
              <div className="text-center py-20"><div className="text-2xl mb-2">◌</div><div className="text-sm" style={{ color: "rgba(255,255,255,.3)" }}>Loading funnel data...</div></div>
            ) : (
              <>
                {/* Funnel Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: "Landing Visits", value: funnelData.stats?.landing_visits || 0, color: "#4da0ff" },
                    { label: "Signup Clicks", value: funnelData.stats?.signup_clicks || 0, color: "#00e5a0" },
                    { label: "Signup Rate", value: `${funnelData.stats?.signup_rate || 0}%`, color: "#f0b90b" },
                    { label: "Unique Visitors", value: funnelData.stats?.unique_visitors || 0, color: "#fff" },
                    { label: "APK Downloads", value: funnelData.stats?.apk_downloads || 0, color: "#3ddc84" },
                  ].map((s, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                      <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,.3)" }}>{s.label}</div>
                      <div className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Broker Stats */}
                <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                  <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <h2 className="text-sm font-bold text-white">Broker Performance</h2>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>IB link click tracking across all placements</p>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      {[
                        { label: "Total Broker Clicks", value: funnelData.stats?.broker_clicks || 0, color: "#f0b90b" },
                        { label: "Popup Shown", value: funnelData.stats?.broker_popup_shown || 0, color: "#4da0ff" },
                        { label: "Popup Dismissed", value: funnelData.stats?.broker_popup_dismissed || 0, color: "#ff4d6a" },
                        { label: "Popup Click Rate", value: `${funnelData.stats?.broker_click_rate || 0}%`, color: "#00e5a0" },
                      ].map((s, i) => (
                        <div key={i} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                          <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,.25)" }}>{s.label}</div>
                          <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Clicks by Source */}
                    <div className="text-[10px] font-mono uppercase tracking-wider mb-2 mt-4" style={{ color: "rgba(255,255,255,.3)" }}>Broker Clicks by Source</div>
                    <div className="space-y-2">
                      {Object.entries(funnelData.stats?.broker_by_source || {}).length === 0 ? (
                        <div className="text-[11px] py-4 text-center" style={{ color: "rgba(255,255,255,.2)" }}>No broker clicks yet</div>
                      ) : Object.entries(funnelData.stats?.broker_by_source || {}).sort(([,a],[,b]) => (b as number) - (a as number)).map(([source, count]) => {
                        const total = funnelData.stats?.broker_clicks || 1;
                        const pct = Math.round(((count as number) / total) * 100);
                        return (
                          <div key={source} className="flex items-center gap-3">
                            <div className="w-24 text-[11px] font-mono font-semibold" style={{ color: "rgba(255,255,255,.5)" }}>{source}</div>
                            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,.04)" }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #f0b90b, #e6a800)" }} />
                            </div>
                            <div className="text-[11px] font-mono font-bold" style={{ color: "#f0b90b" }}>{count as number}</div>
                            <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{pct}%</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Signup Clicks by Source */}
                    <div className="text-[10px] font-mono uppercase tracking-wider mb-2 mt-5" style={{ color: "rgba(255,255,255,.3)" }}>Signup Clicks by Source</div>
                    <div className="space-y-2">
                      {Object.entries(funnelData.stats?.signup_by_source || {}).length === 0 ? (
                        <div className="text-[11px] py-4 text-center" style={{ color: "rgba(255,255,255,.2)" }}>No signup clicks yet</div>
                      ) : Object.entries(funnelData.stats?.signup_by_source || {}).sort(([,a],[,b]) => (b as number) - (a as number)).map(([source, count]) => {
                        const total = funnelData.stats?.signup_clicks || 1;
                        const pct = Math.round(((count as number) / total) * 100);
                        return (
                          <div key={source} className="flex items-center gap-3">
                            <div className="w-24 text-[11px] font-mono font-semibold" style={{ color: "rgba(255,255,255,.5)" }}>{source}</div>
                            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,.04)" }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #00e5a0, #00b87d)" }} />
                            </div>
                            <div className="text-[11px] font-mono font-bold" style={{ color: "#00e5a0" }}>{count as number}</div>
                            <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Visual Funnel */}
                <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                  <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <h2 className="text-sm font-bold text-white">Conversion Funnel</h2>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>Landing → Signup → Broker click flow</p>
                  </div>
                  <div className="p-6 flex flex-col items-center gap-2">
                    {[
                      { label: "Landed on Site", value: funnelData.stats?.landing_visits || 0, color: "#4da0ff", width: "100%" },
                      { label: "Saw Broker Popup", value: funnelData.stats?.broker_popup_shown || 0, color: "#f0b90b", width: "75%" },
                      { label: "Clicked Signup", value: funnelData.stats?.signup_clicks || 0, color: "#00e5a0", width: "50%" },
                      { label: "Clicked Broker Link", value: funnelData.stats?.broker_clicks || 0, color: "#f0b90b", width: "35%" },
                      { label: "Downloaded APK", value: funnelData.stats?.apk_downloads || 0, color: "#3ddc84", width: "20%" },
                    ].map((step, i) => (
                      <div key={i} className="text-center" style={{ width: step.width, transition: "all 0.3s" }}>
                        <div className="rounded-xl py-3 px-4 flex items-center justify-between" style={{ background: step.color + "12", border: `1px solid ${step.color}25` }}>
                          <span className="text-[11px] font-semibold" style={{ color: step.color }}>{step.label}</span>
                          <span className="text-lg font-bold font-mono" style={{ color: step.color }}>{step.value}</span>
                        </div>
                        {i < 4 && <div className="text-[16px] my-1" style={{ color: "rgba(255,255,255,.15)" }}>▼</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* User Ratings */}
                <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)" }}>
                  <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <h2 className="text-sm font-bold text-white">⭐ User Ratings</h2>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>Scan quality feedback from users</p>
                  </div>
                  <div className="p-4">
                    {!ratingsData || ratingsData.total === 0 ? (
                      <div className="text-center py-8">
                        <div className="text-2xl mb-2">⭐</div>
                        <div className="text-sm" style={{ color: "rgba(255,255,255,.3)" }}>No ratings yet</div>
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row gap-6">
                        {/* Average Score */}
                        <div className="flex flex-col items-center justify-center px-6">
                          <div className="text-4xl font-bold font-mono" style={{ color: "#f0b90b" }}>{ratingsData.average}</div>
                          <div className="flex gap-0.5 mt-1">
                            {[1,2,3,4,5].map(s => (
                              <span key={s} className="text-sm" style={{ color: s <= Math.round(ratingsData.average) ? "#f0b90b" : "rgba(255,255,255,.15)" }}>★</span>
                            ))}
                          </div>
                          <div className="text-[10px] font-mono mt-1" style={{ color: "rgba(255,255,255,.3)" }}>{ratingsData.total} total ratings</div>
                        </div>
                        {/* Distribution Bars */}
                        <div className="flex-1 space-y-1.5">
                          {[5,4,3,2,1].map(star => {
                            const count = ratingsData.distribution?.find((d: { stars: number; count: number }) => d.stars === star)?.count || 0;
                            const pct = ratingsData.total > 0 ? Math.round((count / ratingsData.total) * 100) : 0;
                            return (
                              <div key={star} className="flex items-center gap-2">
                                <span className="text-[11px] font-mono w-4 text-right" style={{ color: "rgba(255,255,255,.4)" }}>{star}</span>
                                <span className="text-[10px]" style={{ color: "#f0b90b" }}>★</span>
                                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: "rgba(255,255,255,.04)" }}>
                                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: star >= 4 ? "#00e5a0" : star === 3 ? "#f0b90b" : "#ff4d6a" }} />
                                </div>
                                <span className="text-[10px] font-mono font-bold w-8 text-right" style={{ color: "rgba(255,255,255,.5)" }}>{count}</span>
                                <span className="text-[9px] font-mono w-8" style={{ color: "rgba(255,255,255,.2)" }}>{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Events */}
                <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
                  <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <h2 className="text-sm font-bold text-white">Recent Events</h2>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>Last 50 tracked actions</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                          {["Time", "Event", "Source", "Visitor"].map((h) => (
                            <th key={h} className="text-left px-4 py-3 font-mono font-semibold text-[10px] tracking-wider" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(funnelData.recent || []).length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-12 text-center"><div className="text-2xl mb-2">📊</div><div className="text-sm" style={{ color: "rgba(255,255,255,.3)" }}>No events tracked yet</div></td></tr>
                        ) : (funnelData.recent || []).map((e: { id: string; created_at: string; event_type: string; source: string; visitor_id: string }) => {
                          const evColor = e.event_type === "signup_click" ? "#00e5a0" : e.event_type === "broker_click" ? "#f0b90b" : e.event_type === "broker_popup_dismissed" ? "#ff4d6a" : e.event_type === "apk_download" ? "#3ddc84" : "#4da0ff";
                          return (
                            <tr key={e.id} className="hover:bg-white/[.02]" style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                              <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: "rgba(255,255,255,.35)" }}>{fmtDate(e.created_at)}</td>
                              <td className="px-4 py-2.5"><span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: evColor + "12", color: evColor }}>{e.event_type}</span></td>
                              <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: "rgba(255,255,255,.45)" }}>{e.source || "—"}</td>
                              <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: "rgba(255,255,255,.25)" }}>{e.visitor_id ? e.visitor_id.slice(0, 8) + "…" : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── CHAT TAB ── */}
        {tab === "chat" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Thread list */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="text-sm font-bold text-white mb-3">Conversations</div>
              {chatThreads.length === 0 && <div className="text-xs" style={{ color: "rgba(255,255,255,.3)" }}>No chats yet</div>}
              <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto">
                {chatThreads.map((t: any) => (
                  <button key={t.visitor_id} onClick={() => setChatActive(t.visitor_id)}
                    className="text-left px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: chatActive === t.visitor_id ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.02)",
                      border: `1px solid ${chatActive === t.visitor_id ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.04)"}`,
                    }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold text-white">{t.name || "Visitor"}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                        background: t.status === "waiting" ? "rgba(255,77,106,.1)" : "rgba(0,229,160,.1)",
                        color: t.status === "waiting" ? "#ff4d6a" : "#00e5a0",
                      }}>{t.status}</span>
                    </div>
                    <div className="text-[10px] truncate" style={{ color: "rgba(255,255,255,.35)" }}>{t.email || "No email"}</div>
                    <div className="text-[10px] truncate mt-0.5" style={{ color: "rgba(255,255,255,.25)" }}>{t.last_message}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat messages */}
            <div className="md:col-span-2 rounded-2xl flex flex-col" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", minHeight: 400 }}>
              {!chatActive ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-xs" style={{ color: "rgba(255,255,255,.2)" }}>Select a conversation</div>
                </div>
              ) : (
                <>
                  <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    <div className="text-sm font-bold text-white">{chatThreads.find((t: any) => t.visitor_id === chatActive)?.name || "Visitor"}</div>
                    <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{chatThreads.find((t: any) => t.visitor_id === chatActive)?.email || "No email"}</div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2" style={{ maxHeight: 350 }}>
                    {chatMessages.map((m: any, i: number) => (
                      <div key={i} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[75%] px-3 py-2 rounded-xl text-xs" style={{
                          background: m.sender === "admin" ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.04)",
                          color: m.sender === "admin" ? "#00e5a0" : "rgba(255,255,255,.6)",
                          borderBottomRightRadius: m.sender === "admin" ? 4 : 12,
                          borderBottomLeftRadius: m.sender === "visitor" ? 4 : 12,
                        }}>
                          {m.message}
                          <div className="text-[8px] mt-1" style={{ color: "rgba(255,255,255,.2)" }}>
                            {m.created_at ? new Date(m.created_at).toLocaleTimeString() : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    <input value={chatReply} onChange={(e) => setChatReply(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendChatReply()}
                      placeholder="Type reply..." className="flex-1 px-3 py-2.5 rounded-xl text-xs outline-none"
                      style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#fff" }} />
                    <button onClick={sendChatReply} disabled={chatSending || !chatReply.trim()}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                      style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f", border: "none", opacity: chatSending ? 0.5 : 1 }}>
                      Send
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ AFFILIATES TAB ═══ */}
        {tab === "affiliates" && (
          <div className="flex flex-col gap-4">
            {affData?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l: "AFFILIATES", v: affData.stats.totalAffiliates, c: "#4da0ff" },
                  { l: "TOTAL EARNED", v: `R${(affData.stats.totalEarned / 100).toFixed(2)}`, c: "#00e5a0" },
                  { l: "OUTSTANDING", v: `R${(affData.stats.totalOutstanding / 100).toFixed(2)}`, c: "#f0b90b" },
                  { l: "TOTAL PAID", v: `R${(affData.stats.totalPaid / 100).toFixed(2)}`, c: "#a855f7" },
                  { l: "TOTAL CLICKS", v: affData.stats.totalClicks, c: "#4da0ff" },
                  { l: "SIGNUPS", v: affData.stats.totalSignups, c: "#00e5a0" },
                  { l: "CONVERSIONS", v: affData.stats.totalConversions, c: "#f0b90b" },
                  { l: "CONV. RATE", v: `${affData.stats.conversionRate}%`, c: "#ff4d6a" },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl p-3" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
                    <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,.3)" }}>{s.l}</div>
                    <div className="text-lg font-extrabold" style={{ color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Broadcast to All Affiliates */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#12131a", border: "1px solid rgba(77,160,255,.1)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="text-xs font-bold" style={{ color: "#4da0ff" }}>📢 Broadcast to All Affiliates</span>
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{affData?.stats?.activeAffiliates || 0} active</span>
              </div>
              <div className="px-4 py-3 flex gap-2">
                <input type="text" placeholder="Type broadcast message for all affiliates..."
                  className="flex-1 px-3 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#fff" }}
                  id="affBroadcastInput"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") document.getElementById("affBroadcastBtn")?.click();
                  }}
                />
                <button id="affBroadcastBtn" onClick={async () => {
                  const input = document.getElementById("affBroadcastInput") as HTMLInputElement;
                  const msg = input?.value?.trim();
                  if (!msg) return;
                  if (!confirm(`Send to all ${affData?.stats?.activeAffiliates || 0} active affiliates?\n\n"${msg}"`)) return;
                  try {
                    const res = await fetch("/api/admin/affiliates", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "broadcast_affiliates", message: msg }),
                    });
                    const data = await res.json();
                    if (data.success) { showToast(`📢 Broadcast sent to ${data.sent} affiliates`); input.value = ""; loadAffChatConvos(); }
                    else showToast(data.error || "Failed", "error");
                  } catch { showToast("Broadcast failed", "error"); }
                }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg,#4da0ff,#2d7dd2)", color: "#fff", border: "none" }}>
                  📢 Send All
                </button>
              </div>
            </div>

            {/* Affiliates Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="text-xs font-bold text-white">All Affiliates</span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  {["Affiliate", "Code", "Plan", "Credits", "Rate", "Clicks", "Signups", "Conv.", "Earned", "Balance", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-mono uppercase text-[9px] whitespace-nowrap" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(!affData?.affiliates || affData.affiliates.length === 0) ? (
                    <tr><td colSpan={12} className="px-4 py-8 text-center" style={{ color: "rgba(255,255,255,.3)" }}>No affiliates yet</td></tr>
                  ) : affData.affiliates.map((a: any, i: number) => {
                    const p = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
                    return (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.02)" }}>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-white">{p?.full_name || "—"}</div>
                        <div className="text-[10px]" style={{ color: "rgba(255,255,255,.3)" }}>{p?.email}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold" style={{ color: "#00e5a0" }}>{a.ref_code}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{
                          background: p?.subscription_status === "active" ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.04)",
                          color: p?.subscription_status === "active" ? "#00e5a0" : "rgba(255,255,255,.35)",
                        }}>{p?.plan_id || "free"}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold" style={{ color: (p?.credits_balance || 0) > 0 ? "#4da0ff" : "rgba(255,255,255,.2)" }}>{p?.credits_balance || 0}</td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{Math.round(a.commission_rate * 100)}%</td>
                      <td className="px-3 py-2.5 font-mono text-white">{a.total_clicks}</td>
                      <td className="px-3 py-2.5 font-mono text-white">{a.total_signups}</td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: "#00e5a0" }}>{a.total_conversions}</td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: "#4da0ff" }}>R{(a.total_earned_cents / 100).toFixed(0)}</td>
                      <td className="px-3 py-2.5 font-mono font-bold" style={{ color: "#f0b90b" }}>R{((a.total_earned_cents - a.total_paid_cents) / 100).toFixed(0)}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{
                          background: a.status === "active" ? "rgba(0,229,160,.1)" : "rgba(255,77,106,.1)",
                          color: a.status === "active" ? "#00e5a0" : "#ff4d6a",
                        }}>{a.status}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {/* Message button — opens chat to this affiliate */}
                          <button onClick={() => { setAffChatActive(a.id); loadAffChatMessages(a.id); }}
                            className="text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
                            style={{ background: "rgba(77,160,255,.1)", border: "none", color: "#4da0ff" }}
                            title="Open chat">💬</button>
                          {/* Credit button */}
                          <button onClick={async () => {
                            const credits = prompt(`Give scan credits to ${p?.full_name || p?.email}:\n\nCurrent balance: ${p?.credits_balance || 0}\nEnter amount (1-100):`);
                            if (!credits) return;
                            const reason = prompt("Reason (optional):") || "Affiliate marketing reward";
                            try {
                              const res = await fetch("/api/admin/affiliates", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "credit_affiliate", affiliateId: a.id, credits, reason }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                showToast(`🎁 ${credits} credits → ${p?.full_name || "Affiliate"} (new bal: ${data.newBalance})`);
                                const r = await fetch("/api/admin/affiliates?tab=overview").then(r => r.json());
                                setAffData(r);
                              } else showToast(data.error || "Failed", "error");
                            } catch { showToast("Credit failed", "error"); }
                          }}
                            className="text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
                            style={{ background: "rgba(0,229,160,.1)", border: "none", color: "#00e5a0" }}
                            title="Give credits">🎁</button>
                          {/* Suspend/Activate */}
                          <button onClick={async () => {
                            const act = a.status === "active" ? "suspend_affiliate" : "activate_affiliate";
                            await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: act, affiliateId: a.id }) });
                            const r = await fetch("/api/admin/affiliates?tab=overview").then(r => r.json());
                            setAffData(r);
                          }} className="text-[9px] font-bold px-2 py-1 rounded cursor-pointer"
                            style={{ background: a.status === "active" ? "rgba(255,77,106,.1)" : "rgba(0,229,160,.1)", border: "none", color: a.status === "active" ? "#ff4d6a" : "#00e5a0" }}>
                            {a.status === "active" ? "⏸" : "▶"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {/* Pending Payouts */}
            {affPayouts.filter((p: any) => p.status === "pending").length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ background: "#12131a", border: "1px solid rgba(240,185,11,.1)" }}>
                <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span className="text-xs font-bold" style={{ color: "#f0b90b" }}>⚡ Pending Payouts — Action Required</span>
                </div>
                <table className="w-full text-xs">
                  <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    {["Affiliate", "Amount", "Bank", "Account", "Reference", "Requested", "Actions"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-mono uppercase text-[9px]" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {affPayouts.filter((p: any) => p.status === "pending").map((p: any, i: number) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.02)" }}>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-white">{p.affiliates?.profiles?.full_name || "—"}</div>
                          <div className="text-[10px]" style={{ color: "rgba(255,255,255,.3)" }}>{p.affiliates?.ref_code}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold" style={{ color: "#00e5a0" }}>R{(p.amount_cents / 100).toFixed(2)}</td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{p.bank_name || "—"}</td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{p.account_number || "—"}</td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{p.reference}</td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{new Date(p.requested_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2.5 flex gap-1">
                          <button onClick={async () => {
                            await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_payout", payoutId: p.id }) });
                            showToast("Payout approved");
                            const r = await fetch("/api/admin/affiliates?tab=payouts").then(r => r.json());
                            setAffPayouts(r.payouts || []);
                            const o = await fetch("/api/admin/affiliates?tab=overview").then(r => r.json());
                            setAffData(o);
                          }} className="text-[10px] font-bold px-2 py-1 rounded cursor-pointer"
                            style={{ background: "rgba(0,229,160,.15)", border: "none", color: "#00e5a0" }}>
                            ✓ Approve
                          </button>
                          <button onClick={async () => {
                            await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reject_payout", payoutId: p.id, reason: "Rejected" }) });
                            showToast("Payout rejected");
                            const r = await fetch("/api/admin/affiliates?tab=payouts").then(r => r.json());
                            setAffPayouts(r.payouts || []);
                          }} className="text-[10px] font-bold px-2 py-1 rounded cursor-pointer"
                            style={{ background: "rgba(255,77,106,.1)", border: "none", color: "#ff4d6a" }}>
                            ✗ Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Affiliate Chat */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#12131a", border: "1px solid rgba(77,160,255,.1)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span className="text-xs font-bold" style={{ color: "#4da0ff" }}>💬 Affiliate Messages</span>
                {affChatConvos.reduce((sum: number, c: any) => sum + c.unread_count, 0) > 0 && (
                  <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,77,106,.15)", color: "#ff4d6a" }}>
                    {affChatConvos.reduce((sum: number, c: any) => sum + c.unread_count, 0)} unread
                  </span>
                )}
              </div>
              <div className="flex" style={{ height: 420 }}>
                {/* Conversations List */}
                <div className="overflow-y-auto" style={{ width: 240, borderRight: "1px solid rgba(255,255,255,.04)", scrollbarWidth: "thin" }}>
                  {affChatConvos.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[10px]" style={{ color: "rgba(255,255,255,.3)" }}>No affiliate messages yet</div>
                  ) : affChatConvos.map((c: any) => (
                    <button key={c.affiliate_id} onClick={() => { setAffChatActive(c.affiliate_id); loadAffChatMessages(c.affiliate_id); }}
                      className="w-full text-left px-3 py-3 cursor-pointer"
                      style={{
                        background: affChatActive === c.affiliate_id ? "rgba(77,160,255,.06)" : "transparent",
                        border: "none", borderBottom: "1px solid rgba(255,255,255,.03)", color: "#fff",
                      }}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold truncate" style={{ maxWidth: 160 }}>{c.full_name || c.email}</div>
                        {c.unread_count > 0 && (
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={{ background: "#ff4d6a", color: "#fff" }}>{c.unread_count}</span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono truncate mt-0.5" style={{ color: "rgba(255,255,255,.3)" }}>
                        {c.last_message?.message?.substring(0, 40)}{(c.last_message?.message?.length || 0) > 40 ? "..." : ""}
                      </div>
                      <div className="text-[9px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.2)" }}>
                        {c.ref_code} · {new Date(c.last_message?.created_at).toLocaleDateString("en-ZA")}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Chat Messages */}
                <div className="flex-1 flex flex-col">
                  {!affChatActive ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-2xl mb-2">💬</div>
                        <div className="text-xs" style={{ color: "rgba(255,255,255,.3)" }}>Select a conversation</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin" }}>
                        {affChatMessages.map((m: any) => (
                          <div key={m.id} className={`flex mb-3 ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                            <div className="max-w-[75%] rounded-xl px-3 py-2" style={{
                              background: m.sender_role === "admin" ? "rgba(77,160,255,.1)" : "rgba(255,255,255,.05)",
                              border: `1px solid ${m.sender_role === "admin" ? "rgba(77,160,255,.15)" : "rgba(255,255,255,.04)"}`,
                            }}>
                              <div className="text-[10px] font-mono mb-0.5" style={{ color: m.sender_role === "admin" ? "#4da0ff" : "#00e5a0" }}>
                                {m.sender_role === "admin" ? "You (Admin)" : "Affiliate"}
                              </div>
                              <div className="text-xs" style={{ color: "rgba(255,255,255,.75)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.message}</div>
                              <div className="text-[9px] font-mono mt-1" style={{ color: "rgba(255,255,255,.2)" }}>
                                {new Date(m.created_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div ref={affChatEndRef} />
                      </div>
                      <div className="px-3 py-3 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                        <input type="text" value={affChatReply}
                          onChange={(e) => setAffChatReply(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAffChatReply()}
                          placeholder="Reply to affiliate..."
                          className="flex-1 px-3 py-2.5 rounded-xl text-xs"
                          style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#fff", outline: "none" }} />
                        <button onClick={sendAffChatReply} disabled={affChatSending || !affChatReply.trim()}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                          style={{ background: affChatReply.trim() ? "linear-gradient(135deg,#4da0ff,#2d7dd2)" : "rgba(255,255,255,.04)", color: affChatReply.trim() ? "#fff" : "rgba(255,255,255,.2)", border: "none" }}>
                          {affChatSending ? "..." : "Send"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TESTS TAB — Trading Terminal ═══ */}
        {tab === "tests" && (
          <div className="space-y-4">
            {/* AI Signal Engine — DISABLED to save API costs */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📡</span>
                  <span className="text-sm font-bold text-white">AI Signal Engine</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: "rgba(255,77,106,.1)", color: "#ff4d6a" }}>API DISABLED</span>
              </div>
              <p className="text-[11px] mt-2" style={{ color: "rgba(255,255,255,.3)" }}>Signal scanning disabled to save API costs. Use dashboard Signals tab instead.</p>
            </div>

            {/* AI Voice Assistant — DISABLED to save API costs */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎙️</span>
                  <span className="text-sm font-bold text-white">AI Voice Assistant</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: "rgba(255,77,106,.1)", color: "#ff4d6a" }}>API DISABLED</span>
              </div>
              <p className="text-[11px] mt-2" style={{ color: "rgba(255,255,255,.3)" }}>Voice assistant disabled to save API costs.</p>
            </div>

            {/* ── MT5 Trade Executor — Headless Execution ── */}
            <MT5TradeExecutor />

            {/* ── Trading Terminal — Charts, Account, Watchlist ── */}
            <TradingTerminal />

            {/* ── Symbol Monitor — Live Prices ── */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
              <SymbolMonitor />
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(12px)" }} onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-2xl p-6 mx-4" onClick={(e) => e.stopPropagation()} style={{ background: "#111218", border: "1px solid rgba(255,255,255,.08)", animation: "scaleIn 0.2s ease" }}>
            <h3 className="text-lg font-bold text-white mb-0.5">
              {modal.type === "credits" ? "Allocate Credits" : modal.type === "plan" ? "Change Plan" : modal.type === "trial" ? "Gift Pro Trial" : modal.type === "block" ? (modal.user.is_blocked ? "Unblock User" : "Block User") : modal.type === "email" ? "Send Email" : modal.type === "delete" ? "Delete User" : "Change Role"}
            </h3>
            <p className="text-[10px] font-mono mb-4" style={{ color: "rgba(255,255,255,.35)" }}>
              {modal.user.email} — {modal.user.full_name || "No name"}
            </p>

            {/* Credits Modal */}
            {modal.type === "credits" && (
              <>
                <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>AMOUNT (+ grant, − revoke)</label>
                <input type="number" value={modalValue} onChange={(e) => setModalValue(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none mb-3 font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>REASON (optional)</label>
                <input type="text" value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} placeholder="e.g. Bonus for feedback"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none mb-3 font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <p className="text-[10px] font-mono mb-4" style={{ color: "rgba(255,255,255,.25)" }}>
                  Current: {modal.user.credits_balance} → New: {modal.user.credits_balance + (parseInt(modalValue) || 0)}
                </p>
              </>
            )}

            {/* Plan Modal */}
            {modal.type === "plan" && (
              <div className="flex flex-col gap-2 mb-4">
                {[{ id: "free", name: "Free", price: "R0" }, { id: "pro", name: "Pro", price: "R149/mo" }, { id: "premium", name: "Premium", price: "R299/mo" }].map((p) => (
                  <button key={p.id} onClick={() => setModalValue(p.id)} className="flex items-center justify-between px-4 py-3 rounded-xl text-sm cursor-pointer transition-all"
                    style={{ background: modalValue === p.id ? "rgba(0,229,160,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${modalValue === p.id ? "rgba(0,229,160,.25)" : "rgba(255,255,255,.06)"}`, color: modalValue === p.id ? "#00e5a0" : "rgba(255,255,255,.5)" }}>
                    <span className="font-semibold">{p.name}</span><span className="font-mono text-xs">{p.price}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Role Modal */}
            {modal.type === "role" && (
              <div className="flex gap-2 mb-4">
                {["user", "admin"].map((r) => (
                  <button key={r} onClick={() => setModalValue(r)} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold capitalize cursor-pointer"
                    style={{ background: modalValue === r ? (r === "admin" ? "rgba(255,77,106,.08)" : "rgba(77,160,255,.08)") : "rgba(255,255,255,.03)", border: `1px solid ${modalValue === r ? (r === "admin" ? "rgba(255,77,106,.25)" : "rgba(77,160,255,.25)") : "rgba(255,255,255,.06)"}`, color: modalValue === r ? (r === "admin" ? "#ff4d6a" : "#4da0ff") : "rgba(255,255,255,.4)" }}>{r}</button>
                ))}
              </div>
            )}

            {/* Block Modal */}
            {modal.type === "block" && (
              <>
                {modal.user.is_blocked ? (
                  <div className="rounded-lg p-3 mb-4" style={{ background: "rgba(0,229,160,.06)", border: "1px solid rgba(0,229,160,.12)" }}>
                    <div className="text-xs font-semibold text-white mb-1">Unblock this user?</div>
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,.4)" }}>They will be able to log in and use the platform again.</div>
                    {modal.user.blocked_reason && <div className="text-[10px] font-mono mt-2" style={{ color: "rgba(255,255,255,.3)" }}>Blocked reason: {modal.user.blocked_reason}</div>}
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.12)" }}>
                      <div className="text-xs font-semibold text-white mb-1">⚠️ Block this user?</div>
                      <div className="text-[10px]" style={{ color: "rgba(255,255,255,.4)" }}>They will be signed out and unable to access the platform.</div>
                    </div>
                    <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>REASON (optional)</label>
                    <input type="text" value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} placeholder="e.g. Abuse, spam, etc."
                      className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none mb-4 font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                  </>
                )}
              </>
            )}

            {/* Trial Modal */}
            {modal.type === "trial" && (
              <>
                <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(168,85,247,.06)", border: "1px solid rgba(168,85,247,.12)" }}>
                  <div className="text-xs font-semibold text-white mb-1">🎁 Gift a free Pro trial</div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,.4)" }}>Upgrade to Pro for the specified days — no payment required.</div>
                </div>
                <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>DURATION (DAYS)</label>
                <div className="flex gap-2 mb-4">
                  {["3", "7", "14", "30"].map((d) => (
                    <button key={d} onClick={() => setModalValue(d)} className="flex-1 px-3 py-2.5 rounded-xl text-sm font-mono font-bold cursor-pointer"
                      style={{ background: modalValue === d ? "rgba(168,85,247,.12)" : "rgba(255,255,255,.03)", border: `1px solid ${modalValue === d ? "rgba(168,85,247,.25)" : "rgba(255,255,255,.06)"}`, color: modalValue === d ? "#a855f7" : "rgba(255,255,255,.35)" }}>{d}d</button>
                  ))}
                </div>
              </>
            )}

            {/* Email Modal */}
            {modal.type === "email" && (
              <>
                <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>SUBJECT</label>
                <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject..."
                  className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none mb-3 font-mono" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <label className="block text-[10px] font-mono mb-1.5 tracking-wider" style={{ color: "rgba(255,255,255,.35)" }}>MESSAGE</label>
                <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Write your message..." rows={4}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none mb-4 font-mono resize-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
              </>
            )}

            {/* Delete Modal */}
            {modal.type === "delete" && (
              <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(255,77,106,.06)", border: "1px solid rgba(255,77,106,.15)" }}>
                <div className="text-sm font-bold mb-2" style={{ color: "#ff4d6a" }}>⚠️ This action is permanent</div>
                <p className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>
                  This will permanently delete <strong className="text-white">{modal.user.email}</strong> and all their data including scans, payments, referrals, and affiliate records. This cannot be undone.
                </p>
              </div>
            )}

            {/* Modal Buttons */}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.45)" }}>Cancel</button>
              <button onClick={handleAction} disabled={actionLoading} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
                style={{
                  background: (modal.type === "block" && !modal.user.is_blocked) || modal.type === "delete" ? "linear-gradient(135deg,#ff4d6a,#e6364f)" : "linear-gradient(135deg,#00e5a0,#00b87d)",
                  color: modal.type === "delete" ? "#fff" : "#0a0b0f", opacity: actionLoading ? 0.5 : 1,
                }}>
                {actionLoading ? "Processing..." : modal.type === "block" ? (modal.user.is_blocked ? "Unblock" : "Block User") : modal.type === "email" ? "Send Email" : modal.type === "delete" ? "Delete Permanently" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Small components ─── */
function Btn({ color, label, onClick }: { color: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer transition-all hover:opacity-80"
      style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>{label}</button>
  );
}

function PgBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} className="px-3 py-1 rounded text-[10px] font-mono cursor-pointer"
      style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.4)", opacity: disabled ? 0.3 : 1 }}>{label}</button>
  );
}

function MetricBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{value} <span style={{ color: "rgba(255,255,255,.2)" }}>/ {max}</span></span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
