import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId, days = 7 } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);

    await service.from("profiles").update({
      plan_id: "pro",
      subscription_status: "active",
      subscription_expires_at: expiry.toISOString(),
    }).eq("id", userId);

    await service.from("credit_transactions").insert({
      user_id: userId,
      amount: 0,
      type: "admin_grant",
      description: `Pro trial gifted for ${days} days by admin`,
      created_by: user.id,
    });

    return NextResponse.json({ success: true, expiresAt: expiry.toISOString() });
  } catch (error) {
    console.error("Gift trial error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
