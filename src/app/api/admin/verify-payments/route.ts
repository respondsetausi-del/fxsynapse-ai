import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { sendPaymentSuccessToUser, sendPaymentNotificationToAdmin } from "@/lib/email";
import { processAffiliateCommission } from "@/lib/affiliate";
import { verifyYocoPayment } from "@/lib/yoco-verify";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) return NextResponse.json({ error: "YOCO_SECRET_KEY not configured" }, { status: 500 });

    // Get all pending payments
    const { data: pending } = await service
      .from("payments")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!pending || pending.length === 0) {
      return NextResponse.json({ message: "No pending payments found", verified: 0, activated: 0 });
    }

    let verified = 0;
    let activated = 0;
    let failed = 0;
    const results: Array<{ id: string; email: string; plan: string; status: string; reason?: string }> = [];

    for (const payment of pending) {
      const checkoutId = payment.yoco_checkout_id;
      if (!checkoutId) {
        results.push({ id: payment.id, email: "?", plan: payment.plan_id, status: "skipped", reason: "no checkout ID" });
        continue;
      }

      try {
        // Use proper payment-level verification
        const verification = await verifyYocoPayment(checkoutId, yocoKey);
        verified++;

        if (verification.paid) {
          // Actually paid — activate!
          await service.from("payments").update({
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", payment.id);

          const userId = payment.user_id;

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
            }).eq("id", userId);

            const { data: profile } = await service.from("profiles").select("email").eq("id", userId).single();
            const email = profile?.email || "unknown";

            const planNames: Record<string, string> = { starter: "Starter", pro: "Pro", premium: "Premium" };
            const planPrices: Record<string, string> = { starter: "R79", pro: "R149", premium: "R299" };
            const pName = planNames[payment.plan_id] || payment.plan_id;
            const pPrice = planPrices[payment.plan_id] || `R${(payment.amount_cents || 0) / 100}`;

            sendPaymentSuccessToUser(email, pName, pPrice).catch(console.error);
            sendPaymentNotificationToAdmin(email, pName, pPrice).catch(console.error);
            processAffiliateCommission(userId, payment.id, payment.amount_cents).catch(console.error);

            results.push({ id: payment.id, email, plan: pName, status: "activated" });
            activated++;

          } else if (payment.type === "topup" || payment.type === "credits") {
            const creditsAmount = payment.credits_amount || 0;
            const { data: profile } = await service.from("profiles").select("credits_balance, email").eq("id", userId).single();

            if (profile) {
              await service.from("profiles").update({
                credits_balance: (profile.credits_balance || 0) + creditsAmount,
              }).eq("id", userId);

              await service.from("credit_transactions").insert({
                user_id: userId,
                amount: creditsAmount,
                type: "purchase",
                description: `${creditsAmount} credits (admin verified)`,
              });
            }

            results.push({ id: payment.id, email: profile?.email || "?", plan: `${creditsAmount} credits`, status: "activated" });
            activated++;
          }

        } else {
          // Not actually paid
          results.push({
            id: payment.id, email: "?", plan: payment.plan_id,
            status: "not_paid", reason: verification.details,
          });
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 300));

      } catch (err) {
        results.push({ id: payment.id, email: "?", plan: payment.plan_id, status: "error", reason: String(err) });
        failed++;
      }
    }

    console.log(`[VERIFY] Done: ${verified} verified, ${activated} activated, ${failed} failed`);
    return NextResponse.json({ verified, activated, failed, total: pending.length, results });

  } catch (err) {
    console.error("[VERIFY] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
