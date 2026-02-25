/**
 * Yoco Payment Verification Utility
 * 
 * CRITICAL FINDINGS from real Yoco API testing:
 * 
 * 1. checkout.status stays "started" even AFTER successful payment
 * 2. checkout.paymentId exists on ALL checkouts including unpaid
 * 3. /api/payments/{id} returns 404 for Online Checkout payments
 * 4. There is NO reliable way to verify payment via Yoco's REST API
 * 
 * THEREFORE: Only the webhook (payment.succeeded event) is reliable.
 * The activate endpoint should NOT mark payments as completed —
 * it should only check if the webhook already processed it.
 * 
 * Payment activation flow:
 * 1. User pays → Yoco sends webhook → webhook marks "completed" (TRUSTED)
 * 2. User redirected to success page → polls for completion
 * 3. If webhook beats redirect → user sees "activated"
 * 4. If redirect beats webhook → user sees "processing, please wait"
 */

// This function is kept for admin tools but returns "unverifiable"
// since Yoco's API cannot distinguish paid from unpaid checkouts
export interface YocoVerifyResult {
  paid: boolean | null;  // null = cannot determine
  checkoutStatus: string;
  paymentId: string | null;
  details: string;
}

export async function verifyYocoPayment(
  checkoutId: string,
  yocoKey: string
): Promise<YocoVerifyResult> {
  const checkoutRes = await fetch(
    `https://payments.yoco.com/api/checkouts/${checkoutId}`,
    { headers: { Authorization: `Bearer ${yocoKey}` } }
  );

  if (!checkoutRes.ok) {
    return {
      paid: null,
      checkoutStatus: `api_error_${checkoutRes.status}`,
      paymentId: null,
      details: `Checkout API returned ${checkoutRes.status}`,
    };
  }

  const checkout = await checkoutRes.json();
  const status = (checkout.status || "unknown").toLowerCase();
  const paymentId = checkout.paymentId || null;

  // Yoco's checkout status is NOT reliable for payment verification
  // "started" can mean paid OR unpaid
  // Only "completed" is somewhat reliable but Yoco doesn't always set it
  if (status === "completed") {
    return {
      paid: true,
      checkoutStatus: status,
      paymentId,
      details: `Checkout status: completed — likely paid`,
    };
  }

  // For all other statuses, we CANNOT determine payment status
  return {
    paid: null,  // null = unknown, not false
    checkoutStatus: status,
    paymentId,
    details: `Checkout status: ${status} — cannot verify via API (Yoco limitation)`,
  };
}
