import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId, subject, body, email, templateId } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    let emailSubject = subject;
    let emailHtml: string;

    if (templateId) {
      const { getTemplate } = await import("@/lib/email-templates");
      const template = getTemplate(templateId);
      if (!template) return NextResponse.json({ error: "Template not found" }, { status: 400 });
      emailSubject = template.subject;
      emailHtml = template.html;
    } else {
      if (!subject || !body) return NextResponse.json({ error: "Missing subject/body or templateId" }, { status: 400 });
      emailHtml = `
        <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 20px;">${subject}</h1>
        <div style="font-size:15px;line-height:1.7;color:rgba(255,255,255,0.7);">${body.replace(/\n/g, "<br>")}</div>`;
    }

    const sent = await sendEmail(email, emailSubject, emailHtml);
    const status = sent ? "sent" : "failed";

    // Log in DB
    const logEntry: Record<string, unknown> = {
      recipient_email: email,
      subject,
      body,
      sent_by: user.id,
      status,
    };
    if (userId) logEntry.recipient_id = userId;
    await service.from("email_logs").insert(logEntry);

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
