import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_PROMPT, USER_PROMPT } from "@/lib/prompts";

/**
 * Guest Analyze — /api/analyze/guest
 *
 * No auth required. Rate limited: 1 scan per IP per 24h.
 * Returns partial results (trend, structure, annotations visible).
 * Entry/SL/TP/overview STRIPPED — signup CTA instead.
 */

// Simple in-memory rate limiter (resets on deploy — acceptable for MVP)
const ipScans = new Map<string, number>();

// Cleanup old entries every 30 min
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [ip, ts] of ipScans.entries()) {
    if (ts < cutoff) ipScans.delete(ip);
  }
}, 30 * 60 * 1000);

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limit by IP
    const ip = getIP(req);
    const lastScan = ipScans.get(ip);
    if (lastScan && Date.now() - lastScan < 24 * 60 * 60 * 1000) {
      return NextResponse.json({
        error: "You've used your free guest scan for today. Create a free account for 1 scan per day, or come back tomorrow.",
        guestLimited: true,
      }, { status: 429 });
    }

    // 2. Validate file
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 });

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) return NextResponse.json({ error: "Invalid file type. Use PNG, JPG, or WebP." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });

    // 3. Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    // 4. Call Claude Vision (with fallback models)
    const models = ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-20241022"];
    let response: Response | null = null;

    for (const model of models) {
      const apiBody = JSON.stringify({
        model,
        max_tokens: 5000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: USER_PROMPT },
          ],
        }],
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: apiBody,
        });
        if (response.status !== 429 && response.status !== 529) break;
        if (attempt < 1) await new Promise(r => setTimeout(r, 2000));
      }
      if (response && response.ok) break;
    }

    if (!response || !response.ok) {
      return NextResponse.json({ error: "AI analysis temporarily unavailable. Try again." }, { status: 502 });
    }

    // 5. Parse response
    const aiData = await response.json();
    const rawText = aiData.content?.[0]?.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI returned an unexpected format." }, { status: 500 });
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // 6. Mark IP as used
    ipScans.set(ip, Date.now());

    // 7. Return PARTIAL results — strip premium fields
    const guestAnalysis = {
      pair: analysis.pair,
      timeframe: analysis.timeframe,
      trend: analysis.trend,
      structure: analysis.structure,
      bias: analysis.bias,
      confidence: analysis.confidence,
      support: analysis.support,
      resistance: analysis.resistance,
      annotations: analysis.annotations,
      chart_bounds: analysis.chart_bounds,
      // LOCKED — these require signup
      entry_price: null,
      entry_zone: null,
      stop_loss: null,
      take_profit: null,
      risk_reward: null,
      all_levels: null,
      overview: null,
      reasoning: null,
      confluences: null,
      patterns: null,
      order_blocks: null,
    };

    return NextResponse.json({
      analysis: guestAnalysis,
      isGuest: true,
      message: "Create a free account to unlock Entry, SL, TP & full analysis",
    });
  } catch (error) {
    console.error("Guest analyze error:", error);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
