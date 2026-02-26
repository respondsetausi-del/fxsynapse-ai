"use client";
import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Affiliate {
  id: string; ref_code: string; commission_rate: number;
  total_earned_cents: number; total_paid_cents: number;
  total_clicks: number; total_signups: number; total_conversions: number;
  status: string; bank_name: string | null; account_number: string | null; account_holder: string | null;
  created_at: string;
}
interface Referral {
  id: string; status: string; signed_up_at: string; first_payment_at: string | null;
  profiles: { email: string; full_name: string; plan_id: string; subscription_status: string } | null;
}
interface Earning {
  id: string; amount_cents: number; commission_rate: number; description: string;
  status: string; created_at: string;
}
interface Payout {
  id: string; amount_cents: number; status: string; reference: string;
  requested_at: string; paid_at: string | null;
}

export default function AffiliatePage() {
  const [loading, setLoading] = useState(true);
  const [isAffiliate, setIsAffiliate] = useState(false);
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [balance, setBalance] = useState(0);
  const [tab, setTab] = useState<"overview" | "referrals" | "earnings" | "payouts" | "settings">("overview");
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName: "", accountNumber: "", accountHolder: "" });
  const [savingBank, setSavingBank] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [toast, setToast] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; sender_role: string; message: string; created_at: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const loadChat = async () => {
    try {
      const res = await fetch("/api/affiliate/chat");
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages || []);
        if (!chatOpen) setChatUnread(data.unread || 0);
        else setChatUnread(0);
      }
    } catch { /* silent */ }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch("/api/affiliate/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, data.message]);
        setChatInput("");
      }
    } catch { /* silent */ }
    setChatSending(false);
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatOpen]);

  // Load chat when affiliate dashboard loads, poll every 15s
  useEffect(() => {
    if (!isAffiliate) return;
    loadChat();
    const interval = setInterval(loadChat, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAffiliate, chatOpen]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const res = await fetch("/api/affiliate");
      if (res.ok) {
        const data = await res.json();
        setIsAffiliate(data.isAffiliate);
        if (data.isAffiliate) {
          setAffiliate(data.affiliate);
          setReferrals(data.referrals || []);
          setEarnings(data.earnings || []);
          setPayouts(data.payouts || []);
          setBalance(data.balance || 0);
          if (data.affiliate.bank_name) {
            setBankForm({
              bankName: data.affiliate.bank_name || "",
              accountNumber: data.affiliate.account_number || "",
              accountHolder: data.affiliate.account_holder || "",
            });
          }
        }
      }
      setLoading(false);
    })();
  }, [supabase, router]);

  const joinProgram = async () => {
    setJoining(true);
    const res = await fetch("/api/affiliate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join" }),
    });
    if (res.ok) {
      const data = await res.json();
      setIsAffiliate(true);
      setAffiliate(data.affiliate);
      showToast("Welcome to the affiliate program!");
    }
    setJoining(false);
  };

  const copyLink = () => {
    if (!affiliate) return;
    navigator.clipboard.writeText(`${window.location.origin}/?ref=${affiliate.ref_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveBankDetails = async () => {
    setSavingBank(true);
    const res = await fetch("/api/affiliate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_bank", ...bankForm }),
    });
    if (res.ok) showToast("Bank details saved");
    setSavingBank(false);
  };

  const requestPayout = async () => {
    setRequestingPayout(true);
    const res = await fetch("/api/affiliate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_payout" }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Payout of R${(data.amount / 100).toFixed(2)} requested!`);
      // Refresh data
      const refreshRes = await fetch("/api/affiliate");
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setAffiliate(refreshData.affiliate);
        setPayouts(refreshData.payouts || []);
        setBalance(refreshData.balance || 0);
      }
    } else {
      showToast(data.error || "Payout failed");
    }
    setRequestingPayout(false);
  };

  const R = (cents: number) => `R${(cents / 100).toFixed(2)}`;
  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0b0f" }}>
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: "#00e5a0", borderTopColor: "transparent" }} />
        <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Loading affiliate dashboard...</p>
      </div>
    </div>
  );

  if (!isAffiliate) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0b0f" }}>
      <div className="max-w-md w-full mx-4 rounded-2xl p-8 text-center" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.06)" }}>
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(0,229,160,.1)", border: "2px solid rgba(0,229,160,.2)" }}>
          <span className="text-3xl">💰</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-2">Affiliate Program</h1>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,.45)" }}>
          Earn 20% recurring commission on every user you refer to FXSynapse AI. Share your unique link, earn when they pay.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[{ n: "Share", d: "Your unique link", i: "🔗" }, { n: "They Pay", d: "Any plan", i: "💳" }, { n: "You Earn", d: "20% recurring", i: "💰" }].map((s, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="text-xl mb-1">{s.i}</div>
              <div className="text-xs font-bold text-white">{s.n}</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,.3)" }}>{s.d}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-4 mb-6 text-left" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }}>
          <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "#00e5a0" }}>EARNING POTENTIAL</div>
          {[{ p: "Starter (R79)", e: "R15.80/mo" }, { p: "Pro (R149)", e: "R29.80/mo" }, { p: "Premium (R299)", e: "R59.80/mo" }].map((r, i) => (
            <div key={i} className="flex justify-between text-xs py-1" style={{ borderBottom: i < 2 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
              <span style={{ color: "rgba(255,255,255,.5)" }}>Per {r.p} referral</span>
              <span className="font-bold" style={{ color: "#00e5a0" }}>{r.e}</span>
            </div>
          ))}
          <div className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,.25)" }}>10 Pro referrals = R198/month passive income</div>
        </div>
        <button onClick={joinProgram} disabled={joining}
          className="w-full py-3.5 rounded-xl text-sm font-bold cursor-pointer"
          style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f", border: "none", opacity: joining ? 0.6 : 1 }}>
          {joining ? "Joining..." : "Join Affiliate Program"}
        </button>
        <Link href="/dashboard" className="block mt-3 text-xs no-underline" style={{ color: "rgba(255,255,255,.3)" }}>← Back to Dashboard</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#0a0b0f", color: "#fff" }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-bold animate-fadeUp" style={{ background: "#00e5a0", color: "#0a0b0f" }}>{toast}</div>}

      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold">💰 Affiliate Dashboard</h1>
            <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>REF CODE: {affiliate?.ref_code}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copyLink} className="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
              style={{ background: copied ? "rgba(0,229,160,.2)" : "linear-gradient(135deg,#00e5a0,#00b87d)", color: copied ? "#00e5a0" : "#0a0b0f", border: "none" }}>
              {copied ? "✓ Copied!" : "📋 Copy Link"}
            </button>
            <Link href="/dashboard" className="px-4 py-2 rounded-lg text-xs font-semibold no-underline"
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.5)" }}>
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto" style={{ padding: "20px 24px" }}>
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { l: "Balance", v: R(balance), c: "#00e5a0" },
            { l: "Total Earned", v: R(affiliate?.total_earned_cents || 0), c: "#4da0ff" },
            { l: "Clicks", v: String(affiliate?.total_clicks || 0), c: "#f0b90b" },
            { l: "Signups", v: String(affiliate?.total_signups || 0), c: "#a855f7" },
            { l: "Conversions", v: String(affiliate?.total_conversions || 0), c: "#00e5a0" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-4" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,.3)" }}>{s.l}</div>
              <div className="text-xl font-extrabold" style={{ color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Ref Link Box */}
        <div className="rounded-xl p-4 mb-6 flex items-center gap-3" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }}>
          <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#00e5a0" }}>YOUR LINK</div>
          <div className="flex-1 font-mono text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(0,0,0,.3)", color: "rgba(255,255,255,.6)" }}>
            {typeof window !== "undefined" ? window.location.origin : ""}/?ref={affiliate?.ref_code}
          </div>
          <button onClick={copyLink} className="px-3 py-2 rounded-lg text-[10px] font-bold cursor-pointer"
            style={{ background: "#00e5a0", color: "#0a0b0f", border: "none" }}>
            {copied ? "✓" : "Copy"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          {(["overview", "referrals", "earnings", "payouts", "settings"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2.5 text-xs font-semibold capitalize cursor-pointer"
              style={{ background: "none", border: "none", color: tab === t ? "#00e5a0" : "rgba(255,255,255,.3)", borderBottom: tab === t ? "2px solid #00e5a0" : "2px solid transparent" }}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl p-4" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: "#4da0ff" }}>COMMISSION STRUCTURE</div>
              <div className="text-xs mb-2" style={{ color: "rgba(255,255,255,.5)" }}>You earn <span className="font-bold text-white">{Math.round((affiliate?.commission_rate || 0.20) * 100)}%</span> of every payment from your referrals.</div>
              {[{ p: "Starter R79", e: R(Math.round(7900 * (affiliate?.commission_rate || 0.20))) }, { p: "Pro R149", e: R(Math.round(14900 * (affiliate?.commission_rate || 0.20))) }, { p: "Premium R299", e: R(Math.round(114900 * (affiliate?.commission_rate || 0.20))) }].map((r, i) => (
                <div key={i} className="flex justify-between py-1.5 text-xs" style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                  <span style={{ color: "rgba(255,255,255,.4)" }}>{r.p}</span>
                  <span className="font-bold" style={{ color: "#00e5a0" }}>{r.e}/mo</span>
                </div>
              ))}
              <div className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,.2)" }}>Commission is recurring — you earn every month they stay subscribed.</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: "#f0b90b" }}>RECENT ACTIVITY</div>
              {earnings.length === 0 ? (
                <p className="text-xs" style={{ color: "rgba(255,255,255,.3)" }}>No earnings yet. Share your link to start earning!</p>
              ) : (
                earnings.slice(0, 5).map((e, i) => (
                  <div key={i} className="flex justify-between py-1.5 text-xs" style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                    <span style={{ color: "rgba(255,255,255,.4)" }}>{e.description}</span>
                    <span className="font-bold font-mono" style={{ color: "#00e5a0" }}>+{R(e.amount_cents)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "referrals" && (
          <div className="rounded-xl overflow-hidden" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
            <table className="w-full text-xs">
              <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                {["User", "Status", "Plan", "Signed Up", "First Payment"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-mono uppercase text-[9px]" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {referrals.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "rgba(255,255,255,.3)" }}>No referrals yet</td></tr>
                ) : referrals.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.02)" }}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{r.profiles?.full_name || "—"}</div>
                      <div className="text-[10px]" style={{ color: "rgba(255,255,255,.3)" }}>{r.profiles?.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{
                        background: r.status === "converted" ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.05)",
                        color: r.status === "converted" ? "#00e5a0" : "rgba(255,255,255,.4)",
                      }}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{r.profiles?.plan_id || "free"}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{timeAgo(r.signed_up_at)}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: r.first_payment_at ? "#00e5a0" : "rgba(255,255,255,.2)" }}>
                      {r.first_payment_at ? timeAgo(r.first_payment_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "earnings" && (
          <div className="rounded-xl overflow-hidden" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
            <table className="w-full text-xs">
              <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                {["Description", "Amount", "Rate", "Status", "Date"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-mono uppercase text-[9px]" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {earnings.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "rgba(255,255,255,.3)" }}>No earnings yet</td></tr>
                ) : earnings.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.02)" }}>
                    <td className="px-4 py-3" style={{ color: "rgba(255,255,255,.5)" }}>{e.description}</td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: "#00e5a0" }}>+{R(e.amount_cents)}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{Math.round(e.commission_rate * 100)}%</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{
                        background: e.status === "paid" ? "rgba(0,229,160,.1)" : e.status === "pending" ? "rgba(240,185,11,.1)" : "rgba(255,255,255,.05)",
                        color: e.status === "paid" ? "#00e5a0" : e.status === "pending" ? "#f0b90b" : "rgba(255,255,255,.4)",
                      }}>{e.status}</span>
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{timeAgo(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "payouts" && (
          <div>
            {balance >= 10000 && (
              <div className="rounded-xl p-4 mb-4 flex items-center justify-between" style={{ background: "rgba(0,229,160,.04)", border: "1px solid rgba(0,229,160,.1)" }}>
                <div>
                  <div className="text-xs font-bold text-white">Available for payout: <span style={{ color: "#00e5a0" }}>{R(balance)}</span></div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,.3)" }}>Minimum payout: R100</div>
                </div>
                <button onClick={requestPayout} disabled={requestingPayout || !affiliate?.bank_name}
                  className="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
                  style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f", border: "none", opacity: requestingPayout || !affiliate?.bank_name ? 0.5 : 1 }}>
                  {requestingPayout ? "Requesting..." : !affiliate?.bank_name ? "Add Bank First" : "Request Payout"}
                </button>
              </div>
            )}
            <div className="rounded-xl overflow-hidden" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
              <table className="w-full text-xs">
                <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  {["Amount", "Reference", "Status", "Requested", "Paid"].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-mono uppercase text-[9px]" style={{ color: "rgba(255,255,255,.3)" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {payouts.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "rgba(255,255,255,.3)" }}>No payouts yet</td></tr>
                  ) : payouts.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.02)" }}>
                      <td className="px-4 py-3 font-mono font-bold text-white">{R(p.amount_cents)}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{p.reference}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{
                          background: p.status === "completed" ? "rgba(0,229,160,.1)" : p.status === "pending" ? "rgba(240,185,11,.1)" : "rgba(255,77,106,.1)",
                          color: p.status === "completed" ? "#00e5a0" : p.status === "pending" ? "#f0b90b" : "#ff4d6a",
                        }}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.35)" }}>{timeAgo(p.requested_at)}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: p.paid_at ? "#00e5a0" : "rgba(255,255,255,.2)" }}>{p.paid_at ? timeAgo(p.paid_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="max-w-md">
            <div className="rounded-xl p-5" style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-4" style={{ color: "#4da0ff" }}>BANK DETAILS FOR PAYOUTS</div>
              {[
                { label: "Bank Name", key: "bankName" as const, placeholder: "e.g. FNB, Capitec, Standard Bank" },
                { label: "Account Number", key: "accountNumber" as const, placeholder: "Your account number" },
                { label: "Account Holder", key: "accountHolder" as const, placeholder: "Name on the account" },
              ].map((f) => (
                <div key={f.key} className="mb-3">
                  <label className="block text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,.3)" }}>{f.label}</label>
                  <input
                    type="text" value={bankForm[f.key]}
                    onChange={(e) => setBankForm({ ...bankForm, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 rounded-lg text-xs"
                    style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#fff", outline: "none" }}
                  />
                </div>
              ))}
              <button onClick={saveBankDetails} disabled={savingBank || !bankForm.bankName || !bankForm.accountNumber}
                className="w-full py-2.5 rounded-lg text-xs font-bold cursor-pointer mt-2"
                style={{ background: "linear-gradient(135deg,#4da0ff,#2d7dd2)", color: "#fff", border: "none", opacity: savingBank ? 0.6 : 1 }}>
                {savingBank ? "Saving..." : "Save Bank Details"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Chat Widget */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100 }}>
        {chatOpen && (
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{
            width: 360, height: 480, background: "#12131a", border: "1px solid rgba(255,255,255,.08)",
            boxShadow: "0 20px 60px rgba(0,0,0,.5)", marginBottom: 12,
          }}>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(0,229,160,.06)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <div>
                <div className="text-sm font-bold text-white">💬 Chat with Admin</div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>We typically reply within a few hours</div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-lg cursor-pointer"
                style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", lineHeight: 1 }}>✕</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin" }}>
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-2xl mb-2">👋</div>
                  <div className="text-xs font-semibold text-white mb-1">Welcome to affiliate support!</div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,.3)" }}>
                    Have questions about payouts, commissions, or promotions? Send us a message.
                  </div>
                </div>
              ) : (
                chatMessages.map((m) => (
                  <div key={m.id} className={`flex mb-3 ${m.sender_role === "affiliate" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[80%] rounded-xl px-3 py-2" style={{
                      background: m.sender_role === "affiliate" ? "rgba(0,229,160,.12)" : "rgba(255,255,255,.06)",
                      border: `1px solid ${m.sender_role === "affiliate" ? "rgba(0,229,160,.15)" : "rgba(255,255,255,.04)"}`,
                    }}>
                      <div className="text-[10px] font-mono mb-0.5" style={{
                        color: m.sender_role === "affiliate" ? "#00e5a0" : "#4da0ff",
                      }}>
                        {m.sender_role === "affiliate" ? "You" : "Admin"}
                      </div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,.75)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {m.message}
                      </div>
                      <div className="text-[9px] font-mono mt-1" style={{ color: "rgba(255,255,255,.2)" }}>
                        {new Date(m.created_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <input
                type="text" value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2.5 rounded-xl text-xs"
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "#fff", outline: "none" }}
              />
              <button onClick={sendChat} disabled={chatSending || !chatInput.trim()}
                className="px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                style={{ background: chatInput.trim() ? "linear-gradient(135deg,#00e5a0,#00b87d)" : "rgba(255,255,255,.04)", color: chatInput.trim() ? "#0a0b0f" : "rgba(255,255,255,.2)", border: "none" }}>
                {chatSending ? "..." : "Send"}
              </button>
            </div>
          </div>
        )}

        {/* Chat Toggle Button */}
        <button onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) { setChatUnread(0); loadChat(); } }}
          className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer shadow-lg"
          style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", boxShadow: "0 4px 20px rgba(0,229,160,.3)", marginLeft: "auto", display: "block" }}>
          <span className="text-2xl">{chatOpen ? "✕" : "💬"}</span>
          {chatUnread > 0 && !chatOpen && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: "#ff4d6a", color: "#fff" }}>
              {chatUnread}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
