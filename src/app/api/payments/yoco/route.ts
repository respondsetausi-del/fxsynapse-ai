import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { TIERS, CREDIT_PACKS, getPlanPriceCents, getSubscriptionMonths, type BillingPeriod } from "@/lib/tier-config";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { type, planId, packId, period = "monthly" } = body;

    let amountCents: number;
    let description: string;
    let metadata: Record<string, string>;

    if (type === "subscription" && planId && planId in TIERS) {
      const tier = TIERS[planId as keyof typeof TIERS];
      const billingPeriod = period as BillingPeriod;
      amountCents = getPlanPriceCents(planId, billingPeriod);
      const periodLabel = billingPeriod === "yearly" ? "Yearly" : "Monthly";
      description = `FXSynapse AI — ${tier.name} Plan (${periodLabel})`;
      metadata = {
        type: "subscription",
        planId,
        period: billingPeriod,
        userId: user.id,
        months: String(getSubscriptionMonths(billingPeriod)),
      };
    } else if (type === "topup" && packId) {
      const pack = CREDIT_PACKS.find((p) => p.id === packId);
      if (!pack) return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
      amountCents = pack.priceCents;
      description = `FXSynapse AI — ${pack.credits} Scans Credit Pack`;
      metadata = { type: "topup", packId: pack.id, credits: String(pack.credits), userId: user.id };
    } else {
      return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
    }

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) {
      return NextResponse.json({ error: "Payment system not configured" }, { status: 500 });
    }

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${yocoKey}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: "ZAR",
        metadata,
        successUrl: `${origin}/payment/success?type=${type}`,
        cancelUrl: `${origin}/pricing`,
        failureUrl: `${origin}/pricing?error=payment_failed`,
      }),
    });

    if (!yocoRes.ok) {
      console.error("Yoco error:", await yocoRes.text());
      return NextResponse.json({ error: "Failed to create checkout" }, { status: 502 });
    }

    const checkout = await yocoRes.json();

    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await service.from("payments").insert({
      user_id: user.id,
      yoco_checkout_id: checkout.id,
      amount_cents: amountCents,
      currency: "ZAR",
      type,
      plan_id: planId || null,
      credits_amount: type === "topup" ? CREDIT_PACKS.find((p) => p.id === packId)?.credits : null,
      status: "pending",
      metadata,
    });

    return NextResponse.json({ checkoutUrl: checkout.redirectUrl, checkoutId: checkout.id });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
