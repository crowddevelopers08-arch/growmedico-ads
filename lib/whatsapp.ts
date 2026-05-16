/**
 * AdPulse — WhatsApp Notification Service
 *
 * Uses Twilio's WhatsApp API (no SDK — raw fetch).
 * Docs: https://www.twilio.com/docs/whatsapp/api
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID   — Your Twilio Account SID
 *   TWILIO_AUTH_TOKEN    — Your Twilio Auth Token
 *   TWILIO_WHATSAPP_FROM — Sender number (e.g. whatsapp:+14155238886 for sandbox)
 *
 * Optional:
 *   WHATSAPP_ADMIN_PHONE — Admin number that receives ALL alerts (e.g. +1234567890)
 */

const TWILIO_BASE = "https://api.twilio.com/2010-04-01/Accounts";

export interface WhatsAppPayload {
  /** Recipient phone in E.164 format, e.g. +1234567890 */
  to: string;
  message: string;
}

// ── Core send function ───────────────────────────────────────

export async function sendWhatsAppMessage(payload: WhatsAppPayload): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    // Not configured — skip silently (don't break sync)
    return;
  }

  // Normalize recipient: prefix whatsapp: if not already present
  const to = payload.to.startsWith("whatsapp:") ? payload.to : `whatsapp:${payload.to}`;

  const body = new URLSearchParams({ From: from, To: to, Body: payload.message });

  const response = await fetch(`${TWILIO_BASE}/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    // Log but don't throw — WhatsApp failure should never block sync
    console.error("[WhatsApp] Failed to send message:", err?.message ?? response.statusText);
  }
}

// ── Alert notification helpers ───────────────────────────────

export interface AlertNotificationOptions {
  clientName: string;
  clientId: string;
  alertMessage: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  /** Per-client WhatsApp number from DB */
  clientWhatsappPhone?: string | null;
}

const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: "🚨",
  WARNING: "⚠️",
  INFO: "ℹ️",
};

/**
 * Send a WhatsApp alert notification.
 * Sends to both the client's number (if set) and the admin number (if set).
 * Failures are swallowed — this must never break the sync pipeline.
 */
export async function sendAlertNotification(opts: AlertNotificationOptions): Promise<void> {
  const emoji = SEVERITY_EMOJI[opts.severity] ?? "⚠️";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const message =
    `${emoji} *AdPulse Alert — ${opts.clientName}*\n\n` +
    `${opts.alertMessage}\n\n` +
    `View details: ${appUrl}/clients/${opts.clientId}`;

  const recipients: string[] = [];

  // 1. Per-client WhatsApp number
  if (opts.clientWhatsappPhone) {
    recipients.push(opts.clientWhatsappPhone);
  }

  // 2. Global admin number (receives all alerts)
  const adminPhone = process.env.WHATSAPP_ADMIN_PHONE;
  if (adminPhone && adminPhone !== opts.clientWhatsappPhone) {
    recipients.push(adminPhone);
  }

  if (recipients.length === 0) return;

  await Promise.allSettled(
    recipients.map((to) => sendWhatsAppMessage({ to, message }))
  );
}
