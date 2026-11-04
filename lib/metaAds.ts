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
 *
 * Optional:
 *   META_ACCESS_TOKEN — shared token with access to many ad accounts. Used for
 *                       any Meta client that has no token of its own.
 */

import type { RawCampaignData, MetaAdsCampaign } from "@/types";

const META_API_VERSION = process.env.META_API_VERSION ?? "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * fetch() with retries for network-level failures ("fetch failed", resets,
 * timeouts). HTTP error responses are returned as-is for callers to handle.
 */
async function metaFetch(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// ── Token management ────────────────────────────────────────

/** A client's own token wins; otherwise fall back to the shared META_ACCESS_TOKEN. */
export function resolveMetaAccessToken(clientToken?: string | null): string | null {
  return clientToken || process.env.META_ACCESS_TOKEN || null;
}

export interface MetaAdAccount {
  accountId: string; // "act_123…"
  name: string;
  accountStatus: number; // 1 = active, 2 = disabled, 3 = unsettled, …
  currency: string;
  businessName: string | null;
}

/** List every ad account the token can reach (follows pagination). */
export async function fetchMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const params = new URLSearchParams({
    fields: "account_id,name,account_status,currency,business{name}",
    limit: "200",
    access_token: accessToken,
  });

  const accounts: MetaAdAccount[] = [];
  let url: string | null = `${META_GRAPH_BASE}/me/adaccounts?${params}`;

  while (url) {
    const response: Response = await metaFetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new MetaAdsError(
        `Failed to list Meta ad accounts: ${json.error?.message ?? response.status}`,
        response.status,
        json
      );
    }
    for (const a of json.data ?? []) {
      accounts.push({
        accountId: `act_${a.account_id}`,
        name: (a.name ?? a.account_id).trim(),
        accountStatus: a.account_status,
        currency: a.currency,
        businessName: a.business?.name ?? null,
      });
    }
    url = json.paging?.next ?? null;
  }

  return accounts;
}

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

  const response = await metaFetch(
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

export interface MetaAccountFunding {
  /** Available prepaid funds in rupees; 0 for postpaid accounts */
  balance: number;
  isPrepaid: boolean;
  /** Unbilled spend owed (postpaid card / invoice accounts), in rupees */
  amountDue: number;
  /** Funding source as Meta describes it, e.g. "VISA *2991" or "monthly invoicing" */
  fundingLabel: string | null;
}

/** Pull the number out of "Available balance (₹17,659.50 INR)". */
function parseAvailableBalance(displayString?: string): number | null {
  const match = displayString?.match(/Available balance \(([^)]*)\)/i);
  if (!match) return null;
  const n = Number(match[1].replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch what a Meta ad account has to spend.
 *
 * Note: the Graph API `balance` field is the *unbilled amount* (what's owed),
 * not the money left. For prepaid accounts the real available balance — the
 * figure Ads Manager shows — is only exposed in funding_source_details.
 */
export async function fetchMetaAccountBalance(
  accountId: string,
  accessToken: string
): Promise<MetaAccountFunding> {
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const params = new URLSearchParams({
    fields: "balance,is_prepay_account,funding_source_details{display_string,type}",
    access_token: accessToken,
  });

  const response = await metaFetch(
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
  const displayString: string | undefined = data.funding_source_details?.display_string;
  const available = parseAvailableBalance(displayString);
  // Prepaid if Meta says so, or if the funding source reports an available balance
  const isPrepaid = data.is_prepay_account === true || available !== null;

  return {
    balance: isPrepaid ? available ?? 0 : 0,
    isPrepaid,
    // `balance` is in paise (minor units)
    amountDue: isPrepaid ? 0 : toNumber(data.balance) / 100,
    fundingLabel: isPrepaid ? "Prepaid" : displayString ?? null,
  };
}

// ── Daily insights (for chart) ──────────────────────────────

/** How much day-by-day history sync keeps — bounds the campaign date filter. */
export const DAILY_STATS_DAYS = 90;

/**
 * Fetch day-by-day insights for all campaigns in an ad account, covering the
 * last DAILY_STATS_DAYS days up to today.
 * Returns a map of externalCampaignId → DailyStatEntry[].
 */
export async function fetchMetaDailyInsights(
  accountId: string,
  accessToken: string
): Promise<Map<string, { date: string; spend: number; clicks: number; impressions: number; conversions: number }[]>> {
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const since = new Date();
  since.setDate(since.getDate() - (DAILY_STATS_DAYS - 1));

  const params = new URLSearchParams({
    time_range: JSON.stringify({
      since: since.toISOString().split("T")[0],
      until: new Date().toISOString().split("T")[0],
    }),
    time_increment: "1",
    level: "campaign",
    fields: "campaign_id,date_start,spend,clicks,impressions,actions",
    limit: "500",
    access_token: accessToken,
  });

  let rows: { campaign_id: string; date_start: string; spend?: string; clicks?: string; impressions?: string; actions?: { action_type: string; value: string }[] }[];
  try {
    rows = await fetchAllPages(`${META_GRAPH_BASE}/${normalizedId}/insights?${params}`, "Meta daily insights");
  } catch (error) {
    // Non-fatal — chart and date filter just stay empty
    console.warn(`[Meta Daily Insights] ${error instanceof Error ? error.message : error}`);
    return new Map();
  }

  const map = new Map<string, { date: string; spend: number; clicks: number; impressions: number; conversions: number }[]>();

  for (const row of rows) {
    const id = row.campaign_id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push({
      date: row.date_start,
      spend: toNumber(row.spend),
      clicks: toNumber(row.clicks),
      impressions: toNumber(row.impressions),
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

  const response = await metaFetch(url, {
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
    const nextResponse = await metaFetch(`${META_GRAPH_BASE}/${normalizedId}/campaigns?${nextParams}`);
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
    // Meta omits metric fields with no activity, so any of these can be undefined
    spend: toNumber(insight?.spend),
    clicks: toNumber(insight?.clicks),
    impressions: toNumber(insight?.impressions),
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
      total += toNumber(action.value);
    }
  }
  return Math.round(total);
}

// ── Helpers ─────────────────────────────────────────────────

/** Parse a Graph API numeric string; missing or malformed values become 0 instead of NaN. */
function toNumber(value: string | number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

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

// ── Lead Ads ────────────────────────────────────────────────

export interface MetaLead {
  id: string;
  created_time: string;
  form_id?: string;
  ad_name?: string;
  campaign_name?: string;
  field_data: { name: string; values: string[] }[];
}

/**
 * Fetch a single Lead Ads submission by its leadgen ID.
 * The token needs the `leads_retrieval` permission on the page.
 */
export async function fetchMetaLead(leadgenId: string, accessToken: string): Promise<MetaLead> {
  const params = new URLSearchParams({
    fields: "id,created_time,form_id,ad_name,campaign_name,field_data",
    access_token: accessToken,
  });

  const response = await metaFetch(`${META_GRAPH_BASE}/${leadgenId}?${params}`);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new MetaAdsError(
      `Meta lead fetch failed: ${err.error?.message ?? response.statusText}`,
      response.status,
      err
    );
  }

  return response.json();
}

/** Permissions that let a token read Lead Ads submissions (either one is enough). */
export const META_LEAD_PERMISSIONS = ["leads_retrieval", "pages_manage_ads"] as const;

/** Permissions the token has been granted, e.g. ["ads_read", "leads_retrieval"]. */
export async function fetchMetaTokenPermissions(accessToken: string): Promise<string[]> {
  const params = new URLSearchParams({ access_token: accessToken });
  const response = await metaFetch(`${META_GRAPH_BASE}/me/permissions?${params}`, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MetaAdsError(`Failed to read token permissions: ${json.error?.message ?? response.status}`, response.status, json);
  }
  return (json.data ?? [])
    .filter((p: { status: string }) => p.status === "granted")
    .map((p: { permission: string }) => p.permission);
}

/**
 * Number of Facebook Pages the token's user can act on. Lead forms belong to
 * Pages, so with zero Pages Meta returns empty lead lists even when the token
 * has leads_retrieval.
 */
export async function countMetaAccessiblePages(accessToken: string): Promise<number> {
  const pages = await fetchAllPages<{ id: string }>(
    `${META_GRAPH_BASE}/me/accounts?${new URLSearchParams({ fields: "id", limit: "200", access_token: accessToken })}`,
    "Failed to list Facebook Pages"
  );
  return pages.length;
}

// Insight action types that mean an instant-form (Lead Ads) submission
const LEAD_FORM_ACTION_TYPES = new Set(["lead", "onsite_conversion.lead_grouped", "leadgen_grouped"]);

/** Follow Graph API `paging.next` links and collect every row. */
async function fetchAllPages<T>(url: string, label: string): Promise<T[]> {
  const rows: T[] = [];
  let next: string | null = url;

  while (next) {
    const response: Response = await metaFetch(next, { headers: { Accept: "application/json" }, cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new MetaAdsError(`${label}: ${json.error?.message ?? response.status}`, response.status, json);
    }
    rows.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }

  return rows;
}

/**
 * Fetch every Lead Ads submission for an ad account created on or after `since`.
 *
 * Ad-level insights tell us which ads produced leads in the window, then each
 * of those ads' /leads edge is read. Meta only keeps leads for 90 days.
 * The token needs `leads_retrieval` and access to the Pages running the forms.
 */
export async function fetchMetaAccountLeads(
  accountId: string,
  accessToken: string,
  since: Date
): Promise<MetaLead[]> {
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  const insightParams = new URLSearchParams({
    level: "ad",
    fields: "ad_id,actions",
    time_range: JSON.stringify({
      since: since.toISOString().split("T")[0],
      until: new Date().toISOString().split("T")[0],
    }),
    limit: "500",
    access_token: accessToken,
  });

  const adRows = await fetchAllPages<{ ad_id?: string; actions?: { action_type: string; value: string }[] }>(
    `${META_GRAPH_BASE}/${normalizedId}/insights?${insightParams}`,
    "Failed to list Meta ads with leads"
  );

  const adIds = [
    ...new Set(
      adRows
        .filter((r) => r.ad_id && r.actions?.some((a) => LEAD_FORM_ACTION_TYPES.has(a.action_type)))
        .map((r) => r.ad_id!)
    ),
  ];

  const leadParams = new URLSearchParams({
    fields: "id,created_time,form_id,ad_name,campaign_name,field_data",
    filtering: JSON.stringify([
      { field: "time_created", operator: "GREATER_THAN", value: Math.floor(since.getTime() / 1000) },
    ]),
    limit: "500",
    access_token: accessToken,
  });

  const leads: MetaLead[] = [];
  for (const adId of adIds) {
    leads.push(
      ...(await fetchAllPages<MetaLead>(
        `${META_GRAPH_BASE}/${adId}/leads?${leadParams}`,
        `Failed to fetch leads for Meta ad ${adId}`
      ))
    );
  }

  return leads;
}

/** Turn a Lead Ads submission into the fields stored on a Lead row. */
export function normalizeMetaLead(lead: MetaLead, fallbackFormId?: string) {
  const fields = Object.fromEntries(lead.field_data.map((f) => [f.name, f.values.join(", ")]));

  return {
    source: "META_FORM" as const,
    externalId: lead.id,
    name: fields.full_name ?? ([fields.first_name, fields.last_name].filter(Boolean).join(" ") || null),
    phone: fields.phone_number ?? fields.phone ?? null,
    email: fields.email ?? null,
    campaign: lead.campaign_name ?? lead.ad_name ?? null,
    metadata: { formId: lead.form_id ?? fallbackFormId, adName: lead.ad_name, fields },
    createdAt: new Date(lead.created_time),
  };
}

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
