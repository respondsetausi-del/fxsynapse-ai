# FXSynapse Payment System — Architecture Fixes
# Based on full codebase audit

## PRIORITY 1: Deduplicate Payment Creation
## File: /api/payments/yoco/route.ts

Problem: Every click creates a new Yoco checkout + DB row
Fix: Check for existing pending payment within 5 min window

```typescript
// ADD after user auth check, BEFORE Yoco API call:

const service = createClient(SUPABASE_URL, SERVICE_KEY);

// Check for recent pending payment for same plan (dedup window: 5 min)
const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const { data: existing } = await service
  .from("payments")
  .select("yoco_checkout_id")
  .eq("user_id", user.id)
  .eq("status", "pending")
  .gte("created_at", fiveMinAgo)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

if (existing?.yoco_checkout_id) {
  // Check if Yoco checkout is still valid
  try {
    const checkRes = await fetch(
      `https://payments.yoco.com/api/checkouts/${existing.yoco_checkout_id}`,
      { headers: { Authorization: `Bearer ${yocoKey}` } }
    );
    if (checkRes.ok) {
      const checkout = await checkRes.json();
      if (!["expired", "completed"].includes(checkout.status)) {
        return NextResponse.json({
          checkoutUrl: checkout.redirectUrl,
          checkoutId: checkout.id,
          reused: true
        });
      }
    }
  } catch {} // If check fails, create new checkout
}
```

---

## PRIORITY 2: Add Click Debouncing on Frontend
## File: /app/pricing/page.tsx

Problem: Rapid clicks create multiple checkouts
Fix: Disable button immediately, use ref to track in-flight

```typescript
const inFlight = useRef(false);

const handleSubscribe = async (planId: string) => {
  if (inFlight.current) return; // Block rapid clicks
  if (!user) { window.location.href = "/signup?redirect=/pricing"; return; }
  if (isCurrentActive(planId)) return;
  
  inFlight.current = true;
  setLoading(planId);
  try {
    const res = await fetch("/api/payments/yoco", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "subscription", planId, period: billing }),
    });
    const data = await res.json();
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
  } catch {}
  setLoading(null);
  inFlight.current = false;
};
```

---

## PRIORITY 3: Fix Webhook Security
## File: /api/payments/webhook/route.ts

Problem: Empty YOCO_WEBHOOK_SECRET bypasses all verification
Fix: REQUIRE the secret, use timing-safe comparison

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[WEBHOOK] CRITICAL: YOCO_WEBHOOK_SECRET NOT SET");
    return false; // BLOCK everything if not configured
  }
  if (!signature) return false;
  
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false; // Different lengths = not matching
  }
}
```

---

## PRIORITY 4: Always Return 200 from Webhook
## File: /api/payments/webhook/route.ts

Problem: Catch block returns 500, causing Yoco retries after partial processing
Fix: Always 200, log internally

```typescript
} catch (error) {
  console.error("[WEBHOOK] Error:", error);
  // ALWAYS return 200 to prevent Yoco retries
  // If activation partially failed, sweep will catch it
  return NextResponse.json({ received: true, error: "internal" });
}
```

---

## PRIORITY 5: Faster Expiry of Stale Payments  
## File: /lib/payment-activate.ts → sweepPendingPayments()

Problem: 24h expiry window. Yoco checkouts die in ~30 min.
Fix: Expire after 1 hour

```typescript
// Change from:
if (age > 24 * 60 * 60 * 1000)
// Change to:
if (age > 60 * 60 * 1000) // 1 hour
```

---

## PRIORITY 6: Re-enable Payment Sweep (without cron)
## Add sweep to admin verify button (already exists) + daily cron

The sweep is already called by /api/admin/verify-payments.
Also run it inside the existing fundamentals cron (no extra cron needed):

```typescript
// In /api/cron/fundamentals/route.ts — add:
await fetch(`${baseUrl}/api/admin/verify-payments`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ force: false }),
});
```

---

## PRIORITY 7: Fix Strategy 2 Matching in Webhook
## File: /api/payments/webhook/route.ts

Problem: Falls back to "most recent pending by userId" which could match wrong payment
Fix: Only fallback if amount matches

```typescript
// Strategy 2: Match by userId + amount (safer fallback)
if (!payment && userId) {
  const payloadAmount = payload.amount || payload.amountInCents;
  const query = supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  
  // If we have amount from webhook, match on it too
  if (payloadAmount) {
    query.eq("amount_cents", payloadAmount);
  }
  
  const { data } = await query.single();
  payment = data;
}
```

---

## MONITORING: Payment Health Dashboard

Add to admin overview stats:

```
Real Conversion Rate = Completed / (Unique users who created checkouts)
Checkout Abandonment = (Pending + Expired) / Total
Webhook Success Rate = (Webhook-activated) / Completed
Avg. Time to Activate = avg(completed_at - created_at)
Duplicate Rate = (Payments per user > 1 in same hour) / Total
```

## TESTING WEBHOOKS

### Local (ngrok):
```bash
ngrok http 3000
# Copy ngrok URL → register as webhook in Yoco dashboard
# OR: temporarily change /api/admin/register-webhook to use ngrok URL
```

### Production:
1. Admin panel → "Register Webhook" button
2. Make a test payment (R1 topup pack)
3. Check Vercel Function Logs for [WEBHOOK] entries
4. If no logs → webhook not reaching your server
5. Check Yoco dashboard → Webhooks → Delivery history

### Manual verification:
```bash
# Verify webhook is registered
curl -H "Authorization: Bearer sk_live_xxx" https://payments.yoco.com/api/webhooks

# Check a specific checkout status
curl -H "Authorization: Bearer sk_live_xxx" https://payments.yoco.com/api/checkouts/{checkout_id}
```
