import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { sweepPendingPayments } from "@/lib/payment-activate";

/**
 * Admin: Verify all pending payments.
 * Now just a thin wrapper around the shared sweepPendingPayments().
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const result = await sweepPendingPayments();

    return NextResponse.json({
      message: `Checked ${result.checked} pending payments, activated ${result.activated}`,
      ...result,
    });
  } catch (err) {
    console.error("[ADMIN:VERIFY] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
