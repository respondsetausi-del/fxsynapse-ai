import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

/**
 * Revert false activations — find payments marked "completed" by admin_force
 * that were never actually paid on Yoco. Reset them and downgrade users back to free.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Find all payments activated by admin_force
    const { data: falsePayments } = await service
      .from("payments")
      .select("*")
      .eq("status", "completed")
      .order("completed_at", { ascending: false });

    if (!falsePayments || falsePayments.length === 0) {
      return NextResponse.json({ message: "No completed payments found", reverted: 0 });
    }

    let reverted = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const payment of falsePayments) {
      const method = payment.metadata?.activation_method;
      
      // Only revert payments activated by force — leave webhook-activated ones alone
      if (method !== "admin_force") {
        skipped++;
        continue;
      }

      // Revert payment to failed
      await service.from("payments").update({
        status: "failed",
        metadata: { ...(payment.metadata || {}), reverted: true, reverted_at: new Date().toISOString() },
      }).eq("id", payment.id);

      // Downgrade user back to free
      await service.from("profiles").update({
        plan_id: "free",
        subscription_status: "inactive",
        subscription_expires_at: null,
      }).eq("id", payment.user_id);

      reverted++;
      results.push({
        id: payment.id,
        user_id: payment.user_id,
        amount: payment.amount_cents,
        plan: payment.plan_id,
        method,
      });
    }

    return NextResponse.json({
      message: `Reverted ${reverted} false activations, skipped ${skipped} legitimate ones`,
      reverted,
      skipped,
      results,
    });
  } catch (err) {
    console.error("[REVERT] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
