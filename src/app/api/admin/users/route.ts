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

    const search = req.nextUrl.searchParams.get("search") || "";
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = service
      .from("profiles")
      .select("*, plans(name, price_cents)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    const { data: users, count, error } = await query;
    if (error) throw error;

    const userIds = (users || []).map((u) => u.id);
    const { data: scanCounts } = await service
      .from("scans")
      .select("user_id")
      .in("user_id", userIds);

    const countMap: Record<string, number> = {};
    (scanCounts || []).forEach((s) => { countMap[s.user_id] = (countMap[s.user_id] || 0) + 1; });

    const usersWithScans = (users || []).map((u) => ({
      ...u,
      total_scans: countMap[u.id] || 0,
    }));

    return NextResponse.json({ users: usersWithScans, total: count, page, limit });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
