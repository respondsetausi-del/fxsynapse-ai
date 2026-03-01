"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const supabase = createClient();

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = redirect;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: "#0a0b0f" }}>
      {/* BG */}
      <div className="fixed inset-0 z-0">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.07) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ bottom: "-20%", right: "-10%", width: 450, height: 450, background: "radial-gradient(circle,rgba(77,160,255,.05) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
      </div>

      <div className="relative z-10 w-full max-w-[420px] px-5">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 20px rgba(0,229,160,.3)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: "'Outfit',sans-serif" }}>
            Welcome back
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,.5)" }}>
            Sign in to FXSynapse AI
          </p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", backdropFilter: "blur(20px)" }}>
          {/* Email form */}
          <form onSubmit={handleEmail} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,.4)" }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,.4)" }}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}
              />
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg text-xs font-mono" style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.2)", color: "#ff4d6a" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold cursor-pointer mt-1 transition-opacity"
              style={{
                background: "linear-gradient(135deg,#00e5a0,#00b87d)",
                border: "none", color: "#0a0b0f",
                boxShadow: "0 4px 20px rgba(0,229,160,.3)",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center mt-5 text-sm" style={{ color: "rgba(255,255,255,.4)" }}>
          Don&apos;t have an account?{" "}
          <Link href={redirect !== "/dashboard" ? `/signup?redirect=${encodeURIComponent(redirect)}` : "/signup"} className="font-semibold" style={{ color: "#00e5a0" }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
