import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const CREDIT_PACKS = [
  { id: "pack_10", credits: 10, price_cents: 1500, label: "10 Credits" },
  { id: "pack_50", credits: 50, price_cents: 4900, label: "50 Credits" },
  { id: "pack_100", credits: 100, price_cents: 7900, label: "100 Credits" },
  { id: "pack_500", credits: 500, price_cents: 29900, label: "500 Credits" },
];

const PLANS = {
  pro: { price_cents: 9900, name: "Pro Plan" },
  premium: { price_cents: 24900, name: "Premium Plan" },
};

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
    const { type, planId, packId } = body;

    let amountCents: number;
    let description: string;
    let metadata: Record<string, string>;

    if (type === "subscription" && planId && planId in PLANS) {
      const plan = PLANS[planId as keyof typeof PLANS];
      amountCents = plan.price_cents;
      description = `FXSynapse AI — ${plan.name} Monthly`;
      metadata = { type: "subscription", planId, userId: user.id };
    } else if (type === "credits" && packId) {
      const pack = CREDIT_PACKS.find((p) => p.id === packId);
      if (!pack) return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
      amountCents = pack.price_cents;
      description = `FXSynapse AI — ${pack.label}`;
      metadata = { type: "credits", packId: pack.id, credits: String(pack.credits), userId: user.id };
    } else {
      return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
    }

    const yocoKey = process.env.YOCO_SECRET_KEY;
    if (!yocoKey) {
      return NextResponse.json({ error: "Payment system not configured" }, { status: 500 });
    }

    // Create Yoco checkout
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

    // Record pending payment
    await supabase.from("payments").insert({
      user_id: user.id,
      yoco_checkout_id: checkout.id,
      amount_cents: amountCents,
      currency: "ZAR",
      type,
      plan_id: planId || null,
      credits_amount: type === "credits" ? CREDIT_PACKS.find((p) => p.id === packId)?.credits : null,
      status: "pending",
      metadata,
    });

    return NextResponse.json({ checkoutUrl: checkout.redirectUrl, checkoutId: checkout.id });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
