import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

/**
 * POST /api/admin/affiliates/bulk-payout
 * Distribute credits to all affiliates with outstanding balance
 * Converts their earned commission to scan credits
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const { data: admin } = await service.from("profiles").select("role").eq("id", user.id).single();
    if (admin?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const method = body.method || "credit"; // 'credit' = scan credits

    // Get all affiliates with outstanding balance
    const { data: affiliates } = await service
      .from("affiliates")
      .select("*, profiles(id, email, full_name, credits_balance)")
      .eq("status", "active");

    if (!affiliates || affiliates.length === 0) {
      return NextResponse.json({ message: "No active affiliates", distributed: 0 });
    }

    let distributed = 0;
    let totalAmount = 0;
    const results: any[] = [];

    for (const aff of affiliates) {
      const balance = (aff.total_earned_cents || 0) - (aff.total_paid_cents || 0);
      if (balance <= 0) continue;

      const profile: any = Array.isArray(aff.profiles) ? aff.profiles[0] : aff.profiles;
      if (!profile) continue;

      if (method === "credit") {
        // Convert cents to scan credits (R10 = 1 credit, or 1000 cents = 1 credit)
        // Actually let's do R1 = 1 credit for simplicity
        const creditsToGive = Math.floor(balance / 100); // R1 per credit
        if (creditsToGive <= 0) continue;

        // Add credits to profile
        await service.from("profiles").update({
          credits_balance: (profile.credits_balance || 0) + creditsToGive,
        }).eq("id", profile.id);

        // Record credit transaction
        await service.from("credit_transactions").insert({
          user_id: profile.id,
          amount: creditsToGive,
          type: "affiliate_payout",
          description: `Affiliate commission payout: R${(balance / 100).toFixed(2)} → ${creditsToGive} credits`,
        }).catch(() => {}); // table might not exist

        // Update affiliate paid amount
        await service.from("affiliates").update({
          total_paid_cents: (aff.total_paid_cents || 0) + balance,
        }).eq("id", aff.id);

        // Record payout
        try {
          await service.from("affiliate_payouts").insert({
            affiliate_id: aff.id,
            amount_cents: balance,
            method: "credit",
            status: "completed",
            metadata: { credits_given: creditsToGive, profile_id: profile.id },
          });
        } catch { /* table might not exist yet */ }

        distributed++;
        totalAmount += balance;
        results.push({
          affiliate: profile.full_name || profile.email,
          email: profile.email,
          code: aff.ref_code,
          amountCents: balance,
          creditsGiven: creditsToGive,
          status: "paid",
        });
      }
    }

    return NextResponse.json({
      message: `Distributed to ${distributed} affiliates — R${(totalAmount / 100).toFixed(2)} total`,
      distributed,
      totalAmountCents: totalAmount,
      totalFormatted: `R${(totalAmount / 100).toFixed(2)}`,
      results,
    });
  } catch (err) {
    console.error("[BULK:PAYOUT]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
