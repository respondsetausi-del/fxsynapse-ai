import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getTemplate } from "@/lib/email-templates";

/**
 * Send payment follow-up email to a specific user
 * POST /api/admin/payment-followup
 * Body: { paymentId: "...", templateId?: "payment_issue" | "payment_retry" }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { paymentId, templateId = "payment_issue" } = await req.json();
    if (!paymentId) return NextResponse.json({ error: "paymentId required" }, { status: 400 });

    // Get payment and user info
    const { data: payment } = await service
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    const { data: profile } = await service
      .from("profiles")
      .select("email, display_name")
      .eq("id", payment.user_id)
      .single();

    if (!profile?.email) return NextResponse.json({ error: "User email not found" }, { status: 404 });

    // Get template
    const template = getTemplate(templateId);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 400 });

    // Send email
    const sent = await sendEmail(profile.email, template.subject, template.html);

    // Log it
    await service.from("email_logs").insert({
      recipient_id: payment.user_id,
      recipient_email: profile.email,
      subject: template.subject,
      body: `[Template: ${template.name}]`,
      sent_by: user.id,
      status: sent ? "sent" : "failed",
    });

    return NextResponse.json({
      success: sent,
      email: profile.email,
      template: template.name,
      status: sent ? "sent" : "failed",
    });
  } catch (err) {
    console.error("[PAYMENT-FOLLOWUP] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
