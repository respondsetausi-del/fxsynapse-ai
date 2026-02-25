import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Safe delete — won't throw if table doesn't exist
async function safeDelete(table: string, column: string, value: string) {
  try {
    await supabase.from(table).delete().eq(column, value);
  } catch (e) {
    console.log(`Skip delete ${table}: ${e}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || req.cookies.get("sb-access-token")?.value;

    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        ).auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") return NextResponse.json({ error: "Not admin" }, { status: 403 });

    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    // Prevent self-delete
    if (userId === user.id) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

    // 1. Handle affiliate data (deepest foreign keys first)
    const { data: affiliate } = await supabase.from("affiliates").select("id").eq("user_id", userId).maybeSingle();
    if (affiliate) {
      await safeDelete("affiliate_messages", "affiliate_id", affiliate.id);
      await safeDelete("affiliate_payouts", "affiliate_id", affiliate.id);
      await safeDelete("affiliate_earnings", "affiliate_id", affiliate.id);
      await safeDelete("referrals", "affiliate_id", affiliate.id);
      await safeDelete("affiliates", "id", affiliate.id);
    }

    // 2. Delete referral where this user was the referred person
    await safeDelete("referrals", "referred_user_id", userId);

    // 3. Delete all user-related data
    await safeDelete("scan_ratings", "user_id", userId);
    await safeDelete("ratings", "user_id", userId);
    await safeDelete("scans", "user_id", userId);
    await safeDelete("credit_transactions", "user_id", userId);
    await safeDelete("chat_messages", "user_id", userId);
    await safeDelete("email_logs", "user_id", userId);
    await safeDelete("visitor_events", "user_id", userId);
    await safeDelete("payments", "user_id", userId);

    // 4. Delete profile
    const { error: profileError } = await supabase.from("profiles").delete().eq("id", userId);
    if (profileError) {
      console.error("Profile delete error:", profileError);
      return NextResponse.json({ error: `Failed to delete profile: ${profileError.message}` }, { status: 500 });
    }

    // 5. Delete auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("Auth delete error:", authError);
      // Profile already gone — auth delete fail is not critical
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Delete user error:", err);
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }
}
