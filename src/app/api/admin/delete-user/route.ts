import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Delete from related tables first (cascade should handle most, but be explicit)
    // Affiliate earnings, payouts, referrals, messages
    const { data: affiliate } = await supabase.from("affiliates").select("id").eq("user_id", userId).single();
    if (affiliate) {
      await supabase.from("affiliate_messages").delete().eq("affiliate_id", affiliate.id);
      await supabase.from("affiliate_payouts").delete().eq("affiliate_id", affiliate.id);
      await supabase.from("affiliate_earnings").delete().eq("affiliate_id", affiliate.id);
      await supabase.from("referrals").delete().eq("affiliate_id", affiliate.id);
      await supabase.from("affiliates").delete().eq("id", affiliate.id);
    }

    // Delete referral where user was referred
    await supabase.from("referrals").delete().eq("referred_user_id", userId);

    // Delete scans, payments, ratings, chat messages
    await supabase.from("scans").delete().eq("user_id", userId);
    await supabase.from("payments").delete().eq("user_id", userId);
    await supabase.from("ratings").delete().eq("user_id", userId);
    await supabase.from("chat_messages").delete().eq("user_id", userId);

    // Delete profile
    await supabase.from("profiles").delete().eq("id", userId);

    // Delete auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) console.error("Auth delete error:", authError);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Delete user error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
