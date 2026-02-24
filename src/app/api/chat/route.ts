import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendChatNotificationToAdmin } from "@/lib/email";

function getService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST - send a message
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { visitor_id, name, email, message, sender } = body;

    if (!visitor_id || !message) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = getService();

    // Upsert the chat thread
    const { data: thread } = await supabase
      .from("chat_threads")
      .upsert({
        visitor_id,
        name: name || null,
        email: email || null,
        last_message: message.substring(0, 100),
        last_message_at: new Date().toISOString(),
        status: sender === "admin" ? "answered" : "waiting",
      }, { onConflict: "visitor_id" })
      .select()
      .single();

    // Insert the message
    await supabase.from("chat_messages").insert({
      thread_id: thread?.id || visitor_id,
      visitor_id,
      sender: sender || "visitor",
      message,
      name: name || null,
    });

    // Email admin when a visitor sends a message
    if (sender !== "admin") {
      sendChatNotificationToAdmin(email || name || visitor_id, message).catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}

// GET - fetch messages for a thread
export async function GET(req: NextRequest) {
  const visitor_id = req.nextUrl.searchParams.get("visitor_id");
  const admin = req.nextUrl.searchParams.get("admin");

  const supabase = getService();

  if (admin === "1") {
    // Admin: get all threads
    const { data: threads } = await supabase
      .from("chat_threads")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(50);

    return NextResponse.json({ threads: threads || [] });
  }

  if (!visitor_id) {
    return NextResponse.json({ error: "Missing visitor_id" }, { status: 400 });
  }

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("visitor_id", visitor_id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ messages: messages || [] });
}
