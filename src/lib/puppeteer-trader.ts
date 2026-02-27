/* ─── MT5 Puppeteer Trading Engine ───
 * Automates the Deriv MT5 Web Terminal via headless Chrome.
 * No API keys, no reverse engineering — just browser automation.
 * 
 * Flow: Open terminal → Login → Execute trades → Screenshot state
 */

import puppeteer, { Browser, Page } from "puppeteer";

/* ─── Types ─── */
export interface MT5Session {
  id: string;
  browser: Browser;
  page: Page;
  login: string;
  server: string;
  serverUrl: string;
  connected: boolean;
  lastActivity: number;
}

export interface ConnectParams {
  login: string;
  password: string;
  server: string;
  serverUrl: string;
}

export interface TradeParams {
  sessionId: string;
  symbol: string;
  type: "BUY" | "SELL";
  lots: number;
  sl?: number;
  tp?: number;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  price?: number;
  error?: string;
  screenshot?: string; // base64
}

export interface SessionInfo {
  id: string;
  login: string;
  server: string;
  connected: boolean;
  lastActivity: number;
}

/* ─── Session Store (in-memory, per-server-instance) ─── */
const sessions = new Map<string, MT5Session>();

// Auto-cleanup inactive sessions (30 min timeout)
const SESSION_TIMEOUT = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      console.log(`[MT5] Cleaning up inactive session: ${id}`);
      session.browser.close().catch(() => {});
      sessions.delete(id);
    }
  }
}, 60_000);

