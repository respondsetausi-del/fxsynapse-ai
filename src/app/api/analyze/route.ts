import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_PROMPT, USER_PROMPT } from "@/lib/prompts";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { checkCredits, deductCredit, recordScan } from "@/lib/credits";

export const maxDuration = 60;

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

    // 5. Call Claude Vision (with retry + model fallback for 429/529)
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
        console.log(`[ANALYZE] ${model} returned ${response.status}, retry ${attempt + 1}/2...`);
        if (attempt < 1) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }

      if (response && response.ok) {
        console.log(`[ANALYZE] Success with model: ${model}`);
        break;
      }
      if (response && (response.status === 429 || response.status === 529)) {
        console.log(`[ANALYZE] ${model} overloaded after retries, trying fallback...`);
        continue;
      }
      break; // Other errors (400, 401, etc) — don't fallback
    }

    if (!response || !response.ok) {
      const status = response?.status || 500;
      const body = response ? await response.text() : "No response";
      console.error("Claude API error:", status, body);
      const msg = status === 529 ? "AI is temporarily overloaded — please try again in a minute." 
        : status === 429 ? "Too many requests — please wait a moment." 
        : `AI analysis failed (${status}).`;
      return NextResponse.json({ error: msg }, { status: 502 });
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
    // CRITICAL: strip commas from prices — parseFloat("5,250") returns 5!
    const parsePrice = (v: string | number | undefined | null): number => {
      if (v === undefined || v === null) return NaN;
      if (typeof v === "number") return v;
      return parseFloat(String(v).replace(/,/g, ""));
    };

    let priceHigh = parsePrice(analysis.price_high);
    let priceLow = parsePrice(analysis.price_low);

    // If price_high/price_low are missing, compute from annotation prices
    if (isNaN(priceHigh) || isNaN(priceLow) || priceHigh <= priceLow) {
      const allPrices: number[] = [];
      for (const a of analysis.annotations) {
        for (const key of ["price", "price_high", "price_low", "entry_price", "tp_price", "swing_high_price", "swing_low_price", "y1_price", "y2_price"]) {
          const p = parsePrice(a[key]);
          if (!isNaN(p) && p > 0) allPrices.push(p);
        }
      }
      // Also try top-level fields
      for (const key of ["current_price", "support", "resistance"]) {
        const p = parsePrice(analysis[key]);
        if (!isNaN(p) && p > 0) allPrices.push(p);
      }
      if (allPrices.length >= 2) {
        const computedHigh = Math.max(...allPrices);
        const computedLow = Math.min(...allPrices);
        // Add 5% padding so annotations don't sit at exact edges
        const padding = (computedHigh - computedLow) * 0.05;
        priceHigh = computedHigh + padding;
        priceLow = computedLow - padding;
        console.log("[ANALYZE] Computed price range from annotations:", priceLow.toFixed(2), "-", priceHigh.toFixed(2));
      }
    }

    const priceRange = priceHigh - priceLow;

    // Convert a price to y-coordinate (0=top/high, 1=bottom/low)
    const priceToY = (priceStr: string | number | undefined): number => {
      if (priceStr === undefined || priceStr === null) return 0.5;
      const price = parsePrice(priceStr);
      if (isNaN(price) || priceRange <= 0) return 0.5;
      const y = (priceHigh - price) / priceRange;
      return Math.max(0.01, Math.min(0.99, y));
    };

    const hasPriceData = !isNaN(priceHigh) && !isNaN(priceLow) && priceRange > 0;
    console.log("[ANALYZE] Price data:", { priceHigh, priceLow, priceRange, hasPriceData, annotationCount: analysis.annotations.length });

    if (hasPriceData) {
      analysis.current_price_y = priceToY(analysis.current_price);

      // Convert all annotations from prices to y-coordinates
      analysis.annotations = analysis.annotations.map((a: Record<string, unknown>) => {
        const converted = { ...a };

        // Line / Liquidity: price → y
        if ((a.type === "line" || a.type === "liquidity") && a.price) {
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
          if (!converted.x) converted.x = 0.92;
        }

        // Arrow: entry_price/tp_price → y1/y2
        if (a.type === "arrow") {
          if (a.entry_price && a.tp_price) {
            converted.y1 = priceToY(a.entry_price as string);
            converted.y2 = priceToY(a.tp_price as string);
          }
          if (!converted.x) converted.x = 0.92;
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

        // Clamp all coordinate values
        const clamp = (v: unknown) => typeof v === "number" ? Math.max(0.01, Math.min(0.99, v)) : v;
        for (const key of ["x", "y", "y1", "y2", "x1", "x2", "y_0", "y_100"]) {
          if (key in converted) converted[key] = clamp(converted[key]);
        }

        return converted;
      });

      // Log for debugging
      const convertedTypes = analysis.annotations.map((a: Record<string, unknown>) => 
        `${a.type}(y=${a.y ?? a.y1 ?? "?"})`
      ).join(", ");
      console.log("[ANALYZE] Converted annotations:", convertedTypes);

    } else {
      // Fallback: if annotations already have y-coordinates (0-1 range), clamp them
      // If they have price fields but no price range, try to detect and handle
      console.warn("[ANALYZE] No valid price range! Checking for raw y-coordinates...");
      
      analysis.annotations = analysis.annotations.map((a: Record<string, unknown>) => {
        const fixed = { ...a };
        const clamp = (v: unknown) => typeof v === "number" ? Math.max(0.01, Math.min(0.99, v)) : v;
        
        // Check if y values exist and are in 0-1 range (AI returned coords not prices)
        for (const key of ["x", "y", "y1", "y2", "x1", "x2", "y_0", "y_100"]) {
          if (key in fixed) {
            const val = fixed[key];
            if (typeof val === "number" && val >= 0 && val <= 1) {
              fixed[key] = clamp(val);
            }
          }
        }
        return fixed;
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

    // 8. Record scan + update last_seen_at
    await recordScan(user.id, creditCheck.source, analysis);

    // 9. Return with updated credit info
    const updatedCredits = await checkCredits(user.id);
    return NextResponse.json({
      analysis,
      credits: {
        canScan: updatedCredits.canScan,
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
