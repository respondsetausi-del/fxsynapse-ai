"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Stats {
  totalUsers: number;
  scansToday: number;
  scansTotal: number;
  revenueMonth: number;
  planDistribution: Record<string, number>;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  plan_id: string;
  credits_balance: number;
  daily_scans_used: number;
  subscription_status: string;
  total_scans: number;
  created_at: string;
  plans: { name: string; price_cents: number };
}

interface PaymentRow {
  id: string;
  user_id: string;
  yoco_checkout_id: string;
  amount_cents: number;
  currency: string;
  type: string;
  plan_id: string;
  credits_amount: number;
  status: string;
  created_at: string;
  profiles: { email: string; full_name: string };
}

type Tab = "users" | "payments";

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("users");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [modal, setModal] = useState<{ user: UserRow; type: "credits" | "plan" | "role" } | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [modalDesc, setModalDesc] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    }
  }, [page, search]);

  const fetchPayments = useCallback(async () => {
    const res = await fetch(`/api/admin/payments?page=${paymentsPage}`);
    if (res.ok) {
      const data = await res.json();
      setPayments(data.payments);
      setPaymentsTotal(data.total);
    }
  }, [paymentsPage]);

  useEffect(() => { fetchStats(); fetchUsers(); setLoading(false); }, [fetchStats, fetchUsers]);
  useEffect(() => { if (tab === "payments") fetchPayments(); }, [tab, fetchPayments]);

  const handleAction = async () => {
    if (!modal) return;
    setActionLoading(true);
    try {
      let body: Record<string, unknown> = {};
      if (modal.type === "credits") {
        body = { action: "allocate_credits", userId: modal.user.id, amount: parseInt(modalValue), description: modalDesc };
      } else if (modal.type === "plan") {
        body = { action: "change_plan", userId: modal.user.id, planId: modalValue };
      } else if (modal.type === "role") {
        body = { action: "set_role", userId: modal.user.id, role: modalValue };
      }
      const res = await fetch("/api/admin/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setModal(null); setModalValue(""); setModalDesc(""); fetchUsers(); fetchStats(); }
    } catch {}
    setActionLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const fmt = (cents: number) => `R${(cents / 100).toFixed(2)}`;
  const fmtShort = (cents: number) => `R${(cents / 100).toFixed(0)}`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const S = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
      <div className="text-xs font-mono mb-1" style={{ color: "rgba(255,255,255,.35)", letterSpacing: "1px" }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: color || "#fff", fontFamily: "'Outfit',sans-serif" }}>{value}</div>
      {sub && <div className="text-xs mt-1 font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{sub}</div>}
    </div>
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0b0f" }}><div className="text-sm font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Loading...</div></div>;

  return (
    <div className="min-h-screen" style={{ background: "#0a0b0f" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <div>
            <span className="text-base font-bold text-white">FXSynapse AI</span>
            <span className="text-xs font-mono ml-2 px-2 py-0.5 rounded" style={{ background: "rgba(255,77,106,.15)", color: "#ff4d6a" }}>ADMIN</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard?scanner=true")} className="text-xs font-mono px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>
            ← Scanner
          </button>
          <button onClick={handleLogout} className="text-xs font-mono px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "rgba(255,77,106,.1)", border: "1px solid rgba(255,77,106,.15)", color: "#ff4d6a" }}>
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <S label="TOTAL USERS" value={stats.totalUsers} color="#4da0ff" />
            <S label="SCANS TODAY" value={stats.scansToday} color="#00e5a0" />
            <S label="TOTAL SCANS" value={stats.scansTotal} />
            <S label="REVENUE (MTD)" value={fmtShort(stats.revenueMonth)} sub={`Free: ${stats.planDistribution.free || 0} • Pro: ${stats.planDistribution.pro || 0} • Premium: ${stats.planDistribution.premium || 0}`} color="#f0b90b" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {([
            { id: "users" as Tab, label: "👥 Users", count: total },
            { id: "payments" as Tab, label: "💳 Payments", count: paymentsTotal },
          ]).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all"
              style={{
                background: tab === t.id ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.03)",
                border: `1px solid ${tab === t.id ? "rgba(0,229,160,.2)" : "rgba(255,255,255,.06)"}`,
                color: tab === t.id ? "#00e5a0" : "rgba(255,255,255,.4)",
              }}>
              {t.label} {t.count > 0 && <span className="ml-1 text-[10px] font-mono">({t.count})</span>}
            </button>
          ))}
        </div>

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <h2 className="text-sm font-bold text-white">Users</h2>
              <input type="text" placeholder="Search email or name..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-lg text-xs text-white outline-none w-64 font-mono"
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    {["User", "Plan", "Credits", "Daily Used", "Total Scans", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-mono font-semibold" style={{ color: "rgba(255,255,255,.35)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="transition-colors" style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                      <td className="px-4 py-3">
                        <div className="text-white font-semibold text-sm">{u.full_name || "—"}</div>
                        <div className="font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{u.email}</div>
                        {u.role === "admin" && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded mt-0.5 inline-block" style={{ background: "rgba(255,77,106,.15)", color: "#ff4d6a" }}>ADMIN</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-md text-[10px] font-mono font-bold" style={{
                          background: u.plan_id === "premium" ? "rgba(240,185,11,.12)" : u.plan_id === "pro" ? "rgba(77,160,255,.12)" : "rgba(255,255,255,.05)",
                          color: u.plan_id === "premium" ? "#f0b90b" : u.plan_id === "pro" ? "#4da0ff" : "rgba(255,255,255,.4)",
                        }}>
                          {u.plans?.name || u.plan_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-white">{u.credits_balance}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{u.daily_scans_used}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{u.total_scans}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono" style={{ color: u.subscription_status === "active" ? "#00e5a0" : "rgba(255,255,255,.3)" }}>
                          {u.subscription_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setModal({ user: u, type: "credits" }); setModalValue("10"); setModalDesc(""); }}
                            className="px-2 py-1 rounded text-[10px] font-mono cursor-pointer" style={{ background: "rgba(0,229,160,.1)", border: "1px solid rgba(0,229,160,.2)", color: "#00e5a0" }}>Credits</button>
                          <button onClick={() => { setModal({ user: u, type: "plan" }); setModalValue(u.plan_id); }}
                            className="px-2 py-1 rounded text-[10px] font-mono cursor-pointer" style={{ background: "rgba(77,160,255,.1)", border: "1px solid rgba(77,160,255,.2)", color: "#4da0ff" }}>Plan</button>
                          <button onClick={() => { setModal({ user: u, type: "role" }); setModalValue(u.role); }}
                            className="px-2 py-1 rounded text-[10px] font-mono cursor-pointer" style={{ background: "rgba(240,185,11,.1)", border: "1px solid rgba(240,185,11,.2)", color: "#f0b90b" }}>Role</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between p-4" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{total} users total</span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded text-xs font-mono cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)", opacity: page <= 1 ? 0.3 : 1 }}>Prev</button>
                <span className="px-3 py-1 text-xs font-mono" style={{ color: "rgba(255,255,255,.4)" }}>Page {page}</span>
                <button disabled={page * 20 >= total} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded text-xs font-mono cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)", opacity: page * 20 >= total ? 0.3 : 1 }}>Next</button>
              </div>
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {tab === "payments" && (
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <h2 className="text-sm font-bold text-white">Payments</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                    {["Date", "User", "Type", "Amount", "Plan/Credits", "Status", "Yoco ID"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-mono font-semibold" style={{ color: "rgba(255,255,255,.35)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="text-2xl mb-2">💳</div>
                        <div className="text-sm" style={{ color: "rgba(255,255,255,.3)" }}>No payments yet</div>
                      </td>
                    </tr>
                  ) : payments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                      <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.5)" }}>{formatDate(p.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="text-white font-semibold text-sm">{p.profiles?.full_name || "—"}</div>
                        <div className="font-mono" style={{ color: "rgba(255,255,255,.4)" }}>{p.profiles?.email || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-md text-[10px] font-mono font-bold" style={{
                          background: p.type === "subscription" ? "rgba(77,160,255,.12)" : "rgba(240,185,11,.12)",
                          color: p.type === "subscription" ? "#4da0ff" : "#f0b90b",
                        }}>
                          {p.type === "subscription" ? "Subscription" : "Credits"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-white">{fmt(p.amount_cents)}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: "rgba(255,255,255,.5)" }}>
                        {p.type === "subscription" ? (p.plan_id || "—") : `${p.credits_amount || 0} credits`}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{
                          background: p.status === "completed" ? "rgba(0,229,160,.1)" : p.status === "failed" ? "rgba(255,77,106,.1)" : "rgba(240,185,11,.1)",
                          color: p.status === "completed" ? "#00e5a0" : p.status === "failed" ? "#ff4d6a" : "#f0b90b",
                        }}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px]" style={{ color: "rgba(255,255,255,.25)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.yoco_checkout_id || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paymentsTotal > 0 && (
              <div className="flex items-center justify-between p-4" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,.3)" }}>{paymentsTotal} payments total</span>
                <div className="flex gap-1">
                  <button disabled={paymentsPage <= 1} onClick={() => setPaymentsPage(paymentsPage - 1)} className="px-3 py-1 rounded text-xs font-mono cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)", opacity: paymentsPage <= 1 ? 0.3 : 1 }}>Prev</button>
                  <span className="px-3 py-1 text-xs font-mono" style={{ color: "rgba(255,255,255,.4)" }}>Page {paymentsPage}</span>
                  <button disabled={paymentsPage * 20 >= paymentsTotal} onClick={() => setPaymentsPage(paymentsPage + 1)} className="px-3 py-1 rounded text-xs font-mono cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)", opacity: paymentsPage * 20 >= paymentsTotal ? 0.3 : 1 }}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,.8)", backdropFilter: "blur(10px)" }} onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()} style={{ background: "#12131a", border: "1px solid rgba(255,255,255,.08)" }}>
            <h3 className="text-lg font-bold text-white mb-1">
              {modal.type === "credits" ? "Allocate Credits" : modal.type === "plan" ? "Change Plan" : "Change Role"}
            </h3>
            <p className="text-xs font-mono mb-4" style={{ color: "rgba(255,255,255,.4)" }}>
              {modal.user.email} — {modal.user.full_name || "No name"}
            </p>

            {modal.type === "credits" && (
              <>
                <label className="block text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,.4)" }}>AMOUNT (positive = grant, negative = revoke)</label>
                <input type="number" value={modalValue} onChange={(e) => setModalValue(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none mb-3 font-mono"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <label className="block text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,.4)" }}>REASON (optional)</label>
                <input type="text" value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} placeholder="e.g. Bonus credits for feedback"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none mb-4 font-mono"
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
                <p className="text-xs font-mono mb-4" style={{ color: "rgba(255,255,255,.3)" }}>
                  Current balance: {modal.user.credits_balance} → New: {modal.user.credits_balance + (parseInt(modalValue) || 0)}
                </p>
              </>
            )}

            {modal.type === "plan" && (
              <div className="flex flex-col gap-2 mb-4">
                {[
                  { id: "free", name: "Free", price: "R0" },
                  { id: "pro", name: "Pro", price: "R99/mo" },
                  { id: "premium", name: "Premium", price: "R249/mo" },
                ].map((p) => (
                  <button key={p.id} onClick={() => setModalValue(p.id)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl text-sm cursor-pointer transition-all"
                    style={{
                      background: modalValue === p.id ? "rgba(0,229,160,.1)" : "rgba(255,255,255,.03)",
                      border: `1px solid ${modalValue === p.id ? "rgba(0,229,160,.3)" : "rgba(255,255,255,.06)"}`,
                      color: modalValue === p.id ? "#00e5a0" : "rgba(255,255,255,.6)",
                    }}>
                    <span className="font-semibold">{p.name}</span>
                    <span className="font-mono text-xs">{p.price}</span>
                  </button>
                ))}
              </div>
            )}

            {modal.type === "role" && (
              <div className="flex gap-2 mb-4">
                {["user", "admin"].map((r) => (
                  <button key={r} onClick={() => setModalValue(r)}
                    className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold capitalize cursor-pointer"
                    style={{
                      background: modalValue === r ? (r === "admin" ? "rgba(255,77,106,.1)" : "rgba(77,160,255,.1)") : "rgba(255,255,255,.03)",
                      border: `1px solid ${modalValue === r ? (r === "admin" ? "rgba(255,77,106,.3)" : "rgba(77,160,255,.3)") : "rgba(255,255,255,.06)"}`,
                      color: modalValue === r ? (r === "admin" ? "#ff4d6a" : "#4da0ff") : "rgba(255,255,255,.5)",
                    }}>
                    {r}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer"
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", color: "rgba(255,255,255,.5)" }}>Cancel</button>
              <button onClick={handleAction} disabled={actionLoading} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
                style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", color: "#0a0b0f", opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
