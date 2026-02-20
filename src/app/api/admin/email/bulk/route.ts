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

    const { subject, body, target } = await req.json();
    // target: "all" | "free" | "pro" | "premium" | "active" | "inactive"
    if (!subject || !body || !target) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let query = service.from("profiles").select("id, email").eq("is_blocked", false);
    
    if (target === "free") query = query.eq("plan_id", "free");
    else if (target === "pro") query = query.eq("plan_id", "pro");
    else if (target === "premium") query = query.eq("plan_id", "premium");
    else if (target === "active") query = query.eq("subscription_status", "active");
    // "all" = no additional filter

    const { data: recipients } = await query;
    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: "No recipients found" }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.EMAIL_FROM || "FXSynapse AI <noreply@fxsynapse.co.za>";
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      let status: "sent" | "failed" = "sent";

      if (resendKey) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: fromEmail,
              to: [recipient.email],
              subject,
              html: buildBulkEmailHtml(subject, body),
            }),
          });
          if (!res.ok) status = "failed";
        } catch {
          status = "failed";
        }
      }

      await service.from("email_logs").insert({
        recipient_id: recipient.id,
        recipient_email: recipient.email,
        subject,
        body,
        sent_by: user.id,
        status,
      });

      if (status === "sent") sent++;
      else failed++;
    }

    return NextResponse.json({ success: true, sent, failed, total: recipients.length });
  } catch (err) {
    console.error("Bulk email error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function buildBulkEmailHtml(subject: string, body: string) {
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
  <div style="text-align:center;margin-top:24px">
    <a href="https://fxsynapse.co.za/dashboard" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#00e5a0,#00b87d);color:#0a0b0f;font-weight:700;text-decoration:none;border-radius:10px;font-size:14px">Open FXSynapse</a>
  </div>
  <div style="text-align:center;margin-top:32px;font-size:12px;color:rgba(255,255,255,0.25)">
    © ${new Date().getFullYear()} FXSynapse AI — Chart Intelligence Engine
  </div>
</div>
</body>
</html>`;
}