/* ─── Helper: Generate session ID ─── */
function genSessionId(): string {
  return `mt5_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/* ─── Helper: Delay ─── */
function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/* ─── Helper: Safe screenshot as base64 ─── */
async function takeScreenshot(page: Page): Promise<string> {
  try {
    const buf = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 70 });
    return typeof buf === "string" ? buf : Buffer.from(buf).toString("base64");
  } catch {
    return "";
  }
}

/* ─── Helper: Wait for selector with timeout, return null on fail ─── */
async function safeWaitFor(page: Page, selector: string, timeout = 10000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

/* ─── CONNECT: Launch browser & login to MT5 terminal ─── */
export async function connectMT5(params: ConnectParams): Promise<{ session: SessionInfo; screenshot: string; error?: string }> {
  const { login, password, server, serverUrl } = params;
  const sessionId = genSessionId();

  let browser: Browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--window-size=1280,720",
      ],
    });
  } catch (err: any) {
    return {
      session: { id: "", login, server, connected: false, lastActivity: Date.now() },
      screenshot: "",
      error: `Browser launch failed: ${err.message}`,
    };
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Set a realistic user agent
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  try {
    // Navigate to the terminal
    const terminalUrl = `${serverUrl}?login=${login}&server=${server}`;
    console.log(`[MT5] Navigating to: ${terminalUrl}`);
    await page.goto(terminalUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await delay(3000); // Let the terminal initialize

    let screenshot = await takeScreenshot(page);

    // ── Strategy 1: Look for DOM-based login form ──
    // The MT5 web terminal typically shows a connection dialog
    const loginFieldSelectors = [
      'input[name="login"]', 'input[id="login"]', 'input[placeholder*="Login"]',
      'input[placeholder*="login"]', 'input[type="text"]', 'input[name="Login"]',
      '#login', '.login-input', 'input[autocomplete="username"]',
    ];

    const passwordFieldSelectors = [
      'input[name="password"]', 'input[id="password"]', 'input[type="password"]',
      'input[placeholder*="Password"]', 'input[placeholder*="password"]',
      '#password', '.password-input',
    ];

    const connectButtonSelectors = [
      'button[type="submit"]', 'input[type="submit"]',
      'button:has-text("Connect")', 'button:has-text("Login")', 'button:has-text("OK")',
      '.connect-btn', '#connect-btn', '.login-btn',
      'button.primary', 'button.btn-primary',
    ];

    let loginFilled = false;
    let passwordFilled = false;

    // Try to find and fill login field
    for (const sel of loginFieldSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click({ clickCount: 3 }); // Select all
          await el.type(login, { delay: 50 });
          loginFilled = true;
          console.log(`[MT5] Login filled via: ${sel}`);
          break;
        }
      } catch { /* try next */ }
    }

    // Try to find and fill password field
    for (const sel of passwordFieldSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(password, { delay: 50 });
          passwordFilled = true;
          console.log(`[MT5] Password filled via: ${sel}`);
          break;
        }
      } catch { /* try next */ }
    }

    // Try server selection if there's a dropdown
    const serverSelectors = [
      'select[name="server"]', 'select#server', '.server-select', 'select',
    ];
    for (const sel of serverSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await page.select(sel, server);
          console.log(`[MT5] Server selected via: ${sel}`);
          break;
        }
      } catch { /* try next */ }
    }

    // Click connect/login button
    if (loginFilled && passwordFilled) {
      for (const sel of connectButtonSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            console.log(`[MT5] Connect clicked via: ${sel}`);
            break;
          }
        } catch { /* try next */ }
      }

      // Also try pressing Enter as fallback
      await page.keyboard.press("Enter");
      await delay(5000); // Wait for connection
    }

    // ── Strategy 2: If no DOM form found, try keyboard-based login ──
    if (!loginFilled || !passwordFilled) {
      console.log("[MT5] DOM login form not found, trying keyboard approach...");
      // Tab through any dialogs and type credentials
      await page.keyboard.press("Tab");
      await delay(300);
      await page.keyboard.type(login, { delay: 50 });
      await page.keyboard.press("Tab");
      await delay(300);
      await page.keyboard.type(password, { delay: 50 });
      await page.keyboard.press("Enter");
      await delay(5000);
    }

    screenshot = await takeScreenshot(page);

    // Store session
    const session: MT5Session = {
      id: sessionId,
      browser,
      page,
      login,
      server,
      serverUrl,
      connected: true,
      lastActivity: Date.now(),
    };
    sessions.set(sessionId, session);

    return {
      session: {
        id: sessionId,
        login,
        server,
        connected: true,
        lastActivity: Date.now(),
      },
      screenshot,
    };

  } catch (err: any) {
    const screenshot = await takeScreenshot(page);
    await browser.close();
    return {
      session: { id: "", login, server, connected: false, lastActivity: Date.now() },
      screenshot,
      error: `Connection failed: ${err.message}`,
    };
  }
}

/* ─── EXECUTE TRADE: Automate the New Order dialog ─── */
export async function executeTrade(params: TradeParams): Promise<TradeResult> {
  const { sessionId, symbol, type, lots, sl, tp } = params;
  const session = sessions.get(sessionId);

  if (!session || !session.connected) {
    return { success: false, error: "Session not found or disconnected" };
  }

  const { page } = session;
  session.lastActivity = Date.now();

  try {
    // ── Step 1: Open New Order dialog ──
    // Try F9 shortcut (standard MT5 shortcut for New Order)
    await page.keyboard.press("F9");
    await delay(2000);

    let screenshot = await takeScreenshot(page);

    // ── Step 2: Try to find and fill the order dialog ──
    // Look for symbol/volume inputs in the order dialog
    const symbolSelectors = [
      'input[name="symbol"]', 'input[placeholder*="Symbol"]', 'input[placeholder*="symbol"]',
      '.symbol-input', '#symbol', 'input[data-field="symbol"]',
      '.order-symbol input', '.new-order input[type="text"]:first-of-type',
    ];

    const volumeSelectors = [
      'input[name="volume"]', 'input[name="lots"]', 'input[placeholder*="Volume"]',
      'input[placeholder*="Lot"]', '.volume-input', '#volume', '#lots',
      'input[data-field="volume"]', '.order-volume input',
      '.new-order input[type="number"]',
    ];

    const slSelectors = [
      'input[name="sl"]', 'input[name="stop_loss"]', 'input[placeholder*="Stop"]',
      'input[data-field="sl"]', '.sl-input', '#stop-loss',
    ];

    const tpSelectors = [
      'input[name="tp"]', 'input[name="take_profit"]', 'input[placeholder*="Profit"]',
      'input[data-field="tp"]', '.tp-input', '#take-profit',
    ];

    // Fill symbol
    for (const sel of symbolSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(symbol, { delay: 30 });
          console.log(`[MT5] Symbol filled: ${symbol} via ${sel}`);
          await page.keyboard.press("Enter"); // Confirm symbol
          await delay(500);
          break;
        }
      } catch { /* try next */ }
    }

    // Fill volume/lots
    for (const sel of volumeSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(lots.toString(), { delay: 30 });
          console.log(`[MT5] Volume filled: ${lots} via ${sel}`);
          break;
        }
      } catch { /* try next */ }
    }

    // Fill SL if provided
    if (sl) {
      for (const sel of slSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click({ clickCount: 3 });
            await el.type(sl.toString(), { delay: 30 });
            break;
          }
        } catch { /* try next */ }
      }
    }

    // Fill TP if provided
    if (tp) {
      for (const sel of tpSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click({ clickCount: 3 });
            await el.type(tp.toString(), { delay: 30 });
            break;
          }
        } catch { /* try next */ }
      }
    }

    await delay(500);

    // ── Step 3: Click Buy or Sell button ──
    const buySelectors = [
      'button:has-text("Buy")', '.buy-btn', '#buy-button', 'button.buy',
      '[data-action="buy"]', '.order-buy', 'button[class*="buy"]',
      'button[title*="Buy"]', '.btn-buy',
    ];

    const sellSelectors = [
      'button:has-text("Sell")', '.sell-btn', '#sell-button', 'button.sell',
      '[data-action="sell"]', '.order-sell', 'button[class*="sell"]',
      'button[title*="Sell"]', '.btn-sell',
    ];

    const targetSelectors = type === "BUY" ? buySelectors : sellSelectors;
    let clicked = false;

    for (const sel of targetSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          clicked = true;
          console.log(`[MT5] ${type} clicked via: ${sel}`);
          break;
        }
      } catch { /* try next */ }
    }

    // Fallback: try to find buttons by text content via evaluate
    if (!clicked) {
      const buttonText = type === "BUY" ? "Buy" : "Sell";
      clicked = await page.evaluate((text) => {
        const buttons = Array.from(document.querySelectorAll("button, [role='button'], a.btn"));
        for (const btn of buttons) {
          if (btn.textContent?.toLowerCase().includes(text.toLowerCase())) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, buttonText);
    }

    await delay(3000); // Wait for order execution

    screenshot = await takeScreenshot(page);

    // ── Step 4: Check for confirmation or error ──
    // Look for success/error messages
    const resultText = await page.evaluate(() => {
      // Look for any visible alerts, notifications, or result messages
      const alertSelectors = [
        ".alert", ".notification", ".message", ".result", ".order-result",
        ".success", ".error", "[class*='alert']", "[class*='notification']",
        "[class*='message']", "[class*='result']", "[class*='toast']",
      ];
      for (const sel of alertSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
      return "";
    });

    // Close any dialog that might still be open
    await page.keyboard.press("Escape");
    await delay(500);

    if (!clicked) {
      return {
        success: false,
        error: "Could not find Buy/Sell button — check screenshot for terminal state",
        screenshot,
      };
    }

    return {
      success: true,
      screenshot,
      ...(resultText ? { orderId: resultText } : {}),
    };

  } catch (err: any) {
    const screenshot = await takeScreenshot(page);
    return {
      success: false,
      error: `Trade execution error: ${err.message}`,
      screenshot,
    };
  }
}

/* ─── SCREENSHOT: Get current terminal state ─── */
export async function getScreenshot(sessionId: string): Promise<{ screenshot: string; error?: string }> {
  const session = sessions.get(sessionId);
  if (!session) return { screenshot: "", error: "Session not found" };

  session.lastActivity = Date.now();
  const screenshot = await takeScreenshot(session.page);
  return { screenshot };
}

/* ─── DISCOVER: Map the terminal DOM for debugging ─── */
export async function discoverDOM(sessionId: string): Promise<{ elements: any; screenshot: string; error?: string }> {
  const session = sessions.get(sessionId);
  if (!session) return { elements: null, screenshot: "", error: "Session not found" };

  session.lastActivity = Date.now();

  const elements = await session.page.evaluate(() => {
    const result: any = {
      inputs: [] as any[],
      buttons: [] as any[],
      selects: [] as any[],
      iframes: [] as any[],
      canvas: [] as any[],
      dialogs: [] as any[],
    };

    // Map all interactive elements
    document.querySelectorAll("input").forEach((el) => {
      const rect = el.getBoundingClientRect();
      result.inputs.push({
        tag: "input",
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        className: el.className.substring(0, 80),
        value: el.value,
        visible: rect.width > 0 && rect.height > 0,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    });

    document.querySelectorAll("button, [role='button']").forEach((el) => {
      const rect = el.getBoundingClientRect();
      result.buttons.push({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().substring(0, 60),
        id: el.id,
        className: el.className.toString().substring(0, 80),
        visible: rect.width > 0 && rect.height > 0,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    });

    document.querySelectorAll("select").forEach((el) => {
      const rect = el.getBoundingClientRect();
      const options = Array.from(el.options).map(o => ({ value: o.value, text: o.text }));
      result.selects.push({
        tag: "select",
        name: el.name,
        id: el.id,
        className: el.className.substring(0, 80),
        options: options.slice(0, 20),
        visible: rect.width > 0 && rect.height > 0,
      });
    });

    document.querySelectorAll("iframe").forEach((el) => {
      result.iframes.push({ src: el.src, id: el.id, name: el.name });
    });

    document.querySelectorAll("canvas").forEach((el) => {
      const rect = el.getBoundingClientRect();
      result.canvas.push({
        id: el.id,
        className: el.className.substring(0, 80),
        width: el.width,
        height: el.height,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    });

    // Check for dialog/modal overlays
    document.querySelectorAll("[role='dialog'], .modal, .dialog, [class*='modal'], [class*='dialog'], [class*='popup']").forEach((el) => {
      const rect = el.getBoundingClientRect();
      result.dialogs.push({
        tag: el.tagName.toLowerCase(),
        id: el.id,
        className: el.className.toString().substring(0, 80),
        visible: rect.width > 0 && rect.height > 0,
        html: el.innerHTML.substring(0, 300),
      });
    });

    return result;
  });

  const screenshot = await takeScreenshot(session.page);
  return { elements, screenshot };
}

/* ─── DISCONNECT: Close browser session ─── */
export async function disconnectMT5(sessionId: string): Promise<{ success: boolean }> {
  const session = sessions.get(sessionId);
  if (!session) return { success: false };

  try {
    await session.browser.close();
  } catch { /* ignore */ }

  sessions.delete(sessionId);
  return { success: true };
}

/* ─── LIST SESSIONS ─── */
export function listSessions(): SessionInfo[] {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    login: s.login,
    server: s.server,
    connected: s.connected,
    lastActivity: s.lastActivity,
  }));
}
