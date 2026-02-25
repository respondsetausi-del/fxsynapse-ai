import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

/**
 * Audit & Fix Payments
 * 
 * Since Yoco's API cannot verify payment status retroactively,
 * this tool helps admin manually reconcile payments by:
 * 1. Listing all "completed" payments with details
 * 2. Allowing admin to mark specific ones as "failed" (fix mode)
 * 3. Cross-referencing with Yoco dashboard amounts
 * 
 * POST /api/admin/audit-payments
 * Body: { fix: false } → audit only
 * Body: { fix: true, failIds: ["id1", "id2"] } → mark specific IDs as failed
 * Body: { fix: true, keepIds: ["id1", "id2"] } → mark everything EXCEPT these as failed
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({ fix: false }));
    const { fix, failIds, keepIds } = body;

    // Get ALL completed payments
    const { data: completed } = await service
      .from("payments")
      .select("*")
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (!completed || completed.length === 0) {
      return NextResponse.json({ message: "No completed payments found", total: 0 });
    }

    const results: Array<{
      id: string;
      email: string;
      plan: string;
      amount: number;
      createdAt: string;
      verdict: string;
    }> = [];

    let reallyPaid = 0;
    let notPaid = 0;

    for (const payment of completed) {
      const { data: profile } = await service
        .from("profiles")
        .select("email, display_name")
        .eq("id", payment.user_id)
        .single();

      const email = profile?.email || "?";
      const amount = (payment.amount_cents || 0) / 100;

      let verdict = "UNKNOWN";
      let shouldFail = false;

      if (fix) {
        if (failIds && failIds.includes(payment.id)) {
          shouldFail = true;
          verdict = "FAKE_REVERTED";
        } else if (keepIds) {
          shouldFail = !keepIds.includes(payment.id);
          verdict = shouldFail ? "FAKE_REVERTED" : "REAL";
        }
      }

      if (shouldFail) {
        // Revert payment to failed
        await service.from("payments").update({ status: "failed" }).eq("id", payment.id);

        // Downgrade user if no other completed payments
        if (payment.type === "subscription") {
          const { data: otherPayments } = await service
            .from("payments")
            .select("id")
            .eq("user_id", payment.user_id)
            .eq("status", "completed")
            .neq("id", payment.id);

          if (!otherPayments || otherPayments.length === 0) {
            await service.from("profiles").update({
              plan_id: "free",
              subscription_status: "none",
              subscription_expires_at: null,
            }).eq("id", payment.user_id);
          }
        }
        notPaid++;
      } else if (fix && keepIds) {
        reallyPaid++;
      }

      results.push({
        id: payment.id,
        email,
        plan: payment.plan_id || "topup",
        amount,
        createdAt: payment.created_at,
        verdict: fix ? verdict : "UNVERIFIED",
      });
    }

    const totalRevenue = results.reduce((sum, r) => sum + r.amount, 0);
    const realRevenue = results.filter(r => r.verdict === "REAL").reduce((sum, r) => sum + r.amount, 0);
    const fakeRevenue = results.filter(r => r.verdict.includes("FAKE")).reduce((sum, r) => sum + r.amount, 0);

    return NextResponse.json({
      total: completed.length,
      reallyPaid,
      notPaid,
      totalRevenue: `R${totalRevenue}`,
      realRevenue: `R${realRevenue}`,
      fakeRevenue: `R${fakeRevenue}`,
      fixed: fix || false,
      results,
      instructions: fix ? undefined : "To fix: POST with { fix: true, keepIds: ['id1', 'id2'] } where keepIds are the REAL payment IDs from Yoco dashboard",
    });
  } catch (err) {
    console.error("[AUDIT] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
