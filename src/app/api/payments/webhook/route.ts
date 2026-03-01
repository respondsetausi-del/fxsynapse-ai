import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { activatePayment } from "@/lib/payment-activate";

/**
 * Yoco Webhook — Layer 1 (instant activation)
 *
 * RULES:
 *   1. REQUIRE YOCO_WEBHOOK_SECRET — reject everything if missing
 *   2. Verify HMAC-SHA256 signature with timing-safe comparison
 *   3. Only process payment.succeeded events
 *   4. Match ONLY by yoco_checkout_id — NO fallback by userId
 *   5. ALWAYS return 200 (even on error) to prevent Yoco retries
 *   6. activatePayment() handles idempotency atomically
 */

function getService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function log(level: "info" | "warn" | "error", action: string, data: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), sys: "WEBHOOK", action, ...data };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.YOCO_WEBHOOK_SECRET;

  // HARD BLOCK if secret not configured
  if (!secret) {
    log("error", "NO_WEBHOOK_SECRET", { message: "YOCO_WEBHOOK_SECRET env var missing — all webhooks rejected" });
    return false;
  }

  if (!signature) {
    log("warn", "NO_SIGNATURE_HEADER", {});
    return false;
  }

  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
    return timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("webhook-signature") || req.headers.get("x-webhook-signature");

  // ─── Signature verification ───
  if (!verifySignature(rawBody, signature)) {
    log("error", "SIGNATURE_INVALID", { hasSignature: !!signature });
    // Return 401 for invalid signatures — Yoco should NOT retry these
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.type;
    const payload = body.payload || body.data || {};

    log("info", "EVENT_RECEIVED", { eventType, checkoutId: payload.checkoutId || payload.checkout_id });

    // ─── Only process payment.succeeded ───
    if (eventType !== "payment.succeeded") {
      log("info", "EVENT_IGNORED", { eventType });
      return NextResponse.json({ received: true, processed: false });
    }

    // ─── Extract checkout ID (the ONLY matching key) ───
    const checkoutId = payload.checkoutId || payload.checkout_id || payload.metadata?.checkoutId;

    if (!checkoutId) {
      log("error", "NO_CHECKOUT_ID", { payload: JSON.stringify(payload).slice(0, 500) });
      return NextResponse.json({ received: true, processed: false, reason: "no_checkout_id_in_payload" });
    }

    // ─── Find payment by checkout ID ONLY (no fallback) ───
    const supabase = getService();
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("yoco_checkout_id", checkoutId)
      .single();

    if (error || !payment) {
      log("error", "PAYMENT_NOT_FOUND", { checkoutId });
      return NextResponse.json({ received: true, processed: false, reason: "no_matching_payment" });
    }

    // ─── Activate (atomic + idempotent) ───
    const result = await activatePayment(payment.id, "webhook");

    log("info", "ACTIVATION_RESULT", {
      paymentId: payment.id,
      success: result.success,
      alreadyCompleted: result.alreadyCompleted,
      checkoutId,
    });

    return NextResponse.json({ received: true, processed: true, ...result });

  } catch (error) {
    log("error", "WEBHOOK_EXCEPTION", { error: String(error) });
    // ALWAYS 200 — never trigger Yoco retries after we've read the payload
    return NextResponse.json({ received: true, error: "internal_error" });
  }
}
