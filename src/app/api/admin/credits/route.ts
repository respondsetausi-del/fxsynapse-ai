import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { adminAllocateCredits } from "@/lib/credits";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    if (action === "allocate_credits") {
      const { userId, amount, description } = body;
      const newBalance = await adminAllocateCredits(user.id, userId, amount, description || "Admin allocation");
      return NextResponse.json({ success: true, newBalance });
    }

    if (action === "change_plan") {
      const { userId, planId } = body;
      const { error } = await service
        .from("profiles")
        .update({ plan_id: planId, subscription_status: planId === "free" ? "none" : "active" })
        .eq("id", userId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "set_role") {
      const { userId, role } = body;
      if (!["user", "admin"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      const { error } = await service.from("profiles").update({ role }).eq("id", userId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "block_user") {
      const { userId, reason } = body;
      const { error } = await service
        .from("profiles")
        .update({ is_blocked: true, blocked_reason: reason || "Blocked by admin" })
        .eq("id", userId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === "unblock_user") {
      const { userId } = body;
      const { error } = await service
        .from("profiles")
        .update({ is_blocked: false, blocked_reason: null })
        .eq("id", userId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
