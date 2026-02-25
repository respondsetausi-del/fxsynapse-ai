import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { sendPaymentSuccessToUser, sendPaymentNotificationToAdmin } from "@/lib/email";

/**
 * Admin: Manually activate a user's payment
 * POST /api/admin/manual-activate
 * Body: { email: "user@email.com", planId: "pro" }
 * 
 * Use this when you've confirmed payment in Yoco dashboard
 * but the webhook didn't fire or was missed.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { email, planId } = await req.json();
    if (!email || !planId) {
      return NextResponse.json({ error: "email and planId required" }, { status: 400 });
    }

    // Find user by email
    const { data: profile } = await service
      .from("profiles")
      .select("id, email, plan_id, subscription_status")
      .eq("email", email)
      .single();

    if (!profile) {
      return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
    }

    // Activate subscription
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    await service.from("profiles").update({
      plan_id: planId,
      subscription_status: "active",
      subscription_expires_at: expiry.toISOString(),
      billing_cycle_start: new Date().toISOString(),
      monthly_scans_used: 0,
      monthly_scans_reset_at: new Date().toISOString(),
    }).eq("id", profile.id);

    // Find and mark related payment as completed
    const { data: pendingPayment } = await service
      .from("payments")
      .select("*")
      .eq("user_id", profile.id)
      .in("status", ["pending", "failed"])
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (pendingPayment) {
      await service.from("payments").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", pendingPayment.id);
    }

    // Send confirmation email
    const planNames: Record<string, string> = { starter: "Starter", pro: "Pro", premium: "Premium" };
    const planPrices: Record<string, string> = { starter: "R49", pro: "R99", premium: "R199" };
    const pName = planNames[planId] || planId;
    const pPrice = planPrices[planId] || "unknown";

    sendPaymentSuccessToUser(email, pName, pPrice).catch(console.error);
    sendPaymentNotificationToAdmin(email, pName, pPrice).catch(console.error);

    console.log(`[MANUAL-ACTIVATE] ✅ ${email} → ${pName} plan`);

    return NextResponse.json({ 
      success: true, 
      email, 
      plan: pName,
      message: `✅ Activated ${pName} plan for ${email}`,
    });
  } catch (err) {
    console.error("[MANUAL-ACTIVATE] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
