/**
 * Yoco Payment Verification Utility
 * 
 * CRITICAL FINDINGS (from raw Yoco API responses):
 * 
 * 1. checkout.paymentId exists on ALL checkouts — even unpaid ones. NEVER use it.
 * 2. Yoco's /api/payments/{id} returns 404 for Online Checkout payments. Unusable.
 * 3. The ONLY reliable indicator is checkout.status:
 *    - "started"    = user opened checkout page, may have entered card, but payment NOT collected
 *    - "processing" = payment attempt in progress, NOT yet collected
 *    - "completed"  = payment SUCCEEDED, money collected ✅
 *    - "expired"    = checkout session expired
 * 
 * DO NOT check paymentId. DO NOT call /api/payments/. 
 * ONLY checkout.status === "completed" means real money.
 */

export interface YocoVerifyResult {
  paid: boolean;
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
      paid: false,
      checkoutStatus: `api_error_${checkoutRes.status}`,
      paymentId: null,
      details: `Checkout API returned ${checkoutRes.status}`,
    };
  }

  const checkout = await checkoutRes.json();
  const status = (checkout.status || "unknown").toLowerCase();
  const paymentId = checkout.paymentId || null;

  // ONLY "completed" means money was collected
  const paid = status === "completed";

  return {
    paid,
    checkoutStatus: status,
    paymentId,
    details: paid
      ? `✅ Checkout ${checkoutId} status: completed — payment collected`
      : `❌ Checkout ${checkoutId} status: ${status} — NOT paid`,
  };
}
