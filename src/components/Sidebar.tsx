"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ScanRecord {
  id: string;
  pair: string;
  timeframe: string;
  bias: string;
  confidence: number;
  created_at: string;
}

interface SidebarProps {
  user: {
    id: string; email: string; full_name: string; role: string;
    plan_id: string; credits_balance: number;
    plans: { name: string };
  } | null;
  credits: {
    monthlyUsed?: number;
    monthlyLimit?: number;
    monthlyRemaining?: number;
    topupBalance?: number;
    planName?: string;
    dailyRemaining?: number;
    creditsBalance?: number;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ user, credits, isOpen, onClose }: SidebarProps) {
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setLoadingHistory(true);
      fetch("/api/user/history")
        .then((res) => res.json())
        .then((data) => {
          setHistory(data.scans || []);
          setHiddenCount(data.hiddenCount || 0);
          setLoadingHistory(false);
        })
        .catch(() => setLoadingHistory(false));
    }
  }, [isOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const formatDate = (d: string) => {
    const dt = new Date(d);
    const now = new Date();
    const diff = now.getTime() - dt.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return dt.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  const biasColor = (b: string) => b === "Long" ? "#00e5a0" : b === "Short" ? "#ff4d6a" : "#f0b90b";
  const confColor = (v: number) => v >= 75 ? "#00e5a0" : v >= 50 ? "#f0b90b" : "#ff4d6a";

  return (
    <>
      {/* Overlay */}
      {isOpen && <div className="fixed inset-0 z-[998]" style={{ background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)" }} onClick={onClose} />}

      {/* Sidebar */}
      <div className="fixed top-0 left-0 h-full z-[999] flex flex-col transition-transform duration-300" style={{
        width: 300,
        background: "#0d0e14",
        borderRight: "1px solid rgba(255,255,255,.06)",
        transform: isOpen ? "translateX(0)" : "translateX(-100%)",
      }}>

        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ paddingTop: 48, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <span className="text-sm font-bold text-white">FXSynapse<span style={{ color: "#00e5a0" }}> AI</span></span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", color: "rgba(255,255,255,.4)" }}>
            ✕
          </button>
        </div>

        {/* Profile */}
        {user && (
          <div className="p-4" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "rgba(0,229,160,.15)", border: "1px solid rgba(0,229,160,.2)", color: "#00e5a0" }}>
                {(user.full_name || user.email)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{user.full_name || "Trader"}</div>
                <div className="text-[10px] font-mono truncate" style={{ color: "rgba(255,255,255,.35)" }}>{user.email}</div>
              </div>
            </div>
            {/* Plan + Credits */}
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)" }}>
                <div className="text-[9px] font-mono uppercase mb-0.5" style={{ color: "rgba(255,255,255,.3)" }}>Plan</div>
                <div className="text-xs font-bold" style={{
                  color: user.plan_id === "premium" ? "#f0b90b" : user.plan_id === "pro" ? "#00e5a0" : user.plan_id === "starter" ? "#4da0ff" : "rgba(255,255,255,.5)"
                }}>{user.plans?.name || "None"}</div>
              </div>
              <div className="flex-1 rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)" }}>
                <div className="text-[9px] font-mono uppercase mb-0.5" style={{ color: "rgba(255,255,255,.3)" }}>Monthly</div>
                <div className="text-xs font-bold" style={{ color: "#4da0ff" }}>
                  {credits ? (credits.monthlyRemaining === -1 ? "∞" : `${credits.monthlyRemaining}/${credits.monthlyLimit}`) : "—"}
                </div>
              </div>
              <div className="flex-1 rounded-lg p-2 text-center" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)" }}>
                <div className="text-[9px] font-mono uppercase mb-0.5" style={{ color: "rgba(255,255,255,.3)" }}>Top-up</div>
                <div className="text-xs font-bold" style={{ color: "#f0b90b" }}>
                  {credits ? credits.topupBalance : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="p-3 flex flex-col gap-1" style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          <Link href="/dashboard?scanner=true" onClick={onClose} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg no-underline text-xs font-semibold" style={{ background: "rgba(0,229,160,.08)", color: "#00e5a0" }}>
            <span>📊</span> Scan Chart
          </Link>
          <Link href="/pricing" onClick={onClose} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg no-underline text-xs font-semibold" style={{ color: "rgba(255,255,255,.5)" }}>
            <span>💎</span> Upgrade Plan
          </Link>
          {user?.role === "admin" && (
            <Link href="/admin" onClick={onClose} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg no-underline text-xs font-semibold" style={{ color: "#ff4d6a" }}>
              <span>👑</span> Admin Dashboard
            </Link>
          )}
        </div>

        {/* Scan History */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,.25)" }}>SCAN HISTORY</div>
            {loadingHistory ? (
              <div className="text-center py-6">
                <div className="text-xs font-mono" style={{ color: "rgba(255,255,255,.3)" }}>Loading...</div>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-2">📈</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,.3)" }}>No scans yet</div>
                <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,.2)" }}>Upload a chart to start</div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {history.map((scan) => (
                  <div key={scan.id} className="rounded-lg p-2.5 cursor-default transition-all" style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.04)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">{scan.pair || "Unknown"}</span>
                      <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.25)" }}>{formatDate(scan.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.4)" }}>
                        {scan.timeframe || "—"}
                      </span>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: `${biasColor(scan.bias)}15`, color: biasColor(scan.bias) }}>
                        {scan.bias || "—"}
                      </span>
                      <span className="text-[9px] font-mono font-bold ml-auto" style={{ color: confColor(scan.confidence) }}>
                        {scan.confidence}%
                      </span>
                    </div>
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <Link href="/pricing" onClick={onClose} className="rounded-lg p-3 text-center no-underline block" style={{ background: "rgba(0,229,160,.04)", border: "1px dashed rgba(0,229,160,.2)" }}>
                    <div className="text-[10px] font-mono font-bold mb-1" style={{ color: "#00e5a0" }}>
                      🔒 {hiddenCount} more scan{hiddenCount > 1 ? "s" : ""} hidden
                    </div>
                    <div className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>
                      Upgrade to Pro to unlock full history
                    </div>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Logout */}
        <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold cursor-pointer" style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.12)", color: "#ff4d6a" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
