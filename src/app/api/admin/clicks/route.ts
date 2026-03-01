import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase, requireAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "7");
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get all click events
    const { data: events } = await supabase
      .from("visitor_events")
      .select("event_type, source, user_id, metadata, created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);

    if (!events) return NextResponse.json({ clicks: [], heatmap: {}, totals: {} });

    // Aggregate by event_type
    const totals: Record<string, number> = {};
    const bySource: Record<string, Record<string, number>> = {};
    const hourly: Record<number, number> = {};
    const daily: Record<string, Record<string, number>> = {};

    events.forEach(e => {
      // Totals
      totals[e.event_type] = (totals[e.event_type] || 0) + 1;

      // By source
      if (e.source) {
        if (!bySource[e.event_type]) bySource[e.event_type] = {};
        bySource[e.event_type][e.source] = (bySource[e.event_type][e.source] || 0) + 1;
      }

      // Hourly distribution
      const hour = new Date(e.created_at).getHours();
      hourly[hour] = (hourly[hour] || 0) + 1;

      // Daily by type
      const day = e.created_at.split("T")[0];
      if (!daily[day]) daily[day] = {};
      daily[day][e.event_type] = (daily[day][e.event_type] || 0) + 1;
    });

    // Sort totals descending
    const sortedTotals = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([event, count]) => ({
        event,
        count,
        sources: bySource[event] || {},
      }));

    // Top user actions (exclude page views)
    const userActions = events
      .filter(e => e.user_id && !["landing_visit", "page_view"].includes(e.event_type))
      .reduce((acc, e) => {
        const key = e.user_id;
        if (!acc[key]) acc[key] = { userId: key, actions: 0, types: {} as Record<string, number> };
        acc[key].actions++;
        acc[key].types[e.event_type] = (acc[key].types[e.event_type] || 0) + 1;
        return acc;
      }, {} as Record<string, { userId: string; actions: number; types: Record<string, number> }>);

    const topUsers = Object.values(userActions)
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 20);

    return NextResponse.json({
      totals: sortedTotals,
      hourly: Object.entries(hourly).map(([h, c]) => ({ hour: parseInt(h), count: c })).sort((a, b) => a.hour - b.hour),
      daily: Object.entries(daily).map(([date, types]) => ({ date, ...types })).sort((a, b) => a.date.localeCompare(b.date)),
      topUsers,
      totalEvents: events.length,
      period: `${days}d`,
    });
  } catch (error) {
    console.error("Admin clicks error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
