import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_PROMPT, USER_PROMPT } from "@/lib/prompts";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { checkCredits, deductCredit, recordScan } from "@/lib/credits";

export const maxDuration = 30;

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign in to analyze charts." }, { status: 401 });
    }

    // 2. Credit check
    const creditCheck = await checkCredits(user.id);
    if (!creditCheck.canScan) {
      return NextResponse.json({
        error: creditCheck.reason || "No scans remaining.",
        creditCheck,
      }, { status: 402 });
    }

    // 3. Validate file
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use PNG, JPG, or WebP." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
    }

    // 4. Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured." }, { status: 500 });
    }

    // 5. Call Claude Vision
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: USER_PROMPT },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", response.status, await response.text());
      return NextResponse.json({ error: `AI analysis failed (${response.status}).` }, { status: 502 });
    }

    const data = await response.json();
    const textContent = data.content?.find((c: { type: string }) => c.type === "text");
    if (!textContent?.text) {
      return NextResponse.json({ error: "No analysis returned." }, { status: 502 });
    }

    // 6. Parse response
    let analysisText = textContent.text.trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch {
      console.error("Parse failed:", analysisText);
      return NextResponse.json({ error: "AI returned invalid format." }, { status: 502 });
    }

    for (const field of ["pair", "timeframe", "trend", "bias", "confidence"]) {
      if (!(field in analysis)) {
        return NextResponse.json({ error: `Missing field: ${field}` }, { status: 502 });
      }
    }
    analysis.confidence = Math.max(0, Math.min(100, Number(analysis.confidence) || 50));
    if (!Array.isArray(analysis.annotations)) analysis.annotations = [];

    // Validate chart_bounds — ensure it exists and has reasonable values
    if (!analysis.chart_bounds || typeof analysis.chart_bounds !== "object") {
      // Default bounds for typical mobile chart screenshot
      analysis.chart_bounds = { x: 0.02, y: 0.18, w: 0.78, h: 0.65 };
    } else {
      const cb = analysis.chart_bounds;
      cb.x = Math.max(0, Math.min(0.3, Number(cb.x) || 0.02));
      cb.y = Math.max(0, Math.min(0.4, Number(cb.y) || 0.18));
      cb.w = Math.max(0.4, Math.min(1.0, Number(cb.w) || 0.78));
      cb.h = Math.max(0.3, Math.min(1.0, Number(cb.h) || 0.65));
      // Ensure bounds don't exceed image
      if (cb.x + cb.w > 1.0) cb.w = 1.0 - cb.x;
      if (cb.y + cb.h > 1.0) cb.h = 1.0 - cb.y;
    }

    // Clamp annotation coordinates to valid 0-1 range within chart bounds
    analysis.annotations = analysis.annotations.map((a: Record<string, unknown>) => {
      const clamped = { ...a };
      if (typeof clamped.x === "number") clamped.x = Math.max(0, Math.min(1, clamped.x as number));
      if (typeof clamped.y === "number") clamped.y = Math.max(0, Math.min(1, clamped.y as number));
      if (typeof clamped.y1 === "number") clamped.y1 = Math.max(0, Math.min(1, clamped.y1 as number));
      if (typeof clamped.y2 === "number") clamped.y2 = Math.max(0, Math.min(1, clamped.y2 as number));
      if (typeof clamped.x1 === "number") clamped.x1 = Math.max(0, Math.min(1, clamped.x1 as number));
      if (typeof clamped.x2 === "number") clamped.x2 = Math.max(0, Math.min(1, clamped.x2 as number));
      return clamped;
    });

    // ── TRADE SETUP VALIDATION ──
    // Ensure Entry/TP/SL follow correct logic for the bias
    const bias = (analysis.bias || "Neutral").toLowerCase();
    const points = analysis.annotations.filter((a: Record<string, unknown>) => a.type === "point");
    const entry = points.find((a: Record<string, unknown>) => a.label === "Entry");
    const tp = points.find((a: Record<string, unknown>) => a.label === "TP");
    const sl = points.find((a: Record<string, unknown>) => a.label === "SL");
    const sLine = analysis.annotations.find((a: Record<string, unknown>) => a.type === "line" && typeof a.label === "string" && (a.label as string).startsWith("S"));
    const rLine = analysis.annotations.find((a: Record<string, unknown>) => a.type === "line" && typeof a.label === "string" && (a.label as string).startsWith("R"));

    if (entry && tp && sl && sLine && rLine) {
      const sY = sLine.y as number;
      const rY = rLine.y as number;
      const alignX = 0.80; // Align all trade points vertically

      if (bias === "long" || bias === "neutral") {
        // Long: Entry near support, TP near resistance, SL below support
        // y=0 is top (high price), y=1 is bottom (low price)
        // So: TP.y < Entry.y < SL.y
        entry.y = sY;                           // Entry at support
        entry.x = alignX;
        tp.y = rY;                              // TP at resistance
        tp.x = alignX;
        sl.y = Math.min(1, sY + (sY - rY) * 0.3); // SL below support
        sl.x = alignX;
      } else if (bias === "short") {
        // Short: Entry near resistance, TP near support, SL above resistance
        // So: SL.y < Entry.y < TP.y
        entry.y = rY;                           // Entry at resistance
        entry.x = alignX;
        tp.y = sY;                              // TP at support
        tp.x = alignX;
        sl.y = Math.max(0, rY - (sY - rY) * 0.3); // SL above resistance
        sl.x = alignX;
      }

      // Fix arrow to match Entry → TP direction
      const arrow = analysis.annotations.find((a: Record<string, unknown>) => a.type === "arrow");
      if (arrow) {
        arrow.x = alignX - 0.06;
        arrow.y1 = entry.y as number;
        arrow.y2 = tp.y as number;
        arrow.color = bias === "short" ? "#ff4d6a" : "#00e5a0";
      }
    }

    // 7. Deduct credit AFTER successful analysis
    await deductCredit(user.id, creditCheck.source);

    // 8. Record scan
    await recordScan(user.id, creditCheck.source, analysis);

    // 9. Return with updated credit info
    const updatedCredits = await checkCredits(user.id);
    return NextResponse.json({
      analysis,
      credits: {
        dailyRemaining: updatedCredits.dailyRemaining,
        creditsBalance: updatedCredits.creditsBalance,
        source: creditCheck.source,
      },
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
