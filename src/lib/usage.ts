/* ─── Daily Usage Tracking ───
 * Server-side enforcement of tier-based daily limits.
 * Uses daily_scans_used / daily_chats_used on profiles table.
 * Auto-resets when day changes (comparing daily_scans_reset_at).
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { getUserTierInfo, canScanChart, canSendChat } from "@/lib/tier-gates";

export interface UsageInfo {
  userId: string;
  planId: string;
  tierName: string;
  scansUsed: number;
  scansLimit: number; // -1 = unlimited
  scansRemaining: number; // -1 = unlimited
  chatsUsed: number;
  chatsLimit: number;
  chatsRemaining: number;
  canScan: boolean;
  canChat: boolean;
  scanReason?: string;
  chatReason?: string;
  // Credit fallback
  topupBalance: number;
  canScanViaTopup: boolean;
}

/* ─── Get usage (auto-resets if new day) ─── */
export async function getUserUsage(userId: string): Promise<UsageInfo> {
  const supabase = createServiceSupabase();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("plan_id, subscription_status, subscription_expires_at, daily_scans_used, daily_scans_reset_at, daily_chats_used, daily_chats_reset_at, credits_balance")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return emptyUsage(userId);
  }

  const now = new Date();

  // Check subscription expiry
  if (profile.subscription_expires_at && new Date(profile.subscription_expires_at) < now) {
    if (profile.subscription_status === "active") {
      await supabase.from("profiles").update({ subscription_status: "expired" }).eq("id", userId);
      profile.subscription_status = "expired";
    }
  }

  const tierInfo = getUserTierInfo(profile.plan_id, profile.subscription_status);
  const limits = tierInfo.tier.limits;

  // Auto-reset daily counters if new day (UTC)
  let scansUsed = profile.daily_scans_used || 0;
  let chatsUsed = profile.daily_chats_used || 0;

  const todayStr = now.toISOString().slice(0, 10); // "2026-02-27"
  const lastScanReset = profile.daily_scans_reset_at ? new Date(profile.daily_scans_reset_at).toISOString().slice(0, 10) : null;
  const lastChatReset = profile.daily_chats_reset_at ? new Date(profile.daily_chats_reset_at).toISOString().slice(0, 10) : null;

  const updates: Record<string, unknown> = {};

  if (lastScanReset !== todayStr) {
    scansUsed = 0;
    updates.daily_scans_used = 0;
    updates.daily_scans_reset_at = now.toISOString();
  }
  if (lastChatReset !== todayStr) {
    chatsUsed = 0;
    updates.daily_chats_used = 0;
    updates.daily_chats_reset_at = now.toISOString();
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("profiles").update(updates).eq("id", userId);
  }

  const scanCheck = canScanChart(tierInfo, scansUsed);
  const chatCheck = canSendChat(tierInfo, chatsUsed);
  const topup = profile.credits_balance || 0;

  const scansLimit = limits.chartScansPerDay;
  const chatsLimit = limits.aiChatPerDay;

  return {
    userId,
    planId: tierInfo.planId,
    tierName: tierInfo.tier.name,
    scansUsed,
    scansLimit,
    scansRemaining: scansLimit === -1 ? -1 : Math.max(0, scansLimit - scansUsed),
    chatsUsed,
    chatsLimit,
    chatsRemaining: chatsLimit === -1 ? -1 : Math.max(0, chatsLimit - chatsUsed),
    canScan: scanCheck.allowed || topup > 0,
    canChat: chatCheck.allowed,
    scanReason: scanCheck.allowed ? undefined : scanCheck.reason,
    chatReason: chatCheck.allowed ? undefined : chatCheck.reason,
    topupBalance: topup,
    canScanViaTopup: !scanCheck.allowed && topup > 0,
  };
}

/* ─── Increment scan count ─── */
export async function incrementScanUsage(userId: string, useTopup: boolean = false): Promise<boolean> {
  const supabase = createServiceSupabase();

  if (useTopup) {
    // Deduct from credits_balance
    const { data } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", userId)
      .single();

    if (!data || data.credits_balance <= 0) return false;

    const { error } = await supabase
      .from("profiles")
      .update({ credits_balance: data.credits_balance - 1 })
      .eq("id", userId);

    if (error) return false;

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: -1,
      type: "scan_debit",
      description: "Signal scan (top-up credit)",
    });

    return true;
  }

  // Increment daily counter
  const { data } = await supabase
    .from("profiles")
    .select("daily_scans_used")
    .eq("id", userId)
    .single();

  if (!data) return false;

  const { error } = await supabase
    .from("profiles")
    .update({
      daily_scans_used: (data.daily_scans_used || 0) + 1,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", userId);

  return !error;
}

/* ─── Increment chat count ─── */
export async function incrementChatUsage(userId: string): Promise<boolean> {
  const supabase = createServiceSupabase();

  const { data } = await supabase
    .from("profiles")
    .select("daily_chats_used")
    .eq("id", userId)
    .single();

  if (!data) return false;

  const { error } = await supabase
    .from("profiles")
    .update({ daily_chats_used: (data.daily_chats_used || 0) + 1 })
    .eq("id", userId);

  return !error;
}

/* ─── Auth helper for API routes ─── */
export async function getAuthUserId(): Promise<string | null> {
  try {
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
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
    return user?.id || null;
  } catch {
    return null;
  }
}

function emptyUsage(userId: string): UsageInfo {
  return {
    userId, planId: "free", tierName: "Free",
    scansUsed: 0, scansLimit: 1, scansRemaining: 1,
    chatsUsed: 0, chatsLimit: 0, chatsRemaining: 0,
    canScan: true, canChat: false,
    topupBalance: 0, canScanViaTopup: false,
  };
}
