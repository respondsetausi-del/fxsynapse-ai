/**
 * Marketing Email Templates for FXSynapse AI
 * Used by admin Quick Send and Broadcast
 */

const APP_URL = "https://fxsynapse-ai.vercel.app";
const CHAT_URL = `${APP_URL}/dashboard?chat=true`;

// ═══ Shared Components ═══

const ctaButton = (text: string, href: string, gradient = "linear-gradient(135deg,#00e5a0,#00b87d)") => `
  <div style="text-align:center;margin-top:28px;">
    <a href="${href}" style="display:inline-block;padding:14px 36px;background:${gradient};color:#0a0b0f;font-weight:800;text-decoration:none;border-radius:12px;font-size:14px;letter-spacing:0.3px;">${text}</a>
  </div>`;

const divider = `<div style="height:1px;background:rgba(255,255,255,.06);margin:24px 0;"></div>`;

const badge = (text: string, color = "#00e5a0") => `
  <div style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;background:${color}15;color:${color};border:1px solid ${color}30;">${text}</div>`;

// ═══ Marketing Templates ═══

export interface EmailTemplate {
  id: string;
  name: string;
  category: "winback" | "conversion" | "engagement" | "payment" | "promo";
  subject: string;
  html: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // ── WINBACK: Users who signed up but never scanned ──
  {
    id: "winback_free_scan",
    name: "🔥 Your Free Scan is Waiting",
    category: "winback",
    subject: "Your free AI chart scan is waiting — don't miss it",
    html: `
      ${badge("FREE SCAN")}
      <h2 style="color:#fff;font-size:22px;margin:16px 0 8px;">You left something behind 👀</h2>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 16px;">
        Hey trader — you signed up for FXSynapse AI but haven't used your <strong style="color:#00e5a0;">free chart scan</strong> yet.
      </p>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 16px;">
        Upload any forex chart screenshot and our AI will instantly draw support/resistance levels, trendlines, entry zones, take profit & stop loss — all in seconds.
      </p>
      <div style="background:rgba(0,229,160,.04);border:1px solid rgba(0,229,160,.12);border-radius:12px;padding:16px;margin:20px 0;">
        <div style="color:#00e5a0;font-size:12px;font-weight:700;margin-bottom:8px;">YOUR FREE SCAN INCLUDES:</div>
        <div style="color:rgba(255,255,255,.5);font-size:13px;line-height:1.8;">
          ✅ Full chart annotations<br>
          ✅ Support & resistance levels<br>
          ✅ Trade setup (Entry, TP, SL)<br>
          ✅ Risk:Reward ratio
        </div>
      </div>
      ${ctaButton("Use My Free Scan →", `${APP_URL}/dashboard?scanner=true`)}
      <p style="color:rgba(255,255,255,.25);font-size:11px;text-align:center;margin-top:20px;">No card required. Takes 10 seconds.</p>`,
  },
  {
    id: "winback_urgency",
    name: "⏰ Last Chance: Free Scan Expiring",
    category: "winback",
    subject: "⏰ Your free scan expires soon — use it now",
    html: `
      ${badge("EXPIRING SOON", "#f0b90b")}
      <h2 style="color:#fff;font-size:22px;margin:16px 0 8px;">Don't let your free scan go to waste</h2>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 16px;">
        You have <strong style="color:#f0b90b;">1 free AI chart scan</strong> on your FXSynapse account. Hundreds of traders are already using this to find better entries.
      </p>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 16px;">
        Just screenshot your chart → upload → get instant professional analysis. That's it.
      </p>
      ${ctaButton("Scan My Chart Now →", `${APP_URL}/dashboard?scanner=true`, "linear-gradient(135deg,#f0b90b,#d4a00a)")}`,
  },

