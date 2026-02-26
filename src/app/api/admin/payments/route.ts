import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    const { data: payments, count, error } = await service
      .from("payments")
      .select("*, profiles(email, full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Summary aggregation — all payments, not just current page
    const [pendingRes, completedRes, failedRes] = await Promise.all([
      service.from("payments").select("amount_cents").eq("status", "pending"),
      service.from("payments").select("amount_cents").eq("status", "completed"),
      service.from("payments").select("amount_cents").eq("status", "failed"),
    ]);

    const sum = (rows: { amount_cents: number }[] | null) => (rows || []).reduce((s, r) => s + (r.amount_cents || 0), 0);
    const cnt = (rows: unknown[] | null) => (rows || []).length;

    const summary = {
      pending: { count: cnt(pendingRes.data), amount: sum(pendingRes.data as { amount_cents: number }[]) },
      completed: { count: cnt(completedRes.data), amount: sum(completedRes.data as { amount_cents: number }[]) },
      failed: { count: cnt(failedRes.data), amount: sum(failedRes.data as { amount_cents: number }[]) },
    };

    return NextResponse.json({ payments: payments || [], total: count || 0, page, limit, summary });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
