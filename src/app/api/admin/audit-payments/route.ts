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

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) return NextResponse.json({ error: "YOCO_SECRET_KEY not configured" }, { status: 500 });

    const { fix } = await req.json().catch(() => ({ fix: false }));

    // Get ALL completed payments
    const { data: completed } = await service
      .from("payments")
      .select("*")
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (!completed || completed.length === 0) {
      return NextResponse.json({ message: "No completed payments found", total: 0 });
    }

    let reallyPaid = 0;
    let notPaid = 0;
    let errors = 0;
    const results: Array<{
      id: string;
      email: string;
      plan: string;
      amount: number;
      yocoStatus: string;
      verdict: string;
    }> = [];

    for (const payment of completed) {
      const checkoutId = payment.yoco_checkout_id;
      if (!checkoutId) {
        results.push({
          id: payment.id, email: "?", plan: payment.plan_id || "topup",
          amount: (payment.amount_cents || 0) / 100, yocoStatus: "no_checkout_id", verdict: "unknown",
        });
        continue;
      }

      try {
        const yocoRes = await fetch(`https://payments.yoco.com/api/checkouts/${checkoutId}`, {
          headers: { Authorization: `Bearer ${yocoKey}` },
        });

        if (!yocoRes.ok) {
          errors++;
          results.push({
            id: payment.id, email: "?", plan: payment.plan_id || "topup",
            amount: (payment.amount_cents || 0) / 100, yocoStatus: `api_error_${yocoRes.status}`, verdict: "error",
          });
          continue;
        }

        const checkout = await yocoRes.json();
        const isPaid = checkout.status === "completed" || !!checkout.paymentId;

        const { data: profile } = await service
          .from("profiles")
          .select("email, display_name")
          .eq("id", payment.user_id)
          .single();

        if (isPaid) {
          reallyPaid++;
          results.push({
            id: payment.id, email: profile?.email || "?", plan: payment.plan_id || "topup",
            amount: (payment.amount_cents || 0) / 100, yocoStatus: checkout.status, verdict: "REAL",
          });
        } else {
          notPaid++;

          if (fix) {
            await service.from("payments").update({
              status: "failed",
            }).eq("id", payment.id);

            if (payment.type === "subscription") {
              await service.from("profiles").update({
                plan_id: "free",
                subscription_status: "none",
                subscription_expires_at: null,
              }).eq("id", payment.user_id);
            }
          }

          results.push({
            id: payment.id, email: profile?.email || "?", plan: payment.plan_id || "topup",
            amount: (payment.amount_cents || 0) / 100, yocoStatus: checkout.status,
            verdict: fix ? "FAKE_REVERTED" : "FAKE",
          });
        }

        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        errors++;
        results.push({
          id: payment.id, email: "?", plan: payment.plan_id || "topup",
          amount: (payment.amount_cents || 0) / 100, yocoStatus: String(err), verdict: "error",
        });
      }
    }

    const realRevenue = results.filter(r => r.verdict === "REAL").reduce((sum, r) => sum + r.amount, 0);
    const fakeRevenue = results.filter(r => r.verdict.includes("FAKE")).reduce((sum, r) => sum + r.amount, 0);

    return NextResponse.json({
      total: completed.length, reallyPaid, notPaid, errors,
      realRevenue: `R${realRevenue}`, fakeRevenue: `R${fakeRevenue}`, fixed: fix, results,
    });
  } catch (err) {
    console.error("[AUDIT] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
