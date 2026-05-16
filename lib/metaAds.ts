/**
 * AdPulse — Meta (Facebook) Marketing API Integration Layer
 *
 * Uses Meta Marketing API v21.0.
 * Docs: https://developers.facebook.com/docs/marketing-api
 *
 * Required env vars:
 *   META_APP_ID
 *   META_APP_SECRET
 *   META_API_VERSION
 */

import type { RawCampaignData, MetaAdsCampaign } from "@/types";

const META_API_VERSION = process.env.META_API_VERSION ?? "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Token management ────────────────────────────────────────

/**
 * Exchange a short-lived token for a long-lived user access token.
 */
export async function extendMetaAccessToken(shortLivedToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortLivedToken,
  });

  const response = await fetch(
    `${META_GRAPH_BASE}/oauth/access_token?${params}`,
    { method: "GET" }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new MetaAdsError(
      `Meta token exchange failed: ${err.error?.message}`,
      response.status,
      err
    );
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 5184000) * 1000);

  return { accessToken: data.access_token, expiresAt };
}

// ── Account balance ─────────────────────────────────────────

/**
 * Fetch the prepaid account balance for a Meta ad account.
 * Returns balance in the account's currency unit.
 */
export async function fetchMetaAccountBalance(
  accountId: string,
  accessToken: string
): Promise<number> {
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const params = new URLSearchParams({
    fields: "balance,currency,amount_spent,spend_cap",
    access_token: accessToken,
  });

  const response = await fetch(
    `${META_GRAPH_BASE}/${normalizedId}?${params}`,
    { headers: { Accept: "application/json" }, cache: "no-store" }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new MetaAdsError(
      `Failed to fetch Meta account balance: ${response.status}`,
      response.status,
      err
    );
  }

  const data = await response.json();

  // Log raw API response so you can verify the exact value Meta returns
  console.log(`[Meta Balance] Account ${normalizedId} raw response:`, JSON.stringify(data));

  if (!data.balance) return 0;

  const rawBalance = Number(data.balance);

  // Meta returns balance as a string integer in the currency's minor unit (paise for INR).
  // e.g. ₹6786.20 → "678620". Divide by 100 to get rupees.
  // The console log above will show the raw value so you can verify this is correct.
  const balance = rawBalance / 100;

  console.log(`[Meta Balance] raw=${rawBalance} → ₹${balance} (currency: ${data.currency ?? "?"}, amount_spent: ${data.amount_spent ?? "?"})`);

  return balance;
}

// ── Daily insights (for chart) ──────────────────────────────

/**
 * Fetch day-by-day insights for all campaigns in an ad account.
 * Returns a map of externalCampaignId → DailyStatEntry[].
 */
export async function fetchMetaDailyInsights(
  accountId: string,
  accessToken: string
): Promise<Map<string, { date: string; spend: number; clicks: number; impressions: number; conversions: number }[]>> {
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  const params = new URLSearchParams({
    date_preset: "last_30d",
    time_increment: "1",
    level: "campaign",
    fields: "campaign_id,date_start,spend,clicks,impressions,actions",
    limit: "500",
    access_token: accessToken,
  });

  const response = await fetch(
    `${META_GRAPH_BASE}/${normalizedId}/insights?${params}`,
    { headers: { Accept: "application/json" }, cache: "no-store" }
  );

  if (!response.ok) {
    // Non-fatal — chart just stays empty
    console.warn(`[Meta Daily Insights] Failed: ${response.status}`);
    return new Map();
  }

  const json = await response.json();
  const rows: { campaign_id: string; date_start: string; spend?: string; clicks?: string; impressions?: string; actions?: { action_type: string; value: string }[] }[] = json.data ?? [];

  const map = new Map<string, { date: string; spend: number; clicks: number; impressions: number; conversions: number }[]>();

  for (const row of rows) {
    const id = row.campaign_id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push({
      date: row.date_start,
      spend: Number(row.spend ?? 0),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      conversions: extractConversions(row.actions),
    });
  }

  // Sort each campaign's stats by date ascending
  for (const stats of map.values()) {
    stats.sort((a, b) => a.date.localeCompare(b.date));
  }

  return map;
}

// ── Campaign fetching ───────────────────────────────────────

/**
 * Fetch all campaigns for a Meta ad account.
 * accountId format: "act_123456789"
 */
