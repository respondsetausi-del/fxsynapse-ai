import { NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) return NextResponse.json({ error: "YOCO_SECRET_KEY not configured" }, { status: 500 });

    const webhookUrl = "https://fxsynapse-ai.vercel.app/api/payments/webhook";

    // First check existing webhooks
    const listRes = await fetch("https://payments.yoco.com/api/webhooks", {
      headers: { Authorization: `Bearer ${yocoKey}` },
    });

    if (listRes.ok) {
      const existing = await listRes.json();
      const webhooks = existing?.results || existing || [];
      const arr = Array.isArray(webhooks) ? webhooks : [];
      const alreadyRegistered = arr.find((w: { url: string }) => w.url === webhookUrl);
      if (alreadyRegistered) {
        return NextResponse.json({ 
          success: true,
          message: "Webhook already registered ✅", 
          webhook: alreadyRegistered 
        });
      }
    }

    // Register new webhook
    const res = await fetch("https://payments.yoco.com/api/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${yocoKey}`,
      },
      body: JSON.stringify({
        name: "FXSynapse Payments",
        url: webhookUrl,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[WEBHOOK-REGISTER] Yoco error:", data);
      return NextResponse.json({ error: "Failed to register webhook", details: data }, { status: 502 });
    }

    // Save webhook secret if provided
    if (data.secret) {
      console.log("[WEBHOOK-REGISTER] Webhook secret:", data.secret);
    }

    console.log("[WEBHOOK-REGISTER] ✅ Webhook registered:", data);
    return NextResponse.json({ success: true, webhook: data });
  } catch (err) {
    console.error("[WEBHOOK-REGISTER] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
