"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const type = params.get("type");
  const [status, setStatus] = useState<"checking" | "done" | "delayed">("checking");
  const [planInfo, setPlanInfo] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;
    const maxAttempts = 15; // Poll for up to ~30 seconds

    async function checkPayment() {
      if (!mounted) return;
      
      try {
        const res = await fetch("/api/payments/activate", { method: "POST" });
        const data = await res.json();

        if (!mounted) return;

        if (data.status === "activated" || data.status === "already_active") {
          setPlanInfo(data.plan || `${data.credits} credits`);
          setStatus("done");
          return;
        }

        if (data.status === "processing" || data.status === "processing_delayed") {
          setAttempt(prev => prev + 1);
          if (attempt < maxAttempts) {
            // Poll every 2 seconds
            timeoutId = setTimeout(checkPayment, 2000);
          } else {
            // After 30s of polling, show delayed message but still show success
            setStatus("delayed");
          }
          return;
        }

        if (data.status === "no_pending_payment") {
          if (attempt < 3) {
            // Might just be slow — retry
            setAttempt(prev => prev + 1);
            timeoutId = setTimeout(checkPayment, 2000);
          } else {
            // Show success anyway — webhook will catch it
            setStatus("done");
          }
          return;
        }

        // Unknown status — show success
        setStatus("done");
      } catch {
        if (mounted && attempt < maxAttempts) {
          setAttempt(prev => prev + 1);
          timeoutId = setTimeout(checkPayment, 2000);
        } else {
          setStatus("done");
        }
      }
    }

    checkPayment();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0b0f" }}>
      <div className="fixed inset-0 z-0">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.12) 0%,transparent 70%)", filter: "blur(80px)" }} />
      </div>
      <div className="relative z-10 text-center max-w-md px-6">
        {status === "checking" ? (
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center animate-pulse" style={{ background: "rgba(0,229,160,.15)", border: "2px solid rgba(0,229,160,.25)" }}>
              <span className="text-2xl">⏳</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Confirming payment...</h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.5)" }}>
              {attempt > 5 ? "Still confirming — this can take a moment..." : "Just a moment"}
            </p>
            {attempt > 0 && (
              <div className="mt-3 w-32 mx-auto h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.1)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ background: "#00e5a0", width: `${Math.min((attempt / 15) * 100, 100)}%` }} />
              </div>
            )}
          </>
        ) : status === "delayed" ? (
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: "rgba(240,185,11,.15)", border: "2px solid rgba(240,185,11,.25)" }}>
              <span className="text-2xl">⏱️</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Payment Received</h1>
            <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,.5)" }}>
              Your payment is being processed. Your plan will activate within a few minutes. You can start scanning — it will unlock automatically.
            </p>
            <div>
              <Link href="/dashboard?scanner=true" className="inline-block px-6 py-3 rounded-xl text-sm font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
                Go to Dashboard →
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: "rgba(0,229,160,.15)", border: "2px solid rgba(0,229,160,.25)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
            <p className="text-sm mb-2" style={{ color: "rgba(255,255,255,.5)" }}>
              {type === "subscription"
                ? "Your plan is now active. Head to the dashboard to start scanning!"
                : "Top-up credits have been added to your account."}
            </p>
            {planInfo && (
              <div className="inline-block px-3 py-1.5 rounded-lg mb-5 text-xs font-mono font-bold" style={{ background: "rgba(0,229,160,.1)", color: "#00e5a0", border: "1px solid rgba(0,229,160,.2)" }}>
                {type === "subscription" ? `${planInfo.charAt(0).toUpperCase() + planInfo.slice(1)} Plan Active` : `+${planInfo}`}
              </div>
            )}
            <div>
              <Link href="/dashboard?scanner=true" className="inline-block px-6 py-3 rounded-xl text-sm font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
                Start Scanning →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccess() {
  return <Suspense><SuccessContent /></Suspense>;
}
