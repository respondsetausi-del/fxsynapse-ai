/**
 * FXSynapse Analytics — Track user events for business intelligence
 * Usage: trackEvent("plan_click", { plan_id: "pro", source: "paywall" })
 */

let cachedUserId: string | null = null;

export function setTrackingUserId(id: string) {
  cachedUserId = id;
}

export async function trackEvent(
  event: string,
  data?: {
    plan_id?: string;
    page?: string;
    action?: string;
    element?: string;
    source?: string;
    metadata?: Record<string, any>;
  }
) {
  try {
    // Fire and forget — don't block UI
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        user_id: cachedUserId,
        ...data,
      }),
    }).catch(() => {}); // silently fail
  } catch {
    // never crash the app for analytics
  }
}

// Common tracking helpers
export const track = {
  pageView: (page: string) => trackEvent("page_view", { page }),
  tabSwitch: (tab: string) => trackEvent("tab_switch", { element: tab, page: "/dashboard" }),
  planView: (planId: string, source?: string) => trackEvent("plan_view", { plan_id: planId, source }),
  planClick: (planId: string, source?: string) => trackEvent("plan_click", { plan_id: planId, source }),
  checkoutStart: (planId: string) => trackEvent("checkout_start", { plan_id: planId }),
  paywallShown: (source?: string) => trackEvent("paywall_shown", { source }),
  upgradeClick: (planId: string, source?: string) => trackEvent("plan_click", { plan_id: planId, source }),
  scanStart: () => trackEvent("click", { element: "scan_button", page: "/dashboard" }),
  affiliateClick: () => trackEvent("click", { element: "affiliate_banner", page: "/dashboard" }),
};
