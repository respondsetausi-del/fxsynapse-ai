import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", AUD: "🇦🇺",
  NZD: "🇳🇿", CAD: "🇨🇦", CHF: "🇨🇭", CNY: "🇨🇳",
};

const FOREX_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNY"]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "week";
    const refresh = searchParams.get("refresh") === "true";

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    let fromDate = todayStr;
    let toDate = todayStr;

    if (range === "tomorrow") {
      const tom = new Date(today);
      tom.setDate(tom.getDate() + 1);
      toDate = tom.toISOString().split("T")[0];
    } else if (range === "week") {
      const end = new Date(today);
      end.setDate(end.getDate() + 7);
      toDate = end.toISOString().split("T")[0];
    }

    if (refresh) await refreshCalendar();

    const { data: events } = await getSupabase()
      .from("economic_events")
      .select("*")
      .gte("event_date", fromDate)
      .lte("event_date", toDate)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (!events || events.length === 0) {
      await refreshCalendar();
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

async function refreshCalendar() {
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": "FXSynapse/1.0", "Accept": "application/json" },
    });

    if (!res.ok) {
      console.warn("FF feed error:", res.status);
      return;
    }

    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) return;

    // Clear current week events before inserting fresh data
    await getSupabase().from("economic_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const impactMap = (impact: string): string => {
      const i = (impact || "").toLowerCase();
      if (i === "high" || i === "holiday") return "high";
      if (i === "medium") return "medium";
      return "low";
    };

    let inserted = 0;
    for (const ev of events) {
      const country = ev.country || "";
      if (!FOREX_CURRENCIES.has(country)) continue;

      let eventDate: string;
      let eventTime: string | null = null;

      if (ev.date) {
        const d = new Date(ev.date);
        if (isNaN(d.getTime())) continue;
        eventDate = d.toISOString().split("T")[0];
        const hours = d.getUTCHours().toString().padStart(2, "0");
        const mins = d.getUTCMinutes().toString().padStart(2, "0");
        eventTime = `${hours}:${mins}`;
      } else {
        continue;
      }

      await getSupabase().from("economic_events").insert({
        event_date: eventDate,
        event_time: eventTime,
        country: country,
        event_name: ev.title || "Unknown Event",
        impact: impactMap(ev.impact || "low"),
        previous: ev.previous?.toString() || null,
        forecast: ev.forecast?.toString() || null,
        actual: ev.actual?.toString() || null,
        updated_at: new Date().toISOString(),
      });
      inserted++;
    }

    console.log(`Calendar refreshed: ${inserted} forex events from ForexFactory`);
  } catch (err) {
    console.error("Calendar refresh failed:", err);
  }
}
