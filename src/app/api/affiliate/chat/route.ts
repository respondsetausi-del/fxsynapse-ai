import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — fetch messages for current affiliate
// POST — send message as affiliate
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || req.cookies.get("sb-access-token")?.value;

    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        ).auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get affiliate
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 403 });

    // Get messages
    const { data: messages } = await supabase
      .from("affiliate_messages")
      .select("id, sender_role, message, read_at, created_at")
      .eq("affiliate_id", affiliate.id)
      .order("created_at", { ascending: true });

    // Mark admin messages as read
    await supabase
      .from("affiliate_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("affiliate_id", affiliate.id)
      .eq("sender_role", "admin")
      .is("read_at", null);

    // Get unread count (affiliate's unread = admin messages not yet read)
    const unread = (messages || []).filter(m => m.sender_role === "admin" && !m.read_at).length;

    return NextResponse.json({ messages: messages || [], unread });
  } catch (err: unknown) {
    console.error("Affiliate chat GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || req.cookies.get("sb-access-token")?.value;

    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        ).auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { message } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

    // Get affiliate
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 403 });

    // Insert message
    const { data: msg, error } = await supabase
      .from("affiliate_messages")
      .insert({
        affiliate_id: affiliate.id,
        sender_role: "affiliate",
        sender_id: user.id,
        message: message.trim(),
      })
      .select("id, sender_role, message, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ message: msg });
  } catch (err: unknown) {
    console.error("Affiliate chat POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