export async function fetchMetaCampaigns(
  accountId: string,
  accessToken: string,
  dateRange: { since: string; until: string } = getDefaultDateRange()
): Promise<RawCampaignData[]> {
  const fields = [
    "id",
    "name",
    "status",
    "effective_status",
    "daily_budget",
    "lifetime_budget",
    "start_time",
    "stop_time",
  ].join(",");

  const insightFields = [
    "spend",
    "clicks",
    "impressions",
    "actions",
    "ctr",
    "cpc",
    "cost_per_action_type",
  ].join(",");

  // Normalize account ID
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  const params = new URLSearchParams({
    fields: `${fields},insights.date_preset(last_30d){${insightFields}}`,
    time_range: JSON.stringify({ since: dateRange.since, until: dateRange.until }),
    limit: "200",
    access_token: accessToken,
  });

  const url = `${META_GRAPH_BASE}/${normalizedId}/campaigns?${params}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new MetaAdsError(
      `Meta Ads API error: ${response.status} ${response.statusText}`,
      response.status,
      err
    );
  }

  const json = await response.json();
  const campaigns: MetaAdsCampaign[] = json.data ?? [];

  // Handle pagination (simplified — fetch all pages)
  let nextCursor = json.paging?.cursors?.after;
  let hasMore = !!json.paging?.next;

  while (hasMore && nextCursor) {
    const nextParams = new URLSearchParams({ ...Object.fromEntries(params), after: nextCursor });
    const nextResponse = await fetch(`${META_GRAPH_BASE}/${normalizedId}/campaigns?${nextParams}`);
    if (!nextResponse.ok) break;

    const nextJson = await nextResponse.json();
    campaigns.push(...(nextJson.data ?? []));
    nextCursor = nextJson.paging?.cursors?.after;
    hasMore = !!nextJson.paging?.next;
  }

  return campaigns.map(normalizeMetaCampaign);
}

// ── Normalizer ──────────────────────────────────────────────

function normalizeMetaCampaign(raw: MetaAdsCampaign): RawCampaignData {
  const statusMap: Record<string, RawCampaignData["status"]> = {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    ARCHIVED: "ENDED",
    DELETED: "DELETED",
  };

  const insight = raw.insights?.data?.[0];

  // Extract conversions from actions array
  const conversions = extractConversions(insight?.actions);

  const dailyBudget = raw.daily_budget ? Number(raw.daily_budget) / 100 : 0;
  const lifetimeBudget = raw.lifetime_budget ? Number(raw.lifetime_budget) / 100 : 0;

  return {
    externalId: raw.id,
    name: raw.name,
    status: statusMap[raw.effective_status ?? raw.status] ?? "ACTIVE",
    dailyBudget,
    totalBudget: lifetimeBudget || dailyBudget * 30, // estimate if no lifetime budget
    spend: insight ? Number(insight.spend) : 0,
    clicks: insight ? Number(insight.clicks) : 0,
    impressions: insight ? Number(insight.impressions) : 0,
    conversions,
    startDate: raw.start_time?.split("T")[0],
    endDate: raw.stop_time?.split("T")[0],
  };
}

function extractConversions(
  actions?: { action_type: string; value: string }[]
): number {
  if (!actions) return 0;

  const conversionTypes = [
    "offsite_conversion.fb_pixel_purchase",
    "offsite_conversion.fb_pixel_lead",
    "offsite_conversion",
    "purchase",
    "lead",
  ];

  let total = 0;
  for (const action of actions) {
    if (conversionTypes.includes(action.action_type)) {
      total += Number(action.value);
    }
  }
  return Math.round(total);
}

// ── Helpers ─────────────────────────────────────────────────

function getDefaultDateRange(): { since: string; until: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  return {
    since: start.toISOString().split("T")[0],
    until: end.toISOString().split("T")[0],
  };
}

// ── Custom error class ──────────────────────────────────────

export class MetaAdsError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details: unknown
  ) {
    super(message);
    this.name = "MetaAdsError";
  }
}

// ── Validation helpers ──────────────────────────────────────

export function validateMetaAdsConfig(): void {
  const required = ["META_APP_ID", "META_APP_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Meta Ads environment variables: ${missing.join(", ")}`
    );
  }
}
