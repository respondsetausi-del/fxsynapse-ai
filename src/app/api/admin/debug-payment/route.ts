import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { verifyYocoPayment } from "@/lib/yoco-verify";

/**
 * Debug endpoint: Shows raw Yoco API response for a checkout
 * GET /api/admin/debug-payment?checkoutId=ch_xxx
 * GET /api/admin/debug-payment?all=true  (checks first 5 completed)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) return NextResponse.json({ error: "YOCO_SECRET_KEY not configured" }, { status: 500 });

    const url = new URL(req.url);
    const checkoutId = url.searchParams.get("checkoutId");
    const all = url.searchParams.get("all") === "true";

    if (checkoutId) {
      // Debug single checkout
      const verification = await verifyYocoPayment(checkoutId, yocoKey, true);
      return NextResponse.json({ checkoutId, verification });
    }

    if (all) {
      // Debug first 5 completed payments
      const { data: payments } = await service
        .from("payments")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!payments?.length) {
        return NextResponse.json({ message: "No completed payments" });
      }

      const debugResults = [];
      for (const p of payments) {
        if (!p.yoco_checkout_id) continue;
        
        // Get raw checkout response
        const checkoutRes = await fetch(
          `https://payments.yoco.com/api/checkouts/${p.yoco_checkout_id}`,
          { headers: { Authorization: `Bearer ${yocoKey}` } }
        );
        const rawCheckout = checkoutRes.ok ? await checkoutRes.json() : { error: checkoutRes.status };

        // Get profile
        const { data: profile } = await service.from("profiles").select("email").eq("id", p.user_id).single();

        // Try payment API if paymentId exists
        const paymentId = rawCheckout.paymentId || rawCheckout.payment?.id;
        let rawPayment = null;
        if (paymentId) {
          const paymentRes = await fetch(
            `https://payments.yoco.com/api/payments/${paymentId}`,
            { headers: { Authorization: `Bearer ${yocoKey}` } }
          );
          rawPayment = paymentRes.ok ? await paymentRes.json() : { error: paymentRes.status };
        }

        const verification = await verifyYocoPayment(p.yoco_checkout_id, yocoKey);

        debugResults.push({
          email: profile?.email,
          amount: `R${(p.amount_cents || 0) / 100}`,
          plan: p.plan_id,
          dbStatus: p.status,
          checkoutId: p.yoco_checkout_id,
          rawCheckout,
          rawPayment,
          verification: {
            paid: verification.paid,
            checkoutStatus: verification.checkoutStatus,
            paymentStatus: verification.paymentStatus,
            details: verification.details,
          },
        });

        await new Promise(r => setTimeout(r, 300));
      }

      return NextResponse.json({ count: debugResults.length, results: debugResults });
    }

    return NextResponse.json({ 
      usage: "GET /api/admin/debug-payment?checkoutId=ch_xxx OR ?all=true",
    });
  } catch (err) {
    console.error("[DEBUG-PAYMENT] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
