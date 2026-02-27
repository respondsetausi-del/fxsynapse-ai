import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import { activatePayment } from "@/lib/payment-activate";

/**
 * Yoco Webhook — Layer 1 (instant)
 * 
 * This is the primary activation path. Yoco sends payment.succeeded
 * events here. We match the payment record and activate via shared function.
 */

function getService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[WEBHOOK] No YOCO_WEBHOOK_SECRET set — skipping verification");
    return true;
  }
  if (!signature) {
    console.warn("[WEBHOOK] No signature header in request");
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  return signature === expected;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("webhook-signature") || req.headers.get("x-webhook-signature");

  if (!verifySignature(rawBody, signature)) {
    console.error("[WEBHOOK] Invalid signature — rejecting");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.type;
    const payload = body.payload || body.data || {};

    console.log(`[WEBHOOK] Event: ${eventType}`, JSON.stringify(body, null, 2));

    // Only process successful payments
    if (eventType !== "payment.succeeded") {
      console.log(`[WEBHOOK] Ignoring event type: ${eventType}`);
      return NextResponse.json({ received: true });
    }

    const supabase = getService();

    // Extract identifiers
    const checkoutId = payload.checkoutId || payload.checkout_id || payload.metadata?.checkoutId;
    const metadata = payload.metadata || {};
    const userId = metadata.userId;

    console.log(`[WEBHOOK] checkoutId=${checkoutId}, userId=${userId}`);

    // ─── Find matching payment record ───

    let payment = null;

    // Strategy 1: Match by checkoutId (most reliable)
    if (checkoutId) {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("yoco_checkout_id", checkoutId)
        .in("status", ["pending", "completed"])
        .single();
      payment = data;
    }

    // Strategy 2: Match by userId + pending (fallback)
    if (!payment && userId) {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      payment = data;
    }

    if (!payment) {
      console.warn("[WEBHOOK] No matching payment found", { checkoutId, userId });
      return NextResponse.json({ received: true, processed: false, reason: "no_matching_payment" });
    }

    // ─── Activate via shared function (idempotent) ───
    const result = await activatePayment(payment.id, "webhook");

    console.log(`[WEBHOOK] Result:`, result);
    return NextResponse.json({ received: true, processed: true, ...result });

  } catch (error) {
    console.error("[WEBHOOK] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
