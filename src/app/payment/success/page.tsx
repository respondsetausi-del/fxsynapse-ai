"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const type = params.get("type");
  const [status, setStatus] = useState<"activating" | "done" | "not_paid">("activating");
  const [planInfo, setPlanInfo] = useState("");

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 5;

    async function activate() {
      try {
        const res = await fetch("/api/payments/activate", { method: "POST" });
        const data = await res.json();

        if (data.status === "activated" || data.status === "already_active") {
          setPlanInfo(data.plan || `${data.credits} credits`);
          setStatus("done");
          return;
        }

        // Payment not completed on Yoco side
        if (data.status === "not_paid") {
          if (attempts < maxAttempts) {
            // Yoco might still be processing — retry with delay
            attempts++;
            setTimeout(activate, 3000);
            return;
          }
          setStatus("not_paid");
          return;
        }

        if (data.status === "no_pending_payment") {
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(activate, 2000);
            return;
          }
          // After retries, could be webhook already handled it
          setStatus("done");
          return;
        }

        // Unknown status — retry
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(activate, 2000);
        } else {
          setStatus("done");
        }
      } catch {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(activate, 2000);
        } else {
          setStatus("not_paid");
        }
      }
    }

    activate();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0b0f" }}>
      <div className="fixed inset-0 z-0">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.12) 0%,transparent 70%)", filter: "blur(80px)" }} />
      </div>
      <div className="relative z-10 text-center max-w-md px-6">
        {status === "activating" ? (
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center animate-pulse" style={{ background: "rgba(0,229,160,.15)", border: "2px solid rgba(0,229,160,.25)" }}>
              <span className="text-2xl">⏳</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Verifying your payment...</h1>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.5)" }}>Checking with Yoco — just a moment</p>
          </>
        ) : status === "not_paid" ? (
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: "rgba(255,77,106,.15)", border: "2px solid rgba(255,77,106,.25)" }}>
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Payment Not Confirmed</h1>
            <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,.5)" }}>
              We couldn&apos;t verify your payment with our payment provider. If you were charged, your plan will be activated automatically within a few minutes. If not, please try again.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/pricing" className="inline-block px-5 py-3 rounded-xl text-sm font-bold no-underline" style={{ background: "rgba(255,255,255,.06)", color: "white", border: "1px solid rgba(255,255,255,.1)" }}>
                Try Again
              </Link>
              <Link href="/dashboard" className="inline-block px-5 py-3 rounded-xl text-sm font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
                Go to Dashboard
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
