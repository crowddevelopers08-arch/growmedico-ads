/**
 * AdPulse — Sync API Route
 *
 * POST /api/sync         — Sync all active clients
 * POST /api/sync?id=xxx  — Sync a specific client
 *
 * Protected by either:
 *  - A valid NextAuth session (manual sync from UI)
 *  - CRON_SECRET header (scheduled cron jobs)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGoogleCampaigns, getMccAccessToken } from "@/lib/googleAds";
import { fetchMetaCampaigns, fetchMetaAccountBalance, fetchMetaDailyInsights } from "@/lib/metaAds";
import { runAlertEngine } from "@/lib/alertEngine";
import type { RawCampaignData } from "@/types";

// ── POST /api/sync ──────────────────────────────────────────
export async function POST(request: Request) {
  // Auth check — session OR cron secret
  const session = await auth();
  const cronSecret = request.headers.get("x-cron-secret");
  const isAuthorized =
    !!session || (!!cronSecret && cronSecret === process.env.CRON_SECRET);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("id");

  try {
    // Determine which clients to sync
    const clients = await prisma.client.findMany({
      where: {
        isActive: true,
        ...(clientId && { id: clientId }),
      },
    });

    if (clients.length === 0) {
      return NextResponse.json({ message: "No active clients found", synced: 0 });
    }

    const results = await Promise.allSettled(
      clients.map((client) => syncClient(client))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason?.message ?? String(r.reason));

    return NextResponse.json({
      message: `Sync complete: ${succeeded} succeeded, ${failed} failed`,
      synced: succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[POST /api/sync]", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

// ── Client sync orchestrator ────────────────────────────────

async function syncClient(client: Awaited<ReturnType<typeof prisma.client.findFirst>> & object) {
  if (!client) return;

  // Create sync log
  const log = await prisma.syncLog.create({
    data: { clientId: client.id, status: "RUNNING" },
  });

  try {
    let campaigns: RawCampaignData[] = [];
    // Maps externalCampaignId → daily stats array
    let dailyStatsMap = new Map<string, { date: string; spend: number; clicks: number; impressions: number; conversions: number }[]>();

    // Fetch from the appropriate platform
    if (client.platform === "GOOGLE") {
      const accessToken = await getMccAccessToken();
      campaigns = await fetchGoogleCampaigns(client.accountId, accessToken);
    } else if (client.platform === "META") {
      if (!client.accessToken) throw new Error("No access token for Meta Ads. Edit the client and add the long-lived access token.");
      const [metaCampaigns, balance, dailyInsights] = await Promise.all([
        fetchMetaCampaigns(client.accountId, client.accessToken),
        fetchMetaAccountBalance(client.accountId, client.accessToken),
        fetchMetaDailyInsights(client.accountId, client.accessToken),
      ]);
      campaigns = metaCampaigns;
      dailyStatsMap = dailyInsights;
      await prisma.client.update({
        where: { id: client.id },
        data: { balance },
      });
    }

    // Upsert campaigns into DB
    let recordsUpdated = 0;
    for (const campaign of campaigns) {
      const dailyStats = dailyStatsMap.get(campaign.externalId) ?? [];
      await prisma.campaign.upsert({
        where: { clientId_externalId: { clientId: client.id, externalId: campaign.externalId } },
        create: {
          clientId: client.id,
          externalId: campaign.externalId,
          name: campaign.name,
          status: campaign.status,
          platform: client.platform,
          dailyBudget: campaign.dailyBudget,
          totalBudget: campaign.totalBudget,
          spend: campaign.spend,
          clicks: campaign.clicks,
          impressions: campaign.impressions,
          conversions: campaign.conversions,
          ctr: campaign.clicks > 0 && campaign.impressions > 0
            ? (campaign.clicks / campaign.impressions) * 100
            : 0,
          cpc: campaign.clicks > 0 ? campaign.spend / campaign.clicks : 0,
          cpa: campaign.conversions > 0 ? campaign.spend / campaign.conversions : 0,
          roas: campaign.spend > 0 ? (campaign.conversions * 10) / campaign.spend : 0,
          startDate: campaign.startDate ? new Date(campaign.startDate) : null,
          endDate: campaign.endDate ? new Date(campaign.endDate) : null,
          dailyStats,
          lastSynced: new Date(),
        },
        update: {
          name: campaign.name,
          status: campaign.status,
          dailyBudget: campaign.dailyBudget,
          totalBudget: campaign.totalBudget,
          spend: campaign.spend,
          clicks: campaign.clicks,
          impressions: campaign.impressions,
          conversions: campaign.conversions,
          ctr: campaign.clicks > 0 && campaign.impressions > 0
            ? (campaign.clicks / campaign.impressions) * 100
            : 0,
          cpc: campaign.clicks > 0 ? campaign.spend / campaign.clicks : 0,
          cpa: campaign.conversions > 0 ? campaign.spend / campaign.conversions : 0,
          dailyStats,
          lastSynced: new Date(),
        },
      });
      recordsUpdated++;
    }

    // Run alert engine on updated campaigns
    const dbCampaigns = await prisma.campaign.findMany({
      where: { clientId: client.id },
    });

    await runAlertEngine(client, dbCampaigns);

    // Update sync log to success
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsUpdated,
      },
    });

    console.log(`✅ Synced client ${client.name}: ${recordsUpdated} campaigns`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Update sync log to failed
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: message,
      },
    });

    // Create sync error alert
    await prisma.alert.create({
      data: {
        clientId: client.id,
        type: "SYNC_ERROR",
        severity: "CRITICAL",
        message: `Failed to sync data for ${client.name}: ${message}`,
        metadata: { error: message },
      },
    });

    throw error;
  }
}
