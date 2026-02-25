import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getTemplate } from "@/lib/email-templates";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { subject, body, target, templateId } = await req.json();
    
    // Use template if provided, otherwise use subject/body
    let emailSubject = subject;
    let emailHtml: string;

    if (templateId) {
      const template = getTemplate(templateId);
      if (!template) return NextResponse.json({ error: "Template not found" }, { status: 400 });
      emailSubject = template.subject;
      emailHtml = template.html;
    } else {
      if (!subject || !body) return NextResponse.json({ error: "Missing subject/body or templateId" }, { status: 400 });
      emailHtml = `
        <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 20px;">${subject}</h1>
        <div style="font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">${body.replace(/\n/g, "<br>")}</div>
        <div style="text-align:center;margin-top:24px;">
          <a href="https://fxsynapse-ai.vercel.app/dashboard" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#00e5a0,#00b87d);color:#0a0b0f;font-weight:700;text-decoration:none;border-radius:10px;font-size:14px;">Open FXSynapse</a>
        </div>`;
    }

    if (!target) return NextResponse.json({ error: "Missing target" }, { status: 400 });

    let query = service.from("profiles").select("id, email").eq("is_blocked", false);
    
    if (target === "starter") query = query.eq("plan_id", "starter");
    else if (target === "free") query = query.eq("plan_id", "free");
    else if (target === "pro") query = query.eq("plan_id", "pro");
    else if (target === "premium") query = query.eq("plan_id", "premium");
    else if (target === "active") query = query.eq("subscription_status", "active");
    else if (target === "never_scanned") {
      // Users who signed up but never scanned
      query = query.eq("plan_id", "free").lte("credits_balance", 1);
    }

    const { data: recipients } = await query;
    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: "No recipients found for target: " + target }, { status: 400 });
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      if (!recipient.email) continue;
      const ok = await sendEmail(recipient.email, emailSubject, emailHtml);
      const status = ok ? "sent" : "failed";

      await service.from("email_logs").insert({
        recipient_id: recipient.id,
        recipient_email: recipient.email,
        subject: emailSubject,
        body: templateId ? `[Template: ${templateId}]` : body,
        sent_by: user.id,
        status,
      });

      if (ok) sent++;
      else failed++;
      await new Promise(r => setTimeout(r, 100));
    }

    return NextResponse.json({ success: true, sent, failed, total: recipients.length });
  } catch (err) {
    console.error("Bulk email error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
