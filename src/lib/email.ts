import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_LOGIN!,
    pass: process.env.BREVO_SMTP_PASSWORD!,
  },
});

const FROM_EMAIL = "fxsynapseai@gmail.com";
const FROM_NAME = "FXSynapse AI";
const ADMIN_EMAIL = "fxsynapseai@gmail.com";

// ── Email templates ──

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0b0f;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:28px;">
      <span style="font-size:20px;font-weight:800;color:#00e5a0;letter-spacing:-0.5px;">FXSynapse</span>
      <span style="font-size:20px;font-weight:300;color:#fff;"> AI</span>
      <div style="font-size:9px;color:rgba(255,255,255,.3);letter-spacing:2px;margin-top:2px;">CHART INTELLIGENCE ENGINE</div>
    </div>
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:28px 24px;">
      ${content}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <div style="font-size:11px;color:rgba(255,255,255,.25);">© ${new Date().getFullYear()} FXSynapse AI. All rights reserved.</div>
      <div style="font-size:10px;color:rgba(255,255,255,.15);margin-top:4px;">AI-powered chart analysis for smarter trading decisions.</div>
    </div>
  </div>
</body>
</html>`;
}

// ── Send functions ──

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      html: baseTemplate(html),
    });
    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err);
    return false;
  }
}

export async function sendBulkEmail(recipients: string[], subject: string, html: string): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const to of recipients) {
    const ok = await sendEmail(to, subject, html);
    if (ok) sent++;
    else failed++;
    // Rate limit: 100ms between emails
    await new Promise(r => setTimeout(r, 100));
  }
  return { sent, failed };
}

// ── Pre-built emails ──

export async function sendPaymentSuccessToUser(email: string, planName: string, amount: string) {
  const html = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,229,160,.1);border:2px solid rgba(0,229,160,.2);display:inline-flex;align-items:center;justify-content:center;">
        <span style="font-size:28px;">✅</span>
      </div>
    </div>
    <h2 style="color:#fff;font-size:20px;text-align:center;margin:0 0 8px;">Payment Successful!</h2>
    <p style="color:rgba(255,255,255,.5);font-size:13px;text-align:center;margin:0 0 24px;">Your subscription is now active.</p>
    <div style="background:rgba(0,229,160,.04);border:1px solid rgba(0,229,160,.12);border-radius:12px;padding:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:rgba(255,255,255,.4);font-size:12px;">Plan</span>
        <span style="color:#00e5a0;font-size:13px;font-weight:700;">${planName}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:rgba(255,255,255,.4);font-size:12px;">Amount</span>
        <span style="color:#fff;font-size:13px;font-weight:600;">${amount}</span>
      </div>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://fxsynapse-ai.vercel.app/dashboard" style="display:inline-block;background:linear-gradient(135deg,#00e5a0,#00b87d);color:#0a0b0f;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:13px;font-weight:700;">Start Scanning →</a>
    </div>`;
  return sendEmail(email, `✅ ${planName} Activated — FXSynapse AI`, html);
}

export async function sendPaymentNotificationToAdmin(userEmail: string, planName: string, amount: string) {
  const html = `
    <h2 style="color:#00e5a0;font-size:18px;margin:0 0 16px;">💰 New Purchase!</h2>
    <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px;">
      <div style="margin-bottom:8px;"><span style="color:rgba(255,255,255,.4);font-size:11px;">User:</span> <span style="color:#fff;font-size:13px;">${userEmail}</span></div>
      <div style="margin-bottom:8px;"><span style="color:rgba(255,255,255,.4);font-size:11px;">Plan:</span> <span style="color:#00e5a0;font-size:13px;font-weight:700;">${planName}</span></div>
      <div><span style="color:rgba(255,255,255,.4);font-size:11px;">Amount:</span> <span style="color:#fff;font-size:13px;font-weight:600;">${amount}</span></div>
    </div>
    <div style="margin-top:16px;">
      <a href="https://fxsynapse-ai.vercel.app/admin" style="color:#4da0ff;font-size:12px;">View Admin Dashboard →</a>
    </div>`;
  return sendEmail(ADMIN_EMAIL, `💰 New Purchase: ${planName} — ${userEmail}`, html);
}

export async function sendChatNotificationToAdmin(userEmail: string, message: string) {
  const preview = message.length > 200 ? message.substring(0, 200) + "..." : message;
  const html = `
    <h2 style="color:#4da0ff;font-size:18px;margin:0 0 16px;">💬 New Chat Message</h2>
    <div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px;">
      <div style="margin-bottom:10px;"><span style="color:rgba(255,255,255,.4);font-size:11px;">From:</span> <span style="color:#fff;font-size:13px;">${userEmail}</span></div>
      <div style="color:rgba(255,255,255,.6);font-size:13px;line-height:1.5;white-space:pre-wrap;">${preview}</div>
    </div>
    <div style="margin-top:16px;">
      <a href="https://fxsynapse-ai.vercel.app/admin" style="color:#4da0ff;font-size:12px;">Reply in Admin Dashboard →</a>
    </div>`;
  return sendEmail(ADMIN_EMAIL, `💬 Chat from ${userEmail}`, html);
}

export async function sendFreeCreditsEmail(email: string, credits: number) {
  const html = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(240,185,11,.1);border:2px solid rgba(240,185,11,.2);display:inline-flex;align-items:center;justify-content:center;">
        <span style="font-size:28px;">🎁</span>
      </div>
    </div>
    <h2 style="color:#fff;font-size:20px;text-align:center;margin:0 0 8px;">${credits} Free Scan${credits > 1 ? "s" : ""} Added!</h2>
    <p style="color:rgba(255,255,255,.5);font-size:13px;text-align:center;margin:0 0 24px;">We've added ${credits} free AI chart scan${credits > 1 ? "s" : ""} to your account. Use ${credits > 1 ? "them" : "it"} before ${credits > 1 ? "they" : "it"} expire${credits > 1 ? "" : "s"}!</p>
    <div style="text-align:center;">
      <a href="https://fxsynapse-ai.vercel.app/dashboard" style="display:inline-block;background:linear-gradient(135deg,#00e5a0,#00b87d);color:#0a0b0f;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:13px;font-weight:700;">Scan Now →</a>
    </div>
    <p style="color:rgba(255,255,255,.25);font-size:10px;text-align:center;margin-top:20px;">Limited time offer. Credits will be available in your dashboard.</p>`;
  return sendEmail(email, `🎁 ${credits} Free Scan${credits > 1 ? "s" : ""} — FXSynapse AI`, html);
}