  // ── CONVERSION: Free users → Paid ──
  {
    id: "convert_after_scan",
    name: "💎 Loved Your Scan? Get More",
    category: "conversion",
    subject: "You tried it — now unlock unlimited scans",
    html: `
      ${badge("UPGRADE")}
      <h2 style="color:#fff;font-size:22px;margin:16px 0 8px;">Your scan was just the beginning 🚀</h2>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 16px;">
        You've seen what FXSynapse AI can do with one chart. Imagine having this power for <strong style="color:#00e5a0;">every trade you take</strong>.
      </p>
      ${divider}
      <div style="display:grid;gap:12px;">
        <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px;">
          <div style="color:#00e5a0;font-weight:700;font-size:13px;">Starter — R49/mo</div>
          <div style="color:rgba(255,255,255,.4);font-size:12px;margin-top:4px;">15 scans/month • Full annotations • Trade setups</div>
        </div>
        <div style="background:rgba(0,229,160,.03);border:1px solid rgba(0,229,160,.15);border-radius:10px;padding:14px;">
          <div style="color:#00e5a0;font-weight:700;font-size:13px;">⭐ Pro — R99/mo <span style="font-size:10px;color:#f0b90b;">MOST POPULAR</span></div>
          <div style="color:rgba(255,255,255,.4);font-size:12px;margin-top:4px;">50 scans/month • AI News & Fundamentals • Confluence grading</div>
        </div>
        <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px;">
          <div style="color:#00e5a0;font-weight:700;font-size:13px;">Premium — R199/mo</div>
          <div style="color:rgba(255,255,255,.4);font-size:12px;margin-top:4px;">Unlimited scans • Priority processing • Priority support</div>
        </div>
      </div>
      ${ctaButton("Choose Your Plan →", `${APP_URL}/pricing`)}`,
  },

  // ── ENGAGEMENT: Feature showcase ──
  {
    id: "feature_showcase",
    name: "🧠 Did You Know? AI Features",
    category: "engagement",
    subject: "3 things FXSynapse AI can do that you haven't tried",
    html: `
      <h2 style="color:#fff;font-size:22px;margin:0 0 8px;">You're only scratching the surface 🧠</h2>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 24px;">
        FXSynapse AI does more than draw lines. Here's what most traders don't know:
      </p>
      <div style="margin-bottom:16px;">
        <div style="color:#00e5a0;font-size:24px;margin-bottom:4px;">1.</div>
        <div style="color:#fff;font-size:15px;font-weight:600;">Confluence Grading</div>
        <div style="color:rgba(255,255,255,.45);font-size:13px;line-height:1.6;">We score each trade setup based on how many indicators agree — more confluence = higher probability.</div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="color:#00e5a0;font-size:24px;margin-bottom:4px;">2.</div>
        <div style="color:#fff;font-size:15px;font-weight:600;">Multi-Timeframe Analysis</div>
        <div style="color:rgba(255,255,255,.45);font-size:13px;line-height:1.6;">Upload your H1 chart and we'll consider the higher timeframe context for your trade direction.</div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="color:#00e5a0;font-size:24px;margin-bottom:4px;">3.</div>
        <div style="color:#fff;font-size:15px;font-weight:600;">Fullscreen Annotated Charts</div>
        <div style="color:rgba(255,255,255,.45);font-size:13px;line-height:1.6;">Click to expand any scan result in fullscreen with all levels overlaid — perfect for your trading plan.</div>
      </div>
      ${ctaButton("Try It Now →", `${APP_URL}/dashboard?scanner=true`)}`,
  },

