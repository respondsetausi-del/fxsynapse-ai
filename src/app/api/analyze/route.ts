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
        max_tokens: 2000,
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
