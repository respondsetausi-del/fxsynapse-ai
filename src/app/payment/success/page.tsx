"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const type = params.get("type");

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0b0f" }}>
      <div className="fixed inset-0 z-0">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.12) 0%,transparent 70%)", filter: "blur(80px)" }} />
      </div>
      <div className="relative z-10 text-center max-w-md px-6">
        <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: "rgba(0,229,160,.15)", border: "2px solid rgba(0,229,160,.25)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,.5)" }}>
          {type === "subscription"
            ? "Your plan has been upgraded. Enjoy your new scan limits!"
            : "Credits have been added to your account. They never expire."}
        </p>
        <Link href="/" className="inline-block px-6 py-3 rounded-xl text-sm font-bold no-underline" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", color: "#0a0b0f" }}>
          Start Scanning →
        </Link>
      </div>
    </div>
  );
}

export default function PaymentSuccess() {
  return <Suspense><SuccessContent /></Suspense>;
}
