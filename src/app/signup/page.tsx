"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password.length < 6) { setError("Password must be at least 6 characters"); setLoading(false); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); setLoading(false); return; }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // If user is auto-confirmed (no email verification), sign them in directly
    if (data.user && !data.user.identities?.length) {
      setError("An account with this email already exists. Please sign in.");
      setLoading(false);
      return;
    }

    // Auto sign-in after signup
    if (data.session) {
      window.location.href = "/dashboard";
      return;
    }

    // If session wasn't returned (email confirmation enabled), try signing in
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      // If sign-in fails, email confirmation might be required
      setError("Account created! Please check your email to confirm, then sign in.");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: "#0a0b0f" }}>
      <div className="fixed inset-0 z-0">
        <div className="absolute rounded-full" style={{ top: "-20%", left: "-10%", width: 550, height: 550, background: "radial-gradient(circle,rgba(0,229,160,.07) 0%,transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ bottom: "-20%", right: "-10%", width: 450, height: 450, background: "radial-gradient(circle,rgba(77,160,255,.05) 0%,transparent 70%)", filter: "blur(80px)" }} />
      </div>
      <div className="relative z-10 w-full max-w-[420px] px-5">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", boxShadow: "0 4px 20px rgba(0,229,160,.3)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0b0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12"/><path d="M2 12C2 12 5 20 12 20C19 20 22 12 22 12"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: "'Outfit',sans-serif" }}>Create your account</h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,.5)" }}>Start with 1 free chart scan daily</p>
        </div>
        <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", backdropFilter: "blur(20px)" }}>
          <form onSubmit={handleSignup} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,.4)" }}>FULL NAME</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="John Doe" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,.4)" }}>EMAIL</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,.4)" }}>PASSWORD</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min 6 characters" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,.4)" }}>CONFIRM PASSWORD</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Repeat password" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }} />
            </div>
            {error && <div className="px-3 py-2 rounded-lg text-xs font-mono" style={{ background: "rgba(255,77,106,.08)", border: "1px solid rgba(255,77,106,.2)", color: "#ff4d6a" }}>{error}</div>}
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold cursor-pointer mt-1" style={{ background: "linear-gradient(135deg,#00e5a0,#00b87d)", border: "none", color: "#0a0b0f", boxShadow: "0 4px 20px rgba(0,229,160,.3)", opacity: loading ? 0.6 : 1 }}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        </div>
        <p className="text-center mt-5 text-sm" style={{ color: "rgba(255,255,255,.4)" }}>Already have an account? <Link href="/login" className="font-semibold" style={{ color: "#00e5a0" }}>Sign in</Link></p>
      </div>
    </div>
  );
}
