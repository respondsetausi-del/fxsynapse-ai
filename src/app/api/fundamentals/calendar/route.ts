import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Country code to flag emoji mapping
const FLAGS: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", JP: "🇯🇵", AU: "🇦🇺",
  NZ: "🇳🇿", CA: "🇨🇦", CH: "🇨🇭", CN: "🇨🇳", DE: "🇩🇪",
};

// GET — fetch calendar events (from cache or refresh from Finnhub)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "week"; // 'today', 'tomorrow', 'week'
    const refresh = searchParams.get("refresh") === "true";

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    let fromDate = todayStr;
    let toDate = todayStr;

    if (range === "tomorrow") {
      const tom = new Date(today);
      tom.setDate(tom.getDate() + 1);
      fromDate = todayStr;
      toDate = tom.toISOString().split("T")[0];
    } else if (range === "week") {
      const end = new Date(today);
      end.setDate(end.getDate() + 7);
      toDate = end.toISOString().split("T")[0];
    }

    // Try to refresh from Finnhub if requested or cache is stale
    if (refresh) {
      await refreshCalendar(fromDate, toDate);
    }

    // Fetch from cache
    const { data: events } = await getSupabase()
      .from("economic_events")
      .select("*")
      .gte("event_date", fromDate)
      .lte("event_date", toDate)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    // If no cached events, try refresh
    if (!events || events.length === 0) {
      await refreshCalendar(fromDate, toDate);
      const { data: freshEvents } = await getSupabase()
        .from("economic_events")
        .select("*")
        .gte("event_date", fromDate)
        .lte("event_date", toDate)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true });

      return NextResponse.json({
        events: (freshEvents || []).map(e => ({ ...e, flag: FLAGS[e.country] || "🏳️" })),
        range, fromDate, toDate,
      });
    }

    return NextResponse.json({
      events: events.map(e => ({ ...e, flag: FLAGS[e.country] || "🏳️" })),
      range, fromDate, toDate,
    });
  } catch (error) {
    console.error("Calendar error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}

// Refresh calendar from Finnhub
async function refreshCalendar(from: string, to: string) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn("No FINNHUB_API_KEY — using seed data");
    await seedDefaultEvents(from, to);
    return;
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      console.warn("Finnhub API error, using seed data");
      await seedDefaultEvents(from, to);
      return;
    }

    const data = await res.json();
    const events = data?.economicCalendar || [];

    // Map impact levels
    const impactMap = (impact: number) => {
      if (impact >= 3) return "high";
      if (impact >= 2) return "medium";
      return "low";
    };

    // Country mapping
    const countryMap: Record<string, string> = {
      US: "US", EU: "EU", GB: "GB", JP: "JP", AU: "AU",
      NZ: "NZ", CA: "CA", CH: "CH", CN: "CN", DE: "DE",
    };

    // Filter forex-relevant countries only
    const forexCountries = new Set(Object.keys(countryMap));

    for (const ev of events) {
      if (!forexCountries.has(ev.country)) continue;

      const eventDate = ev.time?.split(" ")[0] || from;
      const eventTime = ev.time?.split(" ")[1]?.slice(0, 5) || null;

      await getSupabase().from("economic_events").upsert({
        event_date: eventDate,
        event_time: eventTime,
        country: countryMap[ev.country] || ev.country,
        event_name: ev.event || "Unknown Event",
        impact: impactMap(ev.impact || 1),
        previous: ev.prev?.toString() || null,
        forecast: ev.estimate?.toString() || null,
        actual: ev.actual?.toString() || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
    }
  } catch (err) {
    console.error("Finnhub refresh failed:", err);
    await seedDefaultEvents(from, to);
  }
}

// Seed default high-impact events when no API key
async function seedDefaultEvents(from: string, to: string) {
  // Check if we already have events for this range
  const { data: existing } = await getSupabase()
    .from("economic_events")
    .select("id")
    .gte("event_date", from)
    .lte("event_date", to)
    .limit(1);

  if (existing && existing.length > 0) return; // Already seeded

  // Generate realistic upcoming events
  const majorEvents = [
    { country: "US", event_name: "Initial Jobless Claims", impact: "medium", event_time: "13:30" },
    { country: "US", event_name: "CPI (YoY)", impact: "high", event_time: "13:30" },
    { country: "US", event_name: "Core CPI (MoM)", impact: "high", event_time: "13:30" },
    { country: "US", event_name: "Retail Sales (MoM)", impact: "high", event_time: "13:30" },
    { country: "US", event_name: "Non-Farm Payrolls", impact: "high", event_time: "13:30" },
    { country: "US", event_name: "Unemployment Rate", impact: "high", event_time: "13:30" },
    { country: "US", event_name: "FOMC Statement", impact: "high", event_time: "19:00" },
    { country: "US", event_name: "Fed Interest Rate Decision", impact: "high", event_time: "19:00" },
    { country: "US", event_name: "GDP (QoQ)", impact: "high", event_time: "13:30" },
    { country: "US", event_name: "PPI (MoM)", impact: "medium", event_time: "13:30" },
    { country: "EU", event_name: "ECB Interest Rate Decision", impact: "high", event_time: "13:15" },
    { country: "EU", event_name: "CPI (YoY)", impact: "high", event_time: "10:00" },
    { country: "GB", event_name: "BoE Interest Rate Decision", impact: "high", event_time: "12:00" },
    { country: "GB", event_name: "CPI (YoY)", impact: "high", event_time: "07:00" },
    { country: "GB", event_name: "GDP (QoQ)", impact: "high", event_time: "07:00" },
    { country: "JP", event_name: "BoJ Interest Rate Decision", impact: "high", event_time: "03:00" },
    { country: "AU", event_name: "RBA Interest Rate Decision", impact: "high", event_time: "03:30" },
    { country: "AU", event_name: "Employment Change", impact: "high", event_time: "00:30" },
    { country: "CA", event_name: "BoC Interest Rate Decision", impact: "high", event_time: "15:00" },
    { country: "NZ", event_name: "RBNZ Interest Rate Decision", impact: "high", event_time: "02:00" },
    { country: "CH", event_name: "SNB Interest Rate Decision", impact: "high", event_time: "08:30" },
    { country: "US", event_name: "ISM Manufacturing PMI", impact: "high", event_time: "15:00" },
    { country: "US", event_name: "Consumer Confidence", impact: "medium", event_time: "15:00" },
    { country: "EU", event_name: "Manufacturing PMI", impact: "medium", event_time: "09:00" },
    { country: "GB", event_name: "Manufacturing PMI", impact: "medium", event_time: "09:30" },
  ];

  // Spread events across the date range
  const start = new Date(from);
  const end = new Date(to);
  const days: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow > 0 && dow < 6) days.push(d.toISOString().split("T")[0]); // Weekdays only
  }

  if (days.length === 0) return;

  // Assign 3-5 events per day
  let eventIdx = 0;
  for (const day of days) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count && eventIdx < majorEvents.length; i++) {
      const ev = majorEvents[eventIdx % majorEvents.length];
      await getSupabase().from("economic_events").insert({
        event_date: day,
        event_time: ev.event_time,
        country: ev.country,
        event_name: ev.event_name,
        impact: ev.impact,
        previous: null,
        forecast: null,
        actual: null,
      });
      eventIdx++;
    }
  }
}