  // ── PAYMENT FOLLOW-UP ──
  {
    id: "payment_issue",
    name: "💳 Payment Trouble? We're Here",
    category: "payment",
    subject: "Having trouble with your payment? Let us help",
    html: `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(240,185,11,.1);border:2px solid rgba(240,185,11,.2);display:inline-flex;align-items:center;justify-content:center;">
          <span style="font-size:28px;">💳</span>
        </div>
      </div>
      <h2 style="color:#fff;font-size:20px;text-align:center;margin:0 0 8px;">Payment didn't go through?</h2>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;text-align:center;margin:0 0 20px;">
        We noticed your payment attempt didn't complete. No worries — we're here to help you get started.
      </p>
      <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:18px;">
        <div style="color:rgba(255,255,255,.4);font-size:11px;font-weight:700;margin-bottom:12px;">COMMON FIXES:</div>
        <div style="color:rgba(255,255,255,.5);font-size:13px;line-height:2;">
          💡 Try a different card or bank<br>
          💡 Make sure you have sufficient funds<br>
          💡 Disable your VPN if you're using one<br>
          💡 Try on a different browser
        </div>
      </div>
      ${divider}
      <p style="color:rgba(255,255,255,.55);font-size:14px;text-align:center;">
        Still stuck? Chat with us directly — we respond fast.
      </p>
      <div style="text-align:center;margin-top:16px;">
        <a href="${CHAT_URL}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#4da0ff,#2563eb);color:#fff;font-weight:700;text-decoration:none;border-radius:12px;font-size:14px;">💬 Chat with Support →</a>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <a href="${APP_URL}/pricing" style="color:#00e5a0;font-size:13px;text-decoration:none;">Or try subscribing again →</a>
      </div>`,
  },
  {
    id: "payment_retry",
    name: "🔄 Ready to Try Again?",
    category: "payment",
    subject: "Your FXSynapse AI plan is one click away",
    html: `
      ${badge("QUICK FIX", "#4da0ff")}
      <h2 style="color:#fff;font-size:22px;margin:16px 0 8px;">Let's get you scanning 🎯</h2>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 16px;">
        Your last payment didn't complete, but your account is ready and waiting. One successful payment and you'll have instant access to AI chart analysis.
      </p>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 16px;">
        <strong style="color:#fff;">Tip:</strong> If your card was declined, try using a different card. Debit cards from most SA banks work perfectly.
      </p>
      ${ctaButton("Complete My Subscription →", `${APP_URL}/pricing`)}
      ${divider}
      <p style="color:rgba(255,255,255,.35);font-size:12px;text-align:center;">
        Need help? <a href="${CHAT_URL}" style="color:#4da0ff;text-decoration:none;">Chat with our team →</a>
      </p>`,
  },

  // ── PROMO ──
  {
    id: "promo_limited",
    name: "🎉 Special Offer: Extra Scans",
    category: "promo",
    subject: "🎉 Limited time: Get bonus scans when you subscribe today",
    html: `
      ${badge("LIMITED OFFER", "#f0b90b")}
      <h2 style="color:#fff;font-size:22px;margin:16px 0 8px;">Subscribe today, get bonus scans 🎁</h2>
      <p style="color:rgba(255,255,255,.55);font-size:14px;line-height:1.7;margin:0 0 16px;">
        For a limited time, every new subscription gets <strong style="color:#f0b90b;">5 bonus scans</strong> added to your account — on top of your plan's regular allowance.
      </p>
      <div style="background:rgba(240,185,11,.04);border:1px solid rgba(240,185,11,.15);border-radius:12px;padding:16px;text-align:center;">
        <div style="color:#f0b90b;font-size:32px;font-weight:800;">+5 FREE</div>
        <div style="color:rgba(255,255,255,.4);font-size:12px;">bonus scans with any plan</div>
      </div>
      ${ctaButton("Claim My Bonus →", `${APP_URL}/pricing`, "linear-gradient(135deg,#f0b90b,#d4a00a)")}
      <p style="color:rgba(255,255,255,.25);font-size:11px;text-align:center;margin-top:16px;">Offer valid for a limited time only.</p>`,
  },
];

// Helper to get template by ID
export function getTemplate(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find(t => t.id === id);
}

// Get templates by category
export function getTemplatesByCategory(category: string): EmailTemplate[] {
  return EMAIL_TEMPLATES.filter(t => t.category === category);
}
