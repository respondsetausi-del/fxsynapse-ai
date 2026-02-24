import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBulkEmail, sendFreeCreditsEmail } from "@/lib/email";

function getService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/admin/bulk-email
// Body: { action: "send_credits" | "send_marketing", credits?: number, subject?: string, html?: string, userIds?: string[], all?: boolean }
export async function POST(req: NextRequest) {
  try {
    const supabase = getService();

    // Auth check - must be admin
    const authHeader = req.headers.get("authorization");
    const adminKey = process.env.ADMIN_API_KEY;
    
    // Check via cookie auth too
    let isAdmin = false;
    if (authHeader === `Bearer ${adminKey}`) {
      isAdmin = true;
    } else {
      // Try cookie-based auth
      const { createServerClient } = await import("@supabase/ssr");
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
      );
      const { data: { user } } = await authSupabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        if (profile?.role === "admin") isAdmin = true;
      }
    }

    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { action, credits, subject, html, userIds, all } = body;

    // Get target users
    let targetEmails: { id: string; email: string }[] = [];

    if (all) {
      const { data } = await supabase.from("profiles").select("id, email").not("email", "is", null);
      targetEmails = (data || []).filter(u => u.email);
    } else if (userIds && userIds.length > 0) {
      const { data } = await supabase.from("profiles").select("id, email").in("id", userIds);
      targetEmails = (data || []).filter(u => u.email);
    } else {
      return NextResponse.json({ error: "Specify userIds array or all: true" }, { status: 400 });
    }

    if (targetEmails.length === 0) {
      return NextResponse.json({ error: "No users found" }, { status: 404 });
    }

    // ── ACTION: Send free credits + email ──
    if (action === "send_credits") {
      const creditAmount = credits || 1;
      let credited = 0;

      for (const user of targetEmails) {
        // Add credits
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits_balance")
          .eq("id", user.id)
          .single();

        if (profile) {
          await supabase
            .from("profiles")
            .update({ credits_balance: (profile.credits_balance || 0) + creditAmount })
            .eq("id", user.id);

          await supabase.from("credit_transactions").insert({
            user_id: user.id,
            amount: creditAmount,
            type: "admin_grant",
            description: `Bulk marketing: ${creditAmount} free scan(s)`,
          });

          credited++;
        }

        // Send email
        await sendFreeCreditsEmail(user.email, creditAmount);
        await new Promise(r => setTimeout(r, 100)); // rate limit
      }

      return NextResponse.json({
        success: true,
        action: "send_credits",
        credited,
        emailed: targetEmails.length,
        credits: creditAmount,
      });
    }

    // ── ACTION: Send marketing email (custom) ──
    if (action === "send_marketing") {
      if (!subject || !html) {
        return NextResponse.json({ error: "subject and html required" }, { status: 400 });
      }

      const result = await sendBulkEmail(
        targetEmails.map(u => u.email),
        subject,
        html
      );

      return NextResponse.json({
        success: true,
        action: "send_marketing",
        ...result,
        total: targetEmails.length,
      });
    }

    return NextResponse.json({ error: "Invalid action. Use send_credits or send_marketing" }, { status: 400 });

  } catch (error) {
    console.error("[BULK-EMAIL] Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
