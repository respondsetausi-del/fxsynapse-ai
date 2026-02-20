import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId, subject, body, email } = await req.json();
    if (!userId || !subject || !body || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM || "FXSynapse AI <noreply@fxsynapse.co.za>";
    let status: "sent" | "failed" = "sent";

    if (resendKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject,
            html: buildEmailHtml(subject, body),
          }),
        });
        if (!res.ok) {
          console.error("Resend error:", await res.text());
          status = "failed";
        }
      } catch (err) {
        console.error("Resend send error:", err);
        status = "failed";
      }
    } else {
      // No Resend key - log only (dev mode)
      console.log(`[EMAIL-DEV] To: ${email} | Subject: ${subject} | Body: ${body}`);
      status = "sent";
    }

    // Log in DB
    await service.from("email_logs").insert({
      recipient_id: userId,
      recipient_email: email,
      subject,
      body,
      sent_by: user.id,
      status,
    });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// GET email logs
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

    const { data: logs, count, error } = await service
      .from("email_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return NextResponse.json({ logs: logs || [], total: count || 0, page, limit });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function buildEmailHtml(subject: string, body: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0b0f;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:40px 20px">
  <div style="text-align:center;margin-bottom:32px">
    <div style="display:inline-block;width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#00e5a0,#00b87d);line-height:40px;font-size:18px;color:#0a0b0f;font-weight:bold">⚡</div>
    <div style="margin-top:8px;font-size:18px;font-weight:700;color:#fff;letter-spacing:0.5px">FXSynapse AI</div>
  </div>
  <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px">
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#fff">${subject}</h1>
    <div style="font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7)">${body.replace(/\n/g, "<br>")}</div>
  </div>
  <div style="text-align:center;margin-top:32px;font-size:12px;color:rgba(255,255,255,0.25)">
    © ${new Date().getFullYear()} FXSynapse AI — Chart Intelligence Engine
  </div>
</div>
</body>
</html>`;
}
