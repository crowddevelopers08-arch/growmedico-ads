/**
 * AdPulse — Alert Engine
 *
 * Evaluates campaign data and creates alerts when thresholds are breached.
 * Runs during sync or on-demand.
 */

import { prisma } from "@/lib/prisma";
import { calcBudgetUsage, getBudgetAlertThreshold } from "@/lib/utils";
import { sendAlertNotification } from "@/lib/whatsapp";
import type { Campaign, Client } from "@prisma/client";
import type { AlertEngineResult } from "@/types";

// ── Main entry point ────────────────────────────────────────

/**
 * Evaluate all active campaigns for a client and fire alerts where needed.
 */
export async function runAlertEngine(
  client: Client,
  campaigns: Campaign[]
): Promise<AlertEngineResult> {
  const threshold = getBudgetAlertThreshold();
  const results: AlertEngineResult = { alertsCreated: 0, alerts: [] };

  for (const campaign of campaigns) {
    const budget = campaign.totalBudget > 0 ? campaign.totalBudget : campaign.dailyBudget;
    const usagePct = calcBudgetUsage(campaign.spend, budget);

    // ── Budget alerts ───────────────────────────────────────
    if (usagePct >= 100) {
      const alert = await createAlertIfNew({
        clientId: client.id,
        campaignId: campaign.id,
        type: "BUDGET_EXCEEDED",
        severity: "CRITICAL",
        message: `Campaign "${campaign.name}" has exceeded its budget (${usagePct.toFixed(1)}% used).`,
        metadata: { budgetUsage: usagePct, spend: campaign.spend, budget },
      }, client);
      if (alert) {
        results.alertsCreated++;
        results.alerts.push({ type: "BUDGET_EXCEEDED", severity: "CRITICAL", message: alert.message });
      }
    } else if (usagePct >= threshold) {
      const alert = await createAlertIfNew({
        clientId: client.id,
        campaignId: campaign.id,
        type: "BUDGET_LOW",
        severity: usagePct >= 90 ? "CRITICAL" : "WARNING",
        message: `Campaign "${campaign.name}" has used ${usagePct.toFixed(1)}% of its budget.`,
        metadata: { budgetUsage: usagePct, spend: campaign.spend, budget },
      }, client);
      if (alert) {
        results.alertsCreated++;
        results.alerts.push({ type: "BUDGET_LOW", severity: usagePct >= 90 ? "CRITICAL" : "WARNING", message: alert.message });
      }
    }

    // ── Campaign unexpectedly paused ────────────────────────
    if (campaign.status === "PAUSED" && campaign.spend > 0) {
      const alert = await createAlertIfNew({
        clientId: client.id,
        campaignId: campaign.id,
        type: "CAMPAIGN_PAUSED",
        severity: "WARNING",
        message: `Campaign "${campaign.name}" is paused but has active spend.`,
        metadata: { campaignName: campaign.name, spend: campaign.spend },
      }, client);
      if (alert) {
        results.alertsCreated++;
        results.alerts.push({ type: "CAMPAIGN_PAUSED", severity: "WARNING", message: alert.message });
      }
    }

    // ── Performance drop (CTR < 0.5% with significant impressions) ─
    if (campaign.impressions > 10000 && campaign.ctr < 0.5 && campaign.ctr > 0) {
      const alert = await createAlertIfNew({
        clientId: client.id,
        campaignId: campaign.id,
        type: "PERFORMANCE_DROP",
        severity: "WARNING",
        message: `Campaign "${campaign.name}" has a low CTR of ${campaign.ctr.toFixed(2)}%.`,
        metadata: { ctr: campaign.ctr, impressions: campaign.impressions },
      }, client);
      if (alert) {
        results.alertsCreated++;
        results.alerts.push({ type: "PERFORMANCE_DROP", severity: "WARNING", message: alert.message });
      }
    }
  }

  return results;
}

// ── Deduplication logic ─────────────────────────────────────

interface AlertInput {
  clientId: string;
  campaignId?: string;
  type: string;
  severity: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an alert only if no unread alert of the same type
 * exists for the same campaign in the last 24 hours.
 * When a new alert is created, sends a WhatsApp notification.
 */
async function createAlertIfNew(input: AlertInput, client: Client) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existing = await prisma.alert.findFirst({
    where: {
      clientId: input.clientId,
      campaignId: input.campaignId ?? null,
      type: input.type as never,
      isRead: false,
      createdAt: { gte: twentyFourHoursAgo },
    },
  });

  if (existing) return null;

  const alert = await prisma.alert.create({
    data: {
      clientId: input.clientId,
      campaignId: input.campaignId,
      type: input.type as never,
      severity: input.severity as never,
      message: input.message,
      metadata: input.metadata as never,
    },
  });

  // Fire WhatsApp notification — failure is swallowed inside sendAlertNotification
  await sendAlertNotification({
    clientName: client.name,
    clientId: client.id,
    alertMessage: input.message,
    severity: input.severity as "INFO" | "WARNING" | "CRITICAL",
    clientWhatsappPhone: (client as Client & { whatsappPhone?: string | null }).whatsappPhone,
  });

  return alert;
}

// ── Mark alerts as read ─────────────────────────────────────

export async function markAlertsAsRead(alertIds: string[]): Promise<void> {
  await prisma.alert.updateMany({
    where: { id: { in: alertIds } },
    data: { isRead: true },
  });
}

export async function markAllAlertsAsRead(clientId?: string): Promise<void> {
  await prisma.alert.updateMany({
    where: {
      isRead: false,
      ...(clientId && { clientId }),
    },
    data: { isRead: true },
  });
}

// ── Alert counts ────────────────────────────────────────────

export async function getUnreadAlertCount(clientId?: string): Promise<number> {
  return prisma.alert.count({
    where: {
      isRead: false,
      ...(clientId && { clientId }),
    },
  });
}
