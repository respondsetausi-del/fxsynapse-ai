import { NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

// Safe delete — won't throw if table doesn't exist or no rows
async function safeDelete(service: ReturnType<typeof createServiceSupabase>, table: string, column: string, value: string) {
  try {
    await service.from(table).delete().eq(column, value);
  } catch (e) {
    console.log(`Skip delete ${table}: ${e}`);
  }
}

export async function POST(req: Request) {
  try {
    // Auth via server supabase (reads cookies correctly)
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    // Prevent self-delete
    if (userId === user.id) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

    // 1. Handle affiliate data (deepest foreign keys first)
    const { data: affiliate } = await service.from("affiliates").select("id").eq("user_id", userId).maybeSingle();
    if (affiliate) {
      await safeDelete(service, "affiliate_messages", "affiliate_id", affiliate.id);
      await safeDelete(service, "affiliate_payouts", "affiliate_id", affiliate.id);
      await safeDelete(service, "affiliate_earnings", "affiliate_id", affiliate.id);
      await safeDelete(service, "referrals", "affiliate_id", affiliate.id);
      await safeDelete(service, "affiliates", "id", affiliate.id);
    }

    // 2. Delete referral where this user was the referred person
    await safeDelete(service, "referrals", "referred_user_id", userId);

    // 3. Delete all user-related data
    await safeDelete(service, "scan_ratings", "user_id", userId);
    await safeDelete(service, "ratings", "user_id", userId);
    await safeDelete(service, "scans", "user_id", userId);
    await safeDelete(service, "credit_transactions", "user_id", userId);
    await safeDelete(service, "chat_messages", "user_id", userId);
    await safeDelete(service, "email_logs", "user_id", userId);
    await safeDelete(service, "visitor_events", "user_id", userId);
    await safeDelete(service, "payments", "user_id", userId);

    // 4. Delete profile
    const { error: profileError } = await service.from("profiles").delete().eq("id", userId);
    if (profileError) {
      console.error("Profile delete error:", profileError);
      return NextResponse.json({ error: `Failed to delete profile: ${profileError.message}` }, { status: 500 });
    }

    // 5. Delete auth user
    const { error: authError } = await service.auth.admin.deleteUser(userId);
    if (authError) console.error("Auth delete error:", authError);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Delete user error:", err);
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
