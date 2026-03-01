import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId, getUserUsage, incrementChatUsage } from "@/lib/usage";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are FXSynapse AI — a sharp, professional trading mentor built into the FXSynapse platform. You help traders with analysis, strategy, risk management, and education.

PERSONALITY:
- Confident and knowledgeable — you know your stuff
- Concise but thorough when needed. Default to 2-4 sentences, expand for analysis
- Use trading terminology naturally: levels, setups, R:R, confluence, price action, structure
- Friendly but focused — you're a mentor, not a chatbot
- NEVER say "as an AI" or "I'm a language model" — you ARE FXSynapse AI

CAPABILITIES:
- Analyse any forex pair, crypto, index, or commodity
- Work with indicators: RSI, MACD, BB, SMA, EMA, ATR, Stochastic, Ichimoku
- Smart money concepts: order blocks, FVGs, liquidity sweeps, market structure
- Risk management calculations, position sizing, R:R analysis
- Trading psychology and discipline coaching
- News/fundamental impact analysis

FORMATTING (TEXT CHAT):
- Use **bold** for key levels and important terms
- Use bullet points for multi-part analysis
- Include exact prices with proper decimal places
- Format R:R as 1:2.5 (not "two point five to one")
- Keep responses focused — no fluff
- If asked to analyse, structure as: Bias → Key Levels → Entry/SL/TP → Confluences

RULES:
- Always include risk disclaimers for specific trade ideas
- Never guarantee profits — trading involves risk
- If you don't have live data, say so and give framework-based analysis
- Encourage proper risk management (1-2% per trade max)`;

const VOICE_SYSTEM_PROMPT = `You are FXSynapse AI — a professional, friendly, and sharp voice trading assistant. Keep responses under 50 words. Use natural conversational phrases. Present numbers naturally. You're a trading mentor speaking through voice.`;

export async function POST(request: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // Auth check
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });
    }

    // Admin-only — AI Chat disabled for regular users to save API costs
    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: profile } = await service.from("profiles").select("role").eq("id", userId).single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "AI Chat is coming soon. Stay tuned!", upgrade: true }, { status: 403 });
    }

    // Usage check
    const usage = await getUserUsage(userId);
    if (!usage.canChat) {
      return NextResponse.json({
        error: usage.chatReason || "Chat limit reached. Upgrade for more.",
        usage,
        upgrade: true,
      }, { status: 429 });
    }

    const { messages, analysis, mode } = await request.json();
    const isVoice = mode === "voice";

    // Build messages array for Claude
    const claudeMessages = messages.map((m: any) => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    }));

    // If analysis data is provided, inject it as context
    if (analysis) {
      const lastUserMsg = claudeMessages[claudeMessages.length - 1];
      if (lastUserMsg && lastUserMsg.role === "user") {
        lastUserMsg.content += `\n\n[ANALYSIS DATA - Present this conversationally as if you just analysed it yourself]\n${JSON.stringify(analysis, null, 2)}`;
      }
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: isVoice ? 300 : 1024,
        system: isVoice ? VOICE_SYSTEM_PROMPT : SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await response.json();
    const aiText = data.content?.[0]?.text || "Sorry, I didn't catch that. Could you try again?";

    // Increment chat usage after successful response
    await incrementChatUsage(userId);
    const updatedUsage = await getUserUsage(userId);

    return NextResponse.json({ text: aiText, usage: updatedUsage });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
