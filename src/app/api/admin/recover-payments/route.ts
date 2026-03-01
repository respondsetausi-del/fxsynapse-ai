import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

/**
 * POST /api/admin/recover-payments
 * Sends recovery emails to users with failed/pending payments
 * Finds up to 10 users and emails them to retry payment
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
    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: recoverablePayments } = await service
      .from("payments")
      .select("*")
      .in("status", ["failed", "pending"])
      .or(`recovery_email_sent_at.is.null,recovery_email_sent_at.lt.${oneDayAgo}`)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!recoverablePayments || recoverablePayments.length === 0) {
      return NextResponse.json({ message: "No users to recover", sent: 0 });
    }

    // Get user profiles
    const userIds = [...new Set(recoverablePayments.map(p => p.user_id))];
    const { data: profiles } = await service
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    let sent = 0;
    const results: any[] = [];

    for (const payment of recoverablePayments) {
      const profile = profiles?.find(p => p.id === payment.user_id);
      if (!profile?.email) continue;

      const planName = (payment.plan_id || "basic").charAt(0).toUpperCase() + (payment.plan_id || "basic").slice(1);
      const amount = `R${((payment.amount_cents || 0) / 100).toFixed(0)}`;

      // Send recovery email via Resend
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "FXSynapse <noreply@fxsynapse.com>",
            to: profile.email,
            subject: `⚠️ Your ${planName} plan is waiting — complete your payment`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h1 style="font-size: 24px; font-weight: 800; color: #0a0b0f; margin: 0;">FXSynapse</h1>
                </div>
                
                <p style="font-size: 15px; color: #333; line-height: 1.6;">
                  Hey${profile.full_name ? ` ${profile.full_name.split(" ")[0]}` : ""},
                </p>
                
                <p style="font-size: 15px; color: #333; line-height: 1.6;">
                  We noticed your ${amount}/mo <strong>${planName}</strong> plan payment didn't go through. 
                  No worries — these things happen.
                </p>
                
                <p style="font-size: 15px; color: #333; line-height: 1.6;">
                  Your AI-powered trading analysis is just one click away:
                </p>
                
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://fxsynapse-ai.vercel.app'}/pricing" 
                     style="display: inline-block; padding: 14px 32px; background: #00c88c; color: #fff; text-decoration: none; border-radius: 12px; font-size: 15px; font-weight: 700;">
                    Complete Payment →
                  </a>
                </div>
                
                <div style="background: #f8f9fa; border-radius: 12px; padding: 16px; margin: 20px 0;">
                  <p style="font-size: 13px; color: #666; margin: 0; line-height: 1.5;">
                    <strong>What you get with ${planName}:</strong><br>
                    ✅ AI chart analysis with entry, SL & TP<br>
                    ✅ Smart money concepts & confluences<br>
                    ✅ AI trading assistant<br>
                    ✅ Signal scanner & fundamentals
                  </p>
                </div>
                
                <p style="font-size: 13px; color: #999; text-align: center; margin-top: 32px;">
                  Questions? Just reply to this email.<br>
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://fxsynapse-ai.vercel.app'}" style="color: #00c88c;">fxsynapse.com</a>
                </p>
              </div>
            `,
          }),
        });

        if (emailRes.ok) {
          sent++;
          // Mark payment as recovery email sent
          await service.from("payments").update({
            recovery_email_sent_at: new Date().toISOString(),
            recovery_attempts: (payment.recovery_attempts || 0) + 1,
          }).eq("id", payment.id);

          results.push({ email: profile.email, plan: payment.plan_id, amount: payment.amount_cents, status: "sent" });
        } else {
          results.push({ email: profile.email, plan: payment.plan_id, status: "email_failed" });
        }
      } catch {
        results.push({ email: profile.email, plan: payment.plan_id, status: "error" });
      }
    }

    return NextResponse.json({
      message: `Sent ${sent} recovery emails out of ${recoverablePayments.length} eligible`,
      sent,
      total: recoverablePayments.length,
      results,
    });
  } catch (err) {
    console.error("[RECOVER]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
