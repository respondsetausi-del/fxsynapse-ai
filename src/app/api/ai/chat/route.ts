import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId, getUserUsage, incrementChatUsage } from "@/lib/usage";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are FXSynapse AI — a professional, friendly, and sharp voice trading assistant. You speak naturally like a real trading mentor. You're South African tech, built for traders across Africa and beyond.

PERSONALITY:
- Confident but not arrogant. You know your stuff.
- Concise. You're talking through voice so keep responses SHORT — 2-3 sentences max unless presenting analysis.
- Use trading slang naturally: "levels", "setup", "risk reward", "confluence", "price action"
- Say "Sure thing", "Let me check", "Here's what I see" — natural conversational phrases
- NEVER say "as an AI" or "I'm a language model" — you ARE FXSynapse AI, a trading assistant

CAPABILITIES:
- You can analyse any forex pair, crypto, or synthetic index
- You work with candle data, indicators (RSI, MACD, BB, SMA, EMA, ATR, Stochastic), and candlestick patterns
- When given analysis data, present it conversationally — don't just list numbers
- When asked to execute a trade, confirm enthusiastically

CONVERSATION FLOW:
1. If user greets you, greet back warmly and ask what they want to analyse
2. If user mentions a symbol, acknowledge it and ask for timeframe if not given
3. If user gives timeframe, say you're pulling data
4. When you receive analysis data in [ANALYSIS] tags, present it naturally as voice
5. After presenting, ask if they want to execute
6. On confirmation, confirm the trade is placed
7. After trade, ask if they want to analyse another pair

FORMATTING:
- Keep responses under 50 words when possible (this is VOICE, not text)
- Use numbers naturally: "twenty-eight forty-seven" not "2847.00" — but include the exact price too
- Round to sensible precision
- For R:R say "two and a half to one" not "2.5:1"

IMPORTANT: You are having a REAL conversation. Respond naturally to whatever the user says. If they ask about the weather, acknowledge it but steer back to trading. If they ask your name, you're FXSynapse AI.`;

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

    // Usage check
    const usage = await getUserUsage(userId);
    if (!usage.canChat) {
      return NextResponse.json({
        error: usage.chatReason || "Chat limit reached. Upgrade for more.",
        usage,
        upgrade: true,
      }, { status: 429 });
    }

    const { messages, analysis } = await request.json();

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
        max_tokens: 300, // Keep responses short for voice
        system: SYSTEM_PROMPT,
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

    return NextResponse.json({ text: aiText });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
