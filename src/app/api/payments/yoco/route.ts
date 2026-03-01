import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { TIERS, CREDIT_PACKS, getPlanPriceCents, getSubscriptionMonths, type BillingPeriod } from "@/lib/tier-config";

/**
 * Checkout Creation — /api/payments/yoco
 *
 * RULES:
 *   1. ONE active pending payment per user per (plan + amount) combo
 *   2. If valid checkout exists < 5 min → reuse it (no new Yoco session)
 *   3. If creating new → expire all older pending payments for same user+plan
 *   4. Log every decision for observability
 */

function log(level: "info" | "warn" | "error", action: string, data: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), sys: "CHECKOUT", action, ...data };
  if (level === "error") console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function getService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  try {
    // ─── Auth ───
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll(c) { try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ─── Parse request ───
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
      metadata = { type: "subscription", planId, period: billingPeriod, userId: user.id, months: String(getSubscriptionMonths(billingPeriod)) };
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
    if (!yocoKey) return NextResponse.json({ error: "Payment system not configured" }, { status: 500 });

    const service = getService();

    // ─── DEDUP: Check for existing valid checkout ───
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existing } = await service
      .from("payments")
      .select("id, yoco_checkout_id, created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("amount_cents", amountCents)
      .gte("created_at", fiveMinAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing?.yoco_checkout_id) {
      // Verify the checkout is still alive at Yoco
      try {
        const checkRes = await fetch(`https://payments.yoco.com/api/checkouts/${existing.yoco_checkout_id}`, {
          headers: { Authorization: `Bearer ${yocoKey}` },
        });
        if (checkRes.ok) {
          const checkout = await checkRes.json();
          if (checkout.redirectUrl && !["expired", "completed"].includes(checkout.status)) {
            log("info", "REUSE_CHECKOUT", { userId: user.id, checkoutId: checkout.id, age: `${Math.round((Date.now() - new Date(existing.created_at).getTime()) / 1000)}s` });
            return NextResponse.json({ checkoutUrl: checkout.redirectUrl, checkoutId: checkout.id, reused: true });
          }
        }
      } catch {} // Verification failed → create new checkout below
    }

    // ─── Expire ALL old pending payments for this user (cleanup) ───
    const { data: stalePending } = await service
      .from("payments")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lt("created_at", fiveMinAgo);

    if (stalePending && stalePending.length > 0) {
      const staleIds = stalePending.map(p => p.id);
      await service
        .from("payments")
        .update({ status: "expired", metadata: { expired_by: "new_checkout", expired_at: new Date().toISOString() } })
        .in("id", staleIds)
        .eq("status", "pending"); // atomic: only if still pending

      log("info", "EXPIRED_STALE", { userId: user.id, count: staleIds.length });
    }

    // ─── Create new Yoco checkout ───
    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${yocoKey}` },
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
      const errText = await yocoRes.text();
      log("error", "YOCO_CREATE_FAIL", { userId: user.id, status: yocoRes.status, error: errText });
      return NextResponse.json({ error: "Failed to create checkout" }, { status: 502 });
    }

    const checkout = await yocoRes.json();

    // ─── Insert payment record ───
    const { error: insertErr } = await service.from("payments").insert({
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

    if (insertErr) {
      log("error", "DB_INSERT_FAIL", { userId: user.id, checkoutId: checkout.id, error: insertErr.message });
    }

    log("info", "CHECKOUT_CREATED", {
      userId: user.id,
      checkoutId: checkout.id,
      type,
      planId: planId || packId,
      amount: amountCents,
    });

    return NextResponse.json({ checkoutUrl: checkout.redirectUrl, checkoutId: checkout.id });
  } catch (error) {
    log("error", "CHECKOUT_EXCEPTION", { error: String(error) });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
