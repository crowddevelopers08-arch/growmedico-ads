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
import { fetchGoogleCampaigns, fetchGoogleDailyStats, getMccAccessToken } from "@/lib/googleAds";
import {
  DAILY_STATS_DAYS,
  fetchMetaCampaigns,
  fetchMetaAccountBalance,
  fetchMetaDailyInsights,
  fetchMetaAccountLeads,
  normalizeMetaLead,
  resolveMetaAccessToken,
} from "@/lib/metaAds";
import { runAlertEngine } from "@/lib/alertEngine";
import { syncTeleCrmLeads } from "@/lib/telecrmSync";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import type { DailyStatEntry, RawCampaignData } from "@/types";

const SYNC_CONCURRENCY = 3;

export const maxDuration = 300;

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

    // A few clients at a time so a full sync can't hog the DB connection pool
    const results = await runWithConcurrency(clients, SYNC_CONCURRENCY, syncClient);

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason?.message ?? String(r.reason));

    // TeleCRM leads — independent of campaign sync, so failures are only reported
    let telecrm: Awaited<ReturnType<typeof syncTeleCrmLeads>> = [];
    try {
      telecrm = await syncTeleCrmLeads(clientId ? { clientIds: [clientId] } : {});
    } catch (error) {
      console.error("[TeleCRM sync]", error);
    }

    return NextResponse.json({
      message: `Sync complete: ${succeeded} succeeded, ${failed} failed`,
      synced: succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      telecrm: telecrm.length > 0 ? telecrm : undefined,
    });
  } catch (error) {
    console.error("[POST /api/sync]", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

/**
 * Turn a raw error into a short, human-readable reason for the alert list.
 * Prisma validation errors dump the whole query and their last line is often
 * misleading (a NaN field surfaces as "Argument `client` is missing"), so
 * those get a plain description instead.
 */
function summarizeSyncError(message: string): string {
  if (message.includes("Invalid `prisma.")) {
    return message.includes("NaN")
      ? "the ad platform returned an invalid number (NaN) for a campaign metric"
      : "the database rejected the campaign data returned by the ad platform";
  }
  const firstLine = message.split("\n").map((l) => l.trim()).find(Boolean) ?? "Unknown error";
  return firstLine.length > 200 ? `${firstLine.slice(0, 197)}…` : firstLine;
}

// ── Bulk campaign upsert ────────────────────────────────────

const UPSERT_CHUNK_SIZE = 200;

/**
 * Insert-or-update all campaigns for a client with INSERT … ON CONFLICT,
 * chunked. Per-row Prisma upserts cost a DB round trip each, which on a slow
 * link held pool connections for minutes and starved page requests.
 * Matches the previous upsert semantics: roas/startDate/endDate are only set
 * when a campaign is first created.
 */
async function upsertCampaigns(
  clientId: string,
  platform: string,
  campaigns: RawCampaignData[],
  dailyStatsMap: Map<string, DailyStatEntry[]>
) {
  const now = new Date();

  for (let i = 0; i < campaigns.length; i += UPSERT_CHUNK_SIZE) {
    const rows = campaigns.slice(i, i + UPSERT_CHUNK_SIZE).map((c) => {
      const ctr = c.clicks > 0 && c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
      const cpc = c.clicks > 0 ? c.spend / c.clicks : 0;
      const cpa = c.conversions > 0 ? c.spend / c.conversions : 0;
      const roas = c.spend > 0 ? (c.conversions * 10) / c.spend : 0;
      const dailyStats = JSON.stringify(dailyStatsMap.get(c.externalId) ?? []);

      return Prisma.sql`(
        ${randomUUID()}, ${clientId}, ${c.externalId}, ${c.name},
        ${c.status}::"CampaignStatus", ${platform}::"Platform",
        ${c.dailyBudget}, ${c.totalBudget}, ${c.spend},
        ${Math.round(c.clicks)}, ${Math.round(c.impressions)}, ${Math.round(c.conversions)},
        ${ctr}, ${cpc}, ${cpa}, ${roas}, ${dailyStats}::jsonb,
        ${c.startDate ? new Date(c.startDate) : null}::timestamp, ${c.endDate ? new Date(c.endDate) : null}::timestamp,
        ${now}, ${now}, ${now}
      )`;
    });

    await prisma.$executeRaw`
      INSERT INTO "campaigns" (
        "id", "clientId", "externalId", "name", "status", "platform",
        "dailyBudget", "totalBudget", "spend", "clicks", "impressions", "conversions",
        "ctr", "cpc", "cpa", "roas", "dailyStats", "startDate", "endDate",
        "lastSynced", "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(rows)}
      ON CONFLICT ("clientId", "externalId") DO UPDATE SET
        "name" = EXCLUDED."name",
        "status" = EXCLUDED."status",
        "dailyBudget" = EXCLUDED."dailyBudget",
        "totalBudget" = EXCLUDED."totalBudget",
        "spend" = EXCLUDED."spend",
        "clicks" = EXCLUDED."clicks",
        "impressions" = EXCLUDED."impressions",
        "conversions" = EXCLUDED."conversions",
        "ctr" = EXCLUDED."ctr",
        "cpc" = EXCLUDED."cpc",
        "cpa" = EXCLUDED."cpa",
        "dailyStats" = EXCLUDED."dailyStats",
        "lastSynced" = EXCLUDED."lastSynced",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
  }
}

/** Run async tasks with at most `limit` in flight; results in input order. */
async function runWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await task(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── Meta lead form sync ─────────────────────────────────────

/** Meta deletes Lead Ads submissions after 90 days, so there's nothing older to fetch. */
const META_LEAD_RETENTION_DAYS = 90;
/** Re-read a little before the newest stored lead to catch late-indexed submissions. */
const META_LEAD_OVERLAP_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Pull new Lead Ads submissions for a Meta account. Non-fatal: a token without
 * leads_retrieval shouldn't fail the campaign sync, so errors are only logged.
 */
async function syncMetaLeads(clientId: string, accountId: string, token: string) {
  try {
    const latest = await prisma.lead.findFirst({
      where: { clientId, source: "META_FORM" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const oldest = Date.now() - META_LEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const since = new Date(Math.max(oldest, (latest?.createdAt.getTime() ?? 0) - META_LEAD_OVERLAP_MS));

    const leads = await fetchMetaAccountLeads(accountId, token, since);
    if (leads.length === 0) return;

    // (source, externalId) is unique, so already-stored leads are skipped
    const { count } = await prisma.lead.createMany({
      data: leads.map((l) => ({ clientId, ...normalizeMetaLead(l) })),
      skipDuplicates: true,
    });
    console.log(`📥 Meta leads for ${accountId}: ${count} new of ${leads.length} fetched`);
  } catch (error) {
    console.warn(`[Meta leads] ${accountId}:`, error instanceof Error ? error.message : error);
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
      [campaigns, dailyStatsMap] = await Promise.all([
        fetchGoogleCampaigns(client.accountId, accessToken),
        fetchGoogleDailyStats(client.accountId, accessToken, DAILY_STATS_DAYS),
      ]);
    } else if (client.platform === "META") {
      const token = resolveMetaAccessToken(client.accessToken);
      if (!token) throw new Error("No access token for Meta Ads. Add one to the client or set META_ACCESS_TOKEN in .env.");
      const [metaCampaigns, funding, dailyInsights] = await Promise.all([
        fetchMetaCampaigns(client.accountId, token),
        fetchMetaAccountBalance(client.accountId, token),
        fetchMetaDailyInsights(client.accountId, token),
      ]);
      campaigns = metaCampaigns;
      dailyStatsMap = dailyInsights;
      await prisma.client.update({
        where: { id: client.id },
        data: { ...funding, balanceUpdatedAt: new Date() },
      });
      await syncMetaLeads(client.id, client.accountId, token);
    }

    // Upsert campaigns into DB in bulk — one statement per chunk instead of one per campaign
    await upsertCampaigns(client.id, client.platform, campaigns, dailyStatsMap);
    const recordsUpdated = campaigns.length;

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

    // One unread sync-error alert per client: refresh it instead of piling up duplicates
    // on every cron run. The full error stays in metadata and the sync log.
    const alertMessage = `Failed to sync data for ${client.name}: ${summarizeSyncError(message)}`;
    const existing = await prisma.alert.findFirst({
      where: { clientId: client.id, type: "SYNC_ERROR", isRead: false },
      select: { id: true },
    });

    if (existing) {
      await prisma.alert.update({
        where: { id: existing.id },
        data: { message: alertMessage, metadata: { error: message }, createdAt: new Date() },
      });
    } else {
      await prisma.alert.create({
        data: {
          clientId: client.id,
          type: "SYNC_ERROR",
          severity: "CRITICAL",
          message: alertMessage,
          metadata: { error: message },
        },
      });
    }

    throw error;
  }
}
