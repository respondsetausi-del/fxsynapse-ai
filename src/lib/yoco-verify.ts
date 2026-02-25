/**
 * Yoco Payment Verification Utility
 * 
 * CRITICAL: Yoco's checkout.status === "completed" does NOT mean the payment succeeded.
 * A checkout can be "completed" with a DECLINED card. The paymentId also exists on 
 * declined payments. We MUST verify the actual payment object's status.
 * 
 * Verification chain:
 * 1. Get checkout → extract paymentId
 * 2. Get payment by paymentId → check payment.status
 * 3. Only "successful" status = real money collected
 */

export interface YocoVerifyResult {
  paid: boolean;
  checkoutStatus: string;
  paymentStatus: string | null;
  paymentId: string | null;
  details: string;
  rawCheckout?: Record<string, unknown>;
  rawPayment?: Record<string, unknown>;
}

export async function verifyYocoPayment(
  checkoutId: string,
  yocoKey: string,
  includeRaw = false
): Promise<YocoVerifyResult> {
  // Step 1: Get checkout details
  const checkoutRes = await fetch(
    `https://payments.yoco.com/api/checkouts/${checkoutId}`,
    { headers: { Authorization: `Bearer ${yocoKey}` } }
  );

  if (!checkoutRes.ok) {
    return {
      paid: false,
      checkoutStatus: `api_error_${checkoutRes.status}`,
      paymentStatus: null,
      paymentId: null,
      details: `Checkout API returned ${checkoutRes.status}`,
    };
  }

  const checkout = await checkoutRes.json();
  const checkoutStatus = checkout.status || "unknown";

  // Extract paymentId from various possible locations
  const paymentId =
    checkout.paymentId ||
    checkout.payment?.id ||
    checkout.payments?.[0]?.id ||
    null;

  // No paymentId = user never submitted card = definitely not paid
  if (!paymentId) {
    return {
      paid: false,
      checkoutStatus,
      paymentStatus: null,
      paymentId: null,
      details: `No paymentId on checkout (status: ${checkoutStatus})`,
      ...(includeRaw ? { rawCheckout: checkout } : {}),
    };
  }

  // Step 2: Verify the actual payment status
  try {
    const paymentRes = await fetch(
      `https://payments.yoco.com/api/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${yocoKey}` } }
    );

    if (paymentRes.ok) {
      const payment = await paymentRes.json();
      const paymentStatus = (payment.status || "unknown").toLowerCase();

      // Only these statuses mean money was actually collected
      const successStatuses = ["successful", "approved", "settled", "captured"];
      const isPaid = successStatuses.includes(paymentStatus);

      return {
        paid: isPaid,
        checkoutStatus,
        paymentStatus,
        paymentId,
        details: isPaid
          ? `✅ Payment ${paymentId} status: ${paymentStatus}`
          : `❌ Payment ${paymentId} status: ${paymentStatus} (not charged)`,
        ...(includeRaw ? { rawCheckout: checkout, rawPayment: payment } : {}),
      };
    }

    // Payment API failed — try alternative verification methods
    // Check if checkout has embedded payment status
    const embeddedStatus = (
      checkout.payment?.status ||
      checkout.payments?.[0]?.status ||
      ""
    ).toLowerCase();

    if (embeddedStatus) {
      const successStatuses = ["successful", "approved", "settled", "captured"];
      const isPaid = successStatuses.includes(embeddedStatus);
      return {
        paid: isPaid,
        checkoutStatus,
        paymentStatus: embeddedStatus,
        paymentId,
        details: `Payment API ${paymentRes.status}, embedded status: ${embeddedStatus}`,
        ...(includeRaw ? { rawCheckout: checkout } : {}),
      };
    }

    // Cannot verify — default to NOT paid (conservative)
    return {
      paid: false,
      checkoutStatus,
      paymentStatus: `api_error_${paymentRes.status}`,
      paymentId,
      details: `Cannot verify payment ${paymentId} (API ${paymentRes.status}) — defaulting to not paid`,
      ...(includeRaw ? { rawCheckout: checkout } : {}),
    };
  } catch (err) {
    // Network error on payment check — default to NOT paid
    return {
      paid: false,
      checkoutStatus,
      paymentStatus: "network_error",
      paymentId,
      details: `Network error verifying payment: ${err}`,
      ...(includeRaw ? { rawCheckout: checkout } : {}),
    };
  }
}
