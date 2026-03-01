import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TIERS, CREDIT_PACKS, getPlanPriceCents, getSubscriptionMonths, type BillingPeriod } from "@/lib/tier-config";
import crypto from "crypto";

/**
 * Guest Checkout — /api/payments/guest-checkout
 *
 * For landing page visitors who haven't signed up yet.
 * Creates a Yoco checkout and stores payment with user_id = null + guest_token.
 * After payment success → redirect to signup → link payment → activate.
 */

function getService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, planId, packId, period = "monthly" } = body;

    let amountCents: number;
    let description: string;
    let paymentType: string;
    let metadata: Record<string, string>;

    if (type === "subscription" && planId && planId in TIERS) {
      const tier = TIERS[planId as keyof typeof TIERS];
      const billingPeriod = period as BillingPeriod;
      amountCents = getPlanPriceCents(planId, billingPeriod);
      description = `FXSynapse AI — ${tier.name} Plan`;
      paymentType = "subscription";
      metadata = {
        type: "subscription", planId, period: billingPeriod,
        months: String(getSubscriptionMonths(billingPeriod)), guest: "true",
      };
    } else if (type === "topup" && packId) {
      const pack = CREDIT_PACKS.find((p) => p.id === packId);
      if (!pack) return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
      amountCents = pack.priceCents;
      description = `FXSynapse AI — ${pack.credits} Scans Credit Pack`;
      paymentType = "topup";
      metadata = {
        type: "topup", packId: pack.id, credits: String(pack.credits), guest: "true",
      };
    } else {
      return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
    }

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) return NextResponse.json({ error: "Payment system not configured" }, { status: 500 });

    // Generate guest token for linking after signup
    const guestToken = crypto.randomBytes(16).toString("hex");
    metadata.guestToken = guestToken;

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://fxsynapse-ai.vercel.app";

    // Create Yoco checkout
    const yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: { Authorization: `Bearer ${yocoKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountCents,
        currency: "ZAR",
        metadata,
        successUrl: `${origin}/signup?paid=true&token=${guestToken}&type=${paymentType}&plan=${planId || packId || ""}`,
        cancelUrl: `${origin}/#pricing`,
      }),
    });

    if (!yocoRes.ok) {
      const errText = await yocoRes.text();
      console.error("Yoco guest checkout error:", errText);
      return NextResponse.json({ error: "Payment provider error" }, { status: 502 });
    }

    const checkout = await yocoRes.json();

    // Store payment record (no user_id — guest)
    const service = getService();
    await service.from("payments").insert({
      user_id: null,
      type: paymentType === "subscription" ? "subscription" : "credits",
      plan_id: planId || null,
      amount_cents: amountCents,
      credits_amount: metadata.credits ? parseInt(metadata.credits) : null,
      status: "pending",
      yoco_checkout_id: checkout.id,
      metadata: { ...metadata, description },
    });

    return NextResponse.json({
      checkoutUrl: checkout.redirectUrl,
      checkoutId: checkout.id,
      guestToken,
    });
  } catch (error) {
    console.error("Guest checkout error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
