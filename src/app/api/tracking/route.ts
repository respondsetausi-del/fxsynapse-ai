import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { event_type, source, visitor_id, user_id, metadata } = await req.json();

    if (!event_type) {
      return NextResponse.json({ error: "event_type required" }, { status: 400 });
    }

    await supabaseAdmin.from("visitor_events").insert({
      event_type,
      source: source || null,
      visitor_id: visitor_id || null,
      user_id: user_id || null,
      metadata: metadata || {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tracking error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// GET — admin analytics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get all events in timeframe
    const { data: events } = await supabaseAdmin
      .from("visitor_events")
      .select("*")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (!events) return NextResponse.json({ events: [], stats: {} });

    // Compute stats
    const stats = {
      landing_visits: events.filter(e => e.event_type === "landing_visit").length,
      signup_clicks: events.filter(e => e.event_type === "signup_click").length,
      broker_clicks: events.filter(e => e.event_type === "broker_click").length,
      broker_popup_shown: events.filter(e => e.event_type === "broker_popup_shown").length,
      broker_popup_dismissed: events.filter(e => e.event_type === "broker_popup_dismissed").length,
      apk_downloads: events.filter(e => e.event_type === "apk_download").length,
      // Unique visitors
      unique_visitors: new Set(events.filter(e => e.visitor_id).map(e => e.visitor_id)).size,
      // Conversion: signup clicks / landing visits
      signup_rate: 0,
      broker_click_rate: 0,
      // By source
      broker_by_source: {} as Record<string, number>,
      signup_by_source: {} as Record<string, number>,
      // Daily breakdown
      daily: [] as { date: string; visits: number; signups: number; broker: number }[],
    };

    // Signup rate
    if (stats.landing_visits > 0) {
      stats.signup_rate = Math.round((stats.signup_clicks / stats.landing_visits) * 1000) / 10;
    }
    // Broker click rate
    if (stats.broker_popup_shown > 0) {
      stats.broker_click_rate = Math.round((stats.broker_clicks / stats.broker_popup_shown) * 1000) / 10;
    }

    // By source
    events.filter(e => e.event_type === "broker_click").forEach(e => {
      const src = e.source || "unknown";
      stats.broker_by_source[src] = (stats.broker_by_source[src] || 0) + 1;
    });
    events.filter(e => e.event_type === "signup_click").forEach(e => {
      const src = e.source || "unknown";
      stats.signup_by_source[src] = (stats.signup_by_source[src] || 0) + 1;
    });

    // Daily breakdown
    const dailyMap: Record<string, { visits: number; signups: number; broker: number; downloads: number }> = {};
    events.forEach(e => {
      const day = e.created_at.split("T")[0];
      if (!dailyMap[day]) dailyMap[day] = { visits: 0, signups: 0, broker: 0, downloads: 0 };
      if (e.event_type === "landing_visit") dailyMap[day].visits++;
      if (e.event_type === "signup_click") dailyMap[day].signups++;
      if (e.event_type === "broker_click") dailyMap[day].broker++;
      if (e.event_type === "apk_download") dailyMap[day].downloads++;
    });
    stats.daily = Object.entries(dailyMap)
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ stats, recent: events.slice(0, 50) });
  } catch (error) {
    console.error("Tracking fetch error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
