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

    // 2. Credit check — handles both subscriptions and free trial credits
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
        max_tokens: 5000,
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

    // ── Validate chart_bounds ──
    if (!analysis.chart_bounds || typeof analysis.chart_bounds !== "object") {
      analysis.chart_bounds = { x: 0.02, y: 0.18, w: 0.78, h: 0.65 };
    } else {
      const cb = analysis.chart_bounds;
      cb.x = Math.max(0, Math.min(0.3, Number(cb.x) || 0.02));
      cb.y = Math.max(0, Math.min(0.4, Number(cb.y) || 0.18));
      cb.w = Math.max(0.4, Math.min(1.0, Number(cb.w) || 0.78));
      cb.h = Math.max(0.3, Math.min(1.0, Number(cb.h) || 0.65));
      if (cb.x + cb.w > 1.0) cb.w = 1.0 - cb.x;
      if (cb.y + cb.h > 1.0) cb.h = 1.0 - cb.y;
    }

    // ═══ PRICE-TO-COORDINATE CONVERSION ═══
    // The AI returns actual prices — we convert to 0-1 y-coordinates
    const priceHigh = parseFloat(analysis.price_high);
    const priceLow = parseFloat(analysis.price_low);
    const priceRange = priceHigh - priceLow;

    // Convert a price string to a y-coordinate (0=top/high, 1=bottom/low)
    const priceToY = (priceStr: string | number | undefined): number => {
      if (priceStr === undefined || priceStr === null) return 0.5;
      const price = typeof priceStr === "string" ? parseFloat(priceStr) : priceStr;
      if (isNaN(price) || priceRange <= 0) return 0.5;
      // Higher price = lower y (top of chart), lower price = higher y (bottom)
      const y = (priceHigh - price) / priceRange;
      return Math.max(0.01, Math.min(0.99, y));
    };

    // Only use price conversion if we have valid price range
    const hasPriceData = !isNaN(priceHigh) && !isNaN(priceLow) && priceRange > 0;

    if (hasPriceData) {
      // Store current_price_y for reference
      analysis.current_price_y = priceToY(analysis.current_price);

      // Convert all annotations from prices to y-coordinates
      analysis.annotations = analysis.annotations.map((a: Record<string, unknown>) => {
        const converted = { ...a };

        // Line: price → y
        if (a.type === "line" && a.price) {
          converted.y = priceToY(a.price as string);
        }

        // Zone / FVG: price_high/price_low → y1/y2
        if ((a.type === "zone" || a.type === "fvg") && a.price_high && a.price_low) {
          converted.y1 = priceToY(a.price_high as string);
          converted.y2 = priceToY(a.price_low as string);
        }

        // Point (Entry/TP/SL): price → y, x at right edge
        if (a.type === "point" && a.price) {
          converted.y = priceToY(a.price as string);
          converted.x = 0.92;
        }

        // Arrow: entry_price/tp_price → y1/y2
        if (a.type === "arrow" && a.entry_price && a.tp_price) {
          converted.x = 0.92;
          converted.y1 = priceToY(a.entry_price as string);
          converted.y2 = priceToY(a.tp_price as string);
        }

        // Trendline: y1_price/y2_price → y1/y2
        if (a.type === "trend" && a.y1_price && a.y2_price) {
          converted.y1 = priceToY(a.y1_price as string);
          converted.y2 = priceToY(a.y2_price as string);
        }

        // Fib: swing_high_price/swing_low_price → y_0/y_100
        if (a.type === "fib" && a.swing_high_price && a.swing_low_price) {
          converted.y_0 = priceToY(a.swing_high_price as string);
          converted.y_100 = priceToY(a.swing_low_price as string);
        }

        // Pattern / BOS / CHoCH: price → y
        if ((a.type === "pattern" || a.type === "bos" || a.type === "choch") && a.price) {
          converted.y = priceToY(a.price as string);
        }

        // Liquidity: price → y
        if (a.type === "liquidity" && a.price) {
          converted.y = priceToY(a.price as string);
        }

        // Clamp all computed y values
        const clamp = (v: unknown) => typeof v === "number" ? Math.max(0.01, Math.min(0.99, v)) : v;
        for (const key of ["x", "y", "y1", "y2", "x1", "x2", "y_0", "y_100"]) {
          if (key in converted) converted[key] = clamp(converted[key]);
        }

        return converted;
      });
    } else {
      // Fallback: clamp any raw y values the AI may have returned
      analysis.annotations = analysis.annotations.map((a: Record<string, unknown>) => {
        const clamped = { ...a };
        const clamp = (v: unknown) => typeof v === "number" ? Math.max(0.01, Math.min(0.99, v)) : v;
        for (const key of ["x", "y", "y1", "y2", "x1", "x2", "y_0", "y_100"]) {
          if (key in clamped) clamped[key] = clamp(clamped[key]);
        }
        return clamped;
      });
    }

    // ── Trade setup validation ──
    const bias = (analysis.bias || "Neutral").toLowerCase();
    const points = analysis.annotations.filter((a: Record<string, unknown>) => a.type === "point");
    const entry = points.find((a: Record<string, unknown>) => a.label === "Entry");
    const tp = points.find((a: Record<string, unknown>) => a.label === "TP");
    const sl = points.find((a: Record<string, unknown>) => a.label === "SL");

    if (entry && tp && sl) {
      // Ensure all share same x (right edge)
      const sharedX = 0.92;
      entry.x = sharedX;
      tp.x = sharedX;
      sl.x = sharedX;

      const eY = entry.y as number;
      const tY = tp.y as number;
      const sY = sl.y as number;

      // Validate direction logic
      if (bias === "long" || bias === "neutral") {
        // Long: TP above entry (lower y), SL below (higher y)
        if (tY > eY) { tp.y = sY; sl.y = tY; } // Swap if wrong
        if ((sl.y as number) < eY) {
          sl.y = Math.min(0.99, eY + Math.abs(eY - (tp.y as number)) * 0.4);
        }
      } else if (bias === "short") {
        // Short: TP below entry (higher y), SL above (lower y)
        if (tY < eY) { tp.y = sY; sl.y = tY; }
        if ((sl.y as number) > eY) {
          sl.y = Math.max(0.01, eY - Math.abs(eY - (tp.y as number)) * 0.4);
        }
      }

      // Fix arrow
      const arrow = analysis.annotations.find((a: Record<string, unknown>) => a.type === "arrow");
      if (arrow) {
        arrow.x = sharedX;
        arrow.y1 = entry.y;
        arrow.y2 = tp.y;
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
        monthlyUsed: updatedCredits.monthlyUsed,
        monthlyLimit: updatedCredits.monthlyLimit,
        monthlyRemaining: updatedCredits.monthlyRemaining,
        topupBalance: updatedCredits.topupBalance,
        source: creditCheck.source,
        planName: updatedCredits.planName,
        dailyRemaining: updatedCredits.monthlyRemaining,
        creditsBalance: updatedCredits.topupBalance,
      },
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
