import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

// Public endpoint — no auth required
// Returns real activity stats from DB
// Cached for 60s to avoid hammering DB
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const service = createServiceSupabase();
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [scansTotal, scansToday, scansHour, usersTotal] = await Promise.all([
      service.from("scans").select("id", { count: "exact", head: true }),
      service.from("scans").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      service.from("scans").select("id", { count: "exact", head: true }).gte("created_at", hourAgo.toISOString()),
      service.from("profiles").select("id", { count: "exact", head: true }),
    ]);

    // Real numbers only — no inflation
    const data = {
      scans_total: scansTotal.count || 0,
      scans_today: scansToday.count || 0,
      scans_hour: scansHour.count || 0,
      traders: usersTotal.count || 0,
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch {
    // Honest fallback — show 0 instead of fake numbers
    return NextResponse.json({ scans_total: 0, scans_today: 0, scans_hour: 0, traders: 0 });
  }
}
