import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

// POST: Process referral reward after signup
// Called when a new user signs up with a ref code
export async function POST(req: Request) {
  try {
    const { userId, refCode } = await req.json();
    if (!userId || !refCode) {
      return NextResponse.json({ error: "Missing userId or refCode" }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    // Find the referrer by their referral_code
    const { data: referrer } = await supabase
      .from("profiles")
      .select("id, credits_balance, referral_reward_total")
      .eq("referral_code", refCode.toUpperCase())
      .single();

    if (!referrer) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
    }

    // Don't let users refer themselves
    if (referrer.id === userId) {
      return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 });
    }

    // Check if this referral was already rewarded
    const { data: existing } = await supabase
      .from("referral_rewards")
      .select("id")
      .eq("referrer_id", referrer.id)
      .eq("referred_user_id", userId)
      .single();

    if (existing) {
      return NextResponse.json({ already: true });
    }

    // Grant 5 credits to referrer
    const creditsToGrant = 5;
    await supabase
      .from("profiles")
      .update({
        credits_balance: (referrer.credits_balance || 0) + creditsToGrant,
        referral_reward_total: (referrer.referral_reward_total || 0) + creditsToGrant,
      })
      .eq("id", referrer.id);

    // Record the reward
    await supabase.from("referral_rewards").insert({
      referrer_id: referrer.id,
      referred_user_id: userId,
      credits_granted: creditsToGrant,
    });

    // Record credit transaction
    await supabase.from("credit_transactions").insert({
      user_id: referrer.id,
      amount: creditsToGrant,
      type: "referral_reward",
      description: `Referral reward: +${creditsToGrant} scans`,
    });

    // Also update referred_by on the new user's profile
    await supabase
      .from("profiles")
      .update({ referred_by: refCode.toUpperCase() })
      .eq("id", userId);

    return NextResponse.json({ success: true, creditsGranted: creditsToGrant });
  } catch (error) {
    console.error("Referral error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: Get user's referral info
export async function GET(req: Request) {
  try {
    const supabase = createServiceSupabase();
    const authHeader = req.headers.get("cookie") || "";
    
    // Get current user from auth
    const { createClient } = await import("@/lib/supabase/server");
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("referral_code, referral_reward_total, credits_balance")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Count referrals
    const { count } = await supabase
      .from("referral_rewards")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", user.id);

    return NextResponse.json({
      referralCode: profile.referral_code,
      totalReferred: count || 0,
      totalCreditsEarned: profile.referral_reward_total || 0,
      currentBalance: profile.credits_balance || 0,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://fxsynapse.co.za"}/signup?ref=${profile.referral_code}`,
    });
  } catch (error) {
    console.error("Referral GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
