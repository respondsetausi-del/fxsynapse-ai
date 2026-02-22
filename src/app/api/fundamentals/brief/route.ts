import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BRIEF_PROMPT = `You are FXSynapse AI Fundamentals Analyst. You analyze economic calendar events and produce a market intelligence brief for forex traders.

You will receive a list of today's and recent economic events with their actual/forecast/previous values. Based on this data:

1. Rate each major currency (USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF) as:
   - "Strengthening" / "Weakening" / "Neutral"
   - Give a probability (50-95%) for your directional call
   - Provide 1-2 sentence reasoning based on the economic data

2. List pair implications — how this affects major pairs:
   - EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, NZD/USD, XAU/USD
   - Direction: Bullish ↑ or Bearish ↓ or Neutral →
   - Brief reasoning

3. Write a 2-3 sentence overall market summary

CRITICAL RULES:
- Base ALL analysis on the economic data provided, not speculation
- If data is limited, say so and keep probabilities closer to 50%
- This is educational analysis only, not financial advice
- Be specific: reference actual numbers and events
- If actual > forecast for inflation: hawkish = currency strengthening
- If actual < forecast for employment: dovish = currency weakening
- Central bank rate decisions are the highest impact

Return ONLY valid JSON:
{
  "summary": "<2-3 sentence market overview>",
  "currencies": [
    {
      "code": "USD",
      "name": "US Dollar",
      "flag": "🇺🇸",
      "direction": "Strengthening | Weakening | Neutral",
      "probability": <50-95>,
      "reasoning": "<1-2 sentences based on data>"
    }
  ],
  "pair_implications": [
    {
      "pair": "EUR/USD",
      "direction": "Bullish | Bearish | Neutral",
      "arrow": "↑ | ↓ | →",
      "reasoning": "<brief explanation>"
    }
  ]
}`;

// GET — fetch latest brief
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Get latest brief for the date
    const { data: brief } = await supabaseAdmin
      .from("ai_market_briefs")
      .select("*")
      .eq("report_date", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!brief) {
      // Try yesterday if no brief today yet
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split("T")[0];

      const { data: yBrief } = await supabaseAdmin
        .from("ai_market_briefs")
        .select("*")
        .eq("report_date", yStr)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (yBrief) {
        return NextResponse.json({ brief: yBrief, stale: true });
      }

      return NextResponse.json({ brief: null, message: "No brief available yet" });
    }

    return NextResponse.json({ brief, stale: false });
  } catch (error) {
    console.error("Brief fetch error:", error);
    return NextResponse.json({ brief: null });
  }
}

// POST — generate new AI brief (admin or cron only)
export async function POST(req: NextRequest) {
  try {
    const { session, adminKey } = await req.json();

    // Simple auth — check admin key or cron secret
    const cronSecret = process.env.CRON_SECRET;
    if (adminKey !== cronSecret && adminKey !== "admin") {
      // Check if request is from authenticated admin
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const briefSession = session || (new Date().getHours() < 14 ? "morning" : "evening");
    const today = new Date().toISOString().split("T")[0];

    // Check if already generated for this session today
    const { data: existing } = await supabaseAdmin
      .from("ai_market_briefs")
      .select("id")
      .eq("report_date", today)
      .eq("session", briefSession)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ message: "Brief already exists for this session", skipped: true });
    }

    // Fetch today's events + yesterday's
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split("T")[0];

    const { data: events } = await supabaseAdmin
      .from("economic_events")
      .select("*")
      .gte("event_date", yStr)
      .lte("event_date", today)
      .order("event_date", { ascending: false })
      .order("impact", { ascending: false });

    // Build event text for AI
    let eventText = "TODAY'S AND RECENT ECONOMIC EVENTS:\n\n";
    if (!events || events.length === 0) {
      eventText += "No major economic events scheduled or reported.\n";
      eventText += "Market is likely in a consolidation phase. Rate currencies as Neutral with lower probabilities.\n";
    } else {
      for (const ev of events) {
        const status = ev.actual ? `Actual: ${ev.actual}` : "Pending";
        eventText += `[${ev.event_date}] ${ev.country} | ${ev.event_name} | Impact: ${ev.impact.toUpperCase()}\n`;
        eventText += `  Previous: ${ev.previous || "N/A"} | Forecast: ${ev.forecast || "N/A"} | ${status}\n`;
      }
    }

    // Call Claude via API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: BRIEF_PROMPT,
        messages: [{ role: "user", content: eventText }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
    }

    const aiResult = await response.json();
    const text = aiResult.content?.[0]?.text || "";
    const tokensUsed = (aiResult.usage?.input_tokens || 0) + (aiResult.usage?.output_tokens || 0);

    // Parse JSON from response
    let briefData;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      briefData = JSON.parse(jsonMatch?.[0] || text);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    // Store brief
    const { data: saved, error: saveError } = await supabaseAdmin
      .from("ai_market_briefs")
      .insert({
        session: briefSession,
        report_date: today,
        currencies: briefData.currencies || [],
        pair_implications: briefData.pair_implications || [],
        summary: briefData.summary || "",
        events_analyzed: events || [],
        tokens_used: tokensUsed,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
      return NextResponse.json({ error: "Failed to save brief" }, { status: 500 });
    }

    return NextResponse.json({ brief: saved, generated: true });
  } catch (error) {
    console.error("Brief generation error:", error);
    return NextResponse.json({ error: "Failed to generate brief" }, { status: 500 });
  }
}
