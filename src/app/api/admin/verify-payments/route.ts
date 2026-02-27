import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { sweepPendingPayments } from "@/lib/payment-activate";

/**
 * Admin: Verify pending payments via Yoco API.
 * Only activates if Yoco confirms payment status = "completed".
 * No more force-activate — that caused false activations.
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
      message: `Checked ${result.checked}, activated ${result.activated} (Yoco-verified only)`,
      ...result,
    });
  } catch (err) {
    console.error("[ADMIN:VERIFY] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
