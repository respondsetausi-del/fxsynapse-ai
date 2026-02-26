import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const service = createServiceSupabase();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    const [
      newUsersToday,
      pendingPayments,
      failedPayments,
      completedToday,
      unreadChats,
      newAffiliates,
    ] = await Promise.all([
      service.from("profiles").select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),
      service.from("payments").select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      service.from("payments").select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      service.from("payments").select("id", { count: "exact", head: true })
        .eq("status", "completed").gte("created_at", today.toISOString()),
      service.from("chat_messages").select("id", { count: "exact", head: true })
        .eq("sender", "visitor")
        .gte("created_at", new Date(now.getTime() - 3600000).toISOString()),
      service.from("affiliates").select("id", { count: "exact", head: true })
        .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString()),
    ]);

    return NextResponse.json({
      users: newUsersToday.count || 0,
      payments: (pendingPayments.count || 0) + (failedPayments.count || 0),
      paymentsCompleted: completedToday.count || 0,
      chat: unreadChats.count || 0,
      affiliates: newAffiliates.count || 0,
      pendingPayments: pendingPayments.count || 0,
      failedPayments: failedPayments.count || 0,
    });
  } catch {
    return NextResponse.json({ users: 0, payments: 0, paymentsCompleted: 0, chat: 0, affiliates: 0, pendingPayments: 0, failedPayments: 0 });
  }
}
