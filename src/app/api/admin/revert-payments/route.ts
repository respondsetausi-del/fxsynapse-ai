import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

/**
 * Revert false force-activated payments.
 * Finds payments with activation_method = "admin_force" and reverts them.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Find all payments that were force-activated
    const { data: forceActivated } = await service
      .from("payments")
      .select("*")
      .eq("status", "completed")
      .order("completed_at", { ascending: false });

    if (!forceActivated) {
      return NextResponse.json({ message: "No payments found", reverted: 0 });
    }

    let reverted = 0;
    const results: any[] = [];

    for (const payment of forceActivated) {
      const method = payment.metadata?.activation_method;
      
      // Only revert admin_force and success_page activations
      // Keep "webhook" activations — those are real
      if (method === "admin_force" || method === "success_page") {
        // Revert payment to failed
        await service.from("payments").update({
          status: "failed",
          metadata: { ...payment.metadata, reverted: true, reverted_at: new Date().toISOString() },
        }).eq("id", payment.id);

        // Downgrade user back to free
        await service.from("profiles").update({
          plan_id: "free",
          subscription_status: "inactive",
          subscription_expires_at: null,
          billing_period: null,
        }).eq("id", payment.user_id);

        reverted++;
        
        // Get user email for logging
        const { data: profile } = await service.from("profiles").select("email, full_name").eq("id", payment.user_id).single();
        results.push({
          id: payment.id,
          email: profile?.email || "?",
          name: profile?.full_name || "?",
          plan: payment.plan_id,
          amount: payment.amount_cents,
          method,
          status: "reverted",
        });
      }
    }

    return NextResponse.json({
      message: `Reverted ${reverted} false activations`,
      reverted,
      results,
    });
  } catch (err) {
    console.error("[REVERT] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
