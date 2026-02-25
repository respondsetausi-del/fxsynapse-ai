import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || req.cookies.get("sb-access-token")?.value;
  
  const { data: { user } } = token
    ? await supabase.auth.getUser(token)
    : await createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ).auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return user.id;
}

// GET — list all conversations or messages for a specific affiliate
export async function GET(req: NextRequest) {
  try {
    const adminId = await isAdmin(req);
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const affiliateId = req.nextUrl.searchParams.get("affiliate_id");

    if (affiliateId) {
      // Get messages for specific affiliate
      const { data: messages } = await supabase
        .from("affiliate_messages")
        .select("id, sender_role, message, read_at, created_at")
        .eq("affiliate_id", affiliateId)
        .order("created_at", { ascending: true });

      // Mark affiliate messages as read by admin
      await supabase
        .from("affiliate_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("affiliate_id", affiliateId)
        .eq("sender_role", "affiliate")
        .is("read_at", null);

      return NextResponse.json({ messages: messages || [] });
    }

    // List all conversations — get affiliates that have messages
    const { data: affiliates } = await supabase
      .from("affiliates")
      .select("id, ref_code, user_id, status, profiles!affiliates_user_id_fkey(email, full_name)")
      .eq("status", "active");

    // Get latest message and unread count for each affiliate
    const conversations = [];
    for (const aff of affiliates || []) {
      const { data: msgs } = await supabase
        .from("affiliate_messages")
        .select("id, sender_role, message, read_at, created_at")
        .eq("affiliate_id", aff.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const { count } = await supabase
        .from("affiliate_messages")
        .select("id", { count: "exact", head: true })
        .eq("affiliate_id", aff.id)
        .eq("sender_role", "affiliate")
        .is("read_at", null);

      if (msgs && msgs.length > 0) {
        const profile = Array.isArray(aff.profiles) ? aff.profiles[0] : aff.profiles;
        conversations.push({
          affiliate_id: aff.id,
          ref_code: aff.ref_code,
          email: profile?.email || "",
          full_name: profile?.full_name || "",
          last_message: msgs[0],
          unread_count: count || 0,
        });
      }
    }

    // Sort by latest message, unread first
    conversations.sort((a, b) => {
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
    });

    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    console.error("Admin chat GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST — send message as admin to specific affiliate
export async function POST(req: NextRequest) {
  try {
    const adminId = await isAdmin(req);
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { affiliate_id, message } = await req.json();
    if (!affiliate_id || !message?.trim()) {
      return NextResponse.json({ error: "affiliate_id and message required" }, { status: 400 });
    }

    // Verify affiliate exists
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("id")
      .eq("id", affiliate_id)
      .single();

    if (!affiliate) return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });

    // Insert message
    const { data: msg, error } = await supabase
      .from("affiliate_messages")
      .insert({
        affiliate_id,
        sender_role: "admin",
        sender_id: adminId,
        message: message.trim(),
      })
      .select("id, sender_role, message, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ message: msg });
  } catch (err: unknown) {
    console.error("Admin chat POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
