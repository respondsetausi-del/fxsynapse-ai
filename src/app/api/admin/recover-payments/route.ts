import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/admin/recover-payments
 * Sends recovery emails to users with failed/pending payments via Brevo SMTP
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Find failed & pending payments (not already emailed in last 24h)
    const { data: recoverablePayments } = await service
      .from("payments")
      .select("*")
      .in("status", ["failed", "pending"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (!recoverablePayments || recoverablePayments.length === 0) {
      return NextResponse.json({ message: "No users to recover", sent: 0 });
    }

    // Filter: skip if already emailed in last 24h
    const oneDayAgo = Date.now() - 24 * 3600000;
    const eligible = recoverablePayments.filter(p => {
      if (p.recovery_email_sent_at && new Date(p.recovery_email_sent_at).getTime() > oneDayAgo) return false;
      return true;
    }).slice(0, 10);

    if (eligible.length === 0) {
      return NextResponse.json({ message: "All eligible users already emailed in last 24h", sent: 0 });
    }

    // Get user profiles
    const userIds = [...new Set(eligible.map(p => p.user_id))];
    const { data: profiles } = await service
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    let sent = 0;
    const results: any[] = [];

    for (const payment of eligible) {
      const profile = profiles?.find(p => p.id === payment.user_id);
      if (!profile?.email) {
        results.push({ email: "unknown", status: "no_email" });
        continue;
      }

      const planName = (payment.plan_id || "basic").charAt(0).toUpperCase() + (payment.plan_id || "basic").slice(1);
      const amount = `R${((payment.amount_cents || 0) / 100).toFixed(0)}`;
      const firstName = profile.full_name?.split(" ")[0] || "";

      const html = `
        <div style="text-align:center;margin-bottom:20px;">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(240,185,11,.1);border:2px solid rgba(240,185,11,.2);display:inline-flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;">⚠️</span>
          </div>
        </div>
        <h2 style="color:#fff;font-size:20px;text-align:center;margin:0 0 8px;">Your ${planName} Plan is Waiting</h2>
        <p style="color:rgba(255,255,255,.5);font-size:13px;text-align:center;margin:0 0 20px;">
          Hey${firstName ? ` ${firstName}` : ""}, we noticed your ${amount}/mo payment didn't go through. No worries — these things happen.
        </p>
        <p style="color:rgba(255,255,255,.5);font-size:13px;text-align:center;margin:0 0 24px;">
          Your AI-powered trading analysis is just one click away:
        </p>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="https://fxsynapse-ai.vercel.app/pricing" style="display:inline-block;background:linear-gradient(135deg,#00e5a0,#00b87d);color:#0a0b0f;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;">
            Complete Payment →
          </a>
        </div>
        <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;">
          <p style="color:rgba(255,255,255,.4);font-size:12px;margin:0;line-height:1.6;">
            <strong style="color:rgba(255,255,255,.6);">What you get with ${planName}:</strong><br>
            ✅ AI chart analysis with entry, SL & TP<br>
            ✅ Smart money concepts & confluences<br>
            ✅ Setup grade & confidence score<br>
            ✅ Risk:Reward ratio
          </p>
        </div>
        <p style="color:rgba(255,255,255,.2);font-size:10px;text-align:center;margin-top:20px;">
          Questions? Just reply to this email.
        </p>`;

      const ok = await sendEmail(
        profile.email,
        `⚠️ Your ${planName} plan is waiting — complete your payment`,
        html
      );

      if (ok) {
        sent++;
        // Mark recovery email sent (columns may not exist yet, that's ok)
        await service.from("payments").update({
          recovery_email_sent_at: new Date().toISOString(),
          recovery_attempts: (payment.recovery_attempts || 0) + 1,
        }).eq("id", payment.id);
        results.push({ email: profile.email, plan: payment.plan_id, status: "sent" });
      } else {
        results.push({ email: profile.email, plan: payment.plan_id, status: "failed" });
      }

      // Rate limit between emails
      await new Promise(r => setTimeout(r, 200));
    }

    return NextResponse.json({
      message: `Sent ${sent} recovery emails out of ${eligible.length} eligible`,
      sent,
      total: eligible.length,
      results,
    });
  } catch (err) {
    console.error("[RECOVER]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
