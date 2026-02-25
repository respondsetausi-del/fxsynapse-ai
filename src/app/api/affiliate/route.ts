import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

function generateRefCode(name: string): string {
  const clean = (name || "FXS").replace(/[^a-zA-Z]/g, "").substring(0, 6).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${clean}${rand}`;
}

// GET — fetch current user's affiliate profile + stats
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();

    const { data: affiliate } = await service
      .from("affiliates")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!affiliate) {
      return NextResponse.json({ affiliate: null, isAffiliate: false });
    }

    // Get referrals with profile info
    const { data: referrals } = await service
      .from("referrals")
      .select("*, profiles:referred_user_id(email, full_name, plan_id, subscription_status, created_at)")
      .eq("affiliate_id", affiliate.id)
      .order("signed_up_at", { ascending: false })
      .limit(50);

    // Get recent earnings
    const { data: earnings } = await service
      .from("affiliate_earnings")
      .select("*")
      .eq("affiliate_id", affiliate.id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get payouts
    const { data: payouts } = await service
      .from("affiliate_payouts")
      .select("*")
      .eq("affiliate_id", affiliate.id)
      .order("requested_at", { ascending: false })
      .limit(20);

    // Calculate balance
    const pendingEarnings = (earnings || [])
      .filter(e => e.status === "pending" || e.status === "approved")
      .reduce((s, e) => s + e.amount_cents, 0);

    return NextResponse.json({
      isAffiliate: true,
      affiliate,
      referrals: referrals || [],
      earnings: earnings || [],
      payouts: payouts || [],
      balance: affiliate.total_earned_cents - affiliate.total_paid_cents,
      pendingEarnings,
    });
  } catch (error) {
    console.error("Affiliate GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST — join affiliate program or update bank details
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceSupabase();
    const body = await req.json();
    const { action } = body;

    if (action === "join") {
      // Check if already an affiliate
      const { data: existing } = await service
        .from("affiliates")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        return NextResponse.json({ error: "Already an affiliate" }, { status: 400 });
      }

      // Get user profile for name
      const { data: profile } = await service
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single();

      // Generate unique ref code
      let refCode = generateRefCode(profile?.full_name || profile?.email || "");
      let attempts = 0;
      while (attempts < 10) {
        const { data: clash } = await service
          .from("affiliates")
          .select("id")
          .eq("ref_code", refCode)
          .single();
        if (!clash) break;
        refCode = generateRefCode(profile?.full_name || "");
        attempts++;
      }

      const { data: affiliate, error } = await service
        .from("affiliates")
        .insert({
          user_id: user.id,
          ref_code: refCode,
          commission_rate: 0.20,
        })
        .select()
        .single();

      if (error) {
        console.error("Affiliate join error:", error);
        return NextResponse.json({ error: "Failed to join program" }, { status: 500 });
      }

      return NextResponse.json({ affiliate, refCode });
    }

    if (action === "update_bank") {
      const { bankName, accountNumber, accountHolder } = body;

      const { error } = await service
        .from("affiliates")
        .update({
          bank_name: bankName,
          account_number: accountNumber,
          account_holder: accountHolder,
          payout_method: "eft",
        })
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ error: "Failed to update bank details" }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "request_payout") {
      const { data: affiliate } = await service
        .from("affiliates")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!affiliate) return NextResponse.json({ error: "Not an affiliate" }, { status: 400 });

      const balance = affiliate.total_earned_cents - affiliate.total_paid_cents;
      if (balance < 10000) { // R100 minimum
        return NextResponse.json({ error: "Minimum payout is R100" }, { status: 400 });
      }

      if (!affiliate.bank_name || !affiliate.account_number) {
        return NextResponse.json({ error: "Please add bank details first" }, { status: 400 });
      }

      const { error } = await service
        .from("affiliate_payouts")
        .insert({
          affiliate_id: affiliate.id,
          amount_cents: balance,
          method: "eft",
          bank_name: affiliate.bank_name,
          account_number: affiliate.account_number,
          account_holder: affiliate.account_holder,
          reference: `FXS-${affiliate.ref_code}-${Date.now()}`,
        });

      if (error) {
        return NextResponse.json({ error: "Failed to request payout" }, { status: 500 });
      }

      return NextResponse.json({ success: true, amount: balance });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Affiliate POST error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
