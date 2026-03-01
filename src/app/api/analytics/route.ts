import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getService = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Track user events — plan views, clicks, page visits, tab switches
 * POST { event, plan_id?, page?, action?, element?, source?, metadata? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, plan_id, page, action, element, source, metadata, user_id } = body;

    if (!event) return NextResponse.json({ error: "event required" }, { status: 400 });

    const service = getService();

    // Plan-related events go to plan_analytics
    if (event === "plan_view" || event === "plan_click" || event === "checkout_start" || event === "checkout_complete" || event === "checkout_abandon") {
      await service.from("plan_analytics").insert({
        user_id: user_id || null,
        plan_id: plan_id || "unknown",
        event: event.replace("plan_", ""),
        source: source || null,
        metadata: metadata || {},
      });
    }

    // Page/click events go to user_sessions
    if (event === "page_view" || event === "click" || event === "tab_switch") {
      await service.from("user_sessions").insert({
        user_id: user_id || null,
        page: page || "/unknown",
        action: action || event,
        element: element || null,
        metadata: metadata || {},
      });
    }

    // All events also go to visitor_events for unified tracking
    await service.from("visitor_events").insert({
      event_type: event,
      source: source || element || null,
      user_id: user_id || null,
      metadata: { ...metadata, plan_id, page, action, element },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ANALYTICS]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
