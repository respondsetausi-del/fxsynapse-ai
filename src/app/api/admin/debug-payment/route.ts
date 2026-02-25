import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";
import { verifyYocoPayment } from "@/lib/yoco-verify";

/**
 * Debug endpoint: Shows raw Yoco API response for checkouts
 * GET /api/admin/debug-payment?all=true  (checks first 10 completed)
 * GET /api/admin/debug-payment?checkoutId=ch_xxx
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
      const checkoutRes = await fetch(
        `https://payments.yoco.com/api/checkouts/${checkoutId}`,
        { headers: { Authorization: `Bearer ${yocoKey}` } }
      );
      const rawCheckout = checkoutRes.ok ? await checkoutRes.json() : { error: checkoutRes.status };
      const verification = await verifyYocoPayment(checkoutId, yocoKey);
      return NextResponse.json({ checkoutId, rawCheckout, verification });
    }

    if (all) {
      const { data: payments } = await service
        .from("payments")
        .select("*")
        .in("status", ["completed", "pending"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (!payments?.length) return NextResponse.json({ message: "No payments" });

      const debugResults = [];
      for (const p of payments) {
        if (!p.yoco_checkout_id) continue;
        
        const checkoutRes = await fetch(
          `https://payments.yoco.com/api/checkouts/${p.yoco_checkout_id}`,
          { headers: { Authorization: `Bearer ${yocoKey}` } }
        );
        const rawCheckout = checkoutRes.ok ? await checkoutRes.json() : { error: checkoutRes.status };
        const { data: profile } = await service.from("profiles").select("email").eq("id", p.user_id).single();
        const verification = await verifyYocoPayment(p.yoco_checkout_id, yocoKey);

        debugResults.push({
          email: profile?.email,
          amount: `R${(p.amount_cents || 0) / 100}`,
          plan: p.plan_id,
          dbStatus: p.status,
          yocoCheckoutStatus: rawCheckout.status,
          hasPaymentId: !!rawCheckout.paymentId,
          verification,
        });

        await new Promise(r => setTimeout(r, 200));
      }

      return NextResponse.json({ count: debugResults.length, results: debugResults });
    }

    return NextResponse.json({ usage: "?all=true or ?checkoutId=ch_xxx" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
