import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { sendPaymentSuccessToUser, sendPaymentNotificationToAdmin } from "@/lib/email";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find most recent pending payment for this user
    const { data: payment } = await service
      .from("payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!payment) {
      // Check if already activated (webhook may have beaten us)
      const { data: profile } = await service
        .from("profiles")
        .select("plan_id, subscription_status")
        .eq("id", user.id)
        .single();

      if (profile?.subscription_status === "active") {
        return NextResponse.json({ status: "already_active", plan: profile.plan_id });
      }

      // Also check if there's a recently completed payment (webhook processed it)
      const { data: recentPayment } = await service
        .from("payments")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (recentPayment) {
        const completedAt = new Date(recentPayment.updated_at || recentPayment.created_at);
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (completedAt > fiveMinAgo) {
          // Webhook already processed this very recently
          return NextResponse.json({
            status: "activated",
            plan: recentPayment.plan_id,
            type: recentPayment.type,
            method: "webhook_already_processed",
          });
        }
      }

      return NextResponse.json({ status: "no_pending_payment" });
    }

    // Activate: Yoco redirected to success = payment went through
    console.log(`[ACTIVATE] Processing payment ${payment.id} for user ${user.id}`);

    await service.from("payments").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", payment.id);

    if (payment.type === "subscription") {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      await service.from("profiles").update({
        plan_id: payment.plan_id,
        subscription_status: "active",
        subscription_expires_at: expiry.toISOString(),
        billing_cycle_start: new Date().toISOString(),
        monthly_scans_used: 0,
        monthly_scans_reset_at: new Date().toISOString(),
      }).eq("id", user.id);

      console.log(`[ACTIVATE] ✅ Subscription activated: user=${user.id}, plan=${payment.plan_id}`);
      // Send emails
      const planNames: Record<string, string> = { starter: "Starter", pro: "Pro", premium: "Premium" };
      const planPrices: Record<string, string> = { starter: "R49", pro: "R99", premium: "R199" };
      const pName = planNames[payment.plan_id] || payment.plan_id;
      const pPrice = planPrices[payment.plan_id] || `R${(payment.amount || 0) / 100}`;
      sendPaymentSuccessToUser(user.email!, pName, pPrice).catch(console.error);
      sendPaymentNotificationToAdmin(user.email!, pName, pPrice).catch(console.error);
      return NextResponse.json({ status: "activated", plan: payment.plan_id, type: "subscription" });

    } else if (payment.type === "topup" || payment.type === "credits") {
      const creditsAmount = payment.credits_amount || 0;

      const { data: profile } = await service
        .from("profiles")
        .select("credits_balance")
        .eq("id", user.id)
        .single();

      if (profile) {
        await service.from("profiles").update({
          credits_balance: (profile.credits_balance || 0) + creditsAmount,
        }).eq("id", user.id);

        await service.from("credit_transactions").insert({
          user_id: user.id,
          amount: creditsAmount,
          type: "purchase",
          description: `Purchased ${creditsAmount} top-up credits`,
        });
      }

      console.log(`[ACTIVATE] ✅ Credits added: user=${user.id}, credits=${creditsAmount}`);
      return NextResponse.json({ status: "activated", credits: creditsAmount, type: "topup" });
    }

    return NextResponse.json({ status: "unknown_type" });
  } catch (error) {
    console.error("[ACTIVATE] Error:", error);
    return NextResponse.json({ error: "Failed to activate" }, { status: 500 });
  }
}
