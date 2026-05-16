/**
 * AdPulse — Google Ads API Integration Layer
 *
 * Uses the Google Ads API v18 (REST).
 * Docs: https://developers.google.com/google-ads/api/docs/start
 *
 * Required env vars:
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_CLIENT_ID
 *   GOOGLE_ADS_CLIENT_SECRET
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID  — MCC Manager Account ID (no dashes)
 *   GOOGLE_ADS_REFRESH_TOKEN      — Refresh token for the MCC account owner
 *                                   This single token accesses all managed client accounts.
 */

import type { RawCampaignData, GoogleAdsCampaign } from "@/types";
import { microsToAmount } from "@/lib/utils";

const GOOGLE_ADS_API_VERSION = "v18";
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

// ── Token management ────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Refresh a Google OAuth2 access token using a refresh token.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Google token refresh failed: ${err.error_description ?? err.error}`);
  }

  const data: TokenResponse = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return { accessToken: data.access_token, expiresAt };
}

// ── Campaign fetching ───────────────────────────────────────

/**
 * Fetch all campaigns for a given Google Ads customer account.
 * Returns normalized RawCampaignData ready for database upsert.
 */
export async function fetchGoogleCampaigns(
  customerId: string,
  accessToken: string,
  dateRange: { startDate: string; endDate: string } = getDefaultDateRange()
): Promise<RawCampaignData[]> {
  const query = buildGaqlQuery(dateRange);

  const response = await fetch(
    `${GOOGLE_ADS_BASE_URL}/customers/${customerId.replace(/-/g, "")}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new GoogleAdsError(
      `Google Ads API error: ${response.status} ${response.statusText}`,
      response.status,
      error
    );
  }

  // The searchStream endpoint returns newline-delimited JSON
  const text = await response.text();
  const lines = text.trim().split("\n").filter(Boolean);

  const campaigns: RawCampaignData[] = [];

  for (const line of lines) {
    try {
      const batch = JSON.parse(line) as { results?: GoogleAdsCampaign[] };
      if (!batch.results) continue;

      for (const result of batch.results) {
        campaigns.push(normalizeGoogleCampaign(result));
      }
    } catch {
      // skip malformed line
    }
  }

  return campaigns;
}

// ── Query builder ───────────────────────────────────────────

function buildGaqlQuery({ startDate, endDate }: { startDate: string; endDate: string }): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.start_date,
      campaign.end_date,
      campaign_budget.amount_micros,
      campaign_budget.total_amount_micros,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 200
  `.trim();
}

// ── Normalizer ──────────────────────────────────────────────

function normalizeGoogleCampaign(raw: GoogleAdsCampaign): RawCampaignData {
  const statusMap: Record<string, RawCampaignData["status"]> = {
    ENABLED: "ACTIVE",
    PAUSED: "PAUSED",
    ENDED: "ENDED",
    REMOVED: "DELETED",
  };

  return {
    externalId: raw.campaign.id,
    name: raw.campaign.name,
    status: statusMap[raw.campaign.status] ?? "ACTIVE",
    dailyBudget: microsToAmount(raw.campaignBudget?.amountMicros ?? 0),
    totalBudget: microsToAmount(raw.campaignBudget?.totalAmountMicros ?? 0),
    spend: microsToAmount(raw.metrics?.costMicros ?? 0),
    clicks: Number(raw.metrics?.clicks ?? 0),
    impressions: Number(raw.metrics?.impressions ?? 0),
    conversions: Math.round(Number(raw.metrics?.conversions ?? 0)),
    startDate: raw.campaign.startDate,
    endDate: raw.campaign.endDate,
  };
}

// ── Helpers ─────────────────────────────────────────────────

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  return {
    startDate: start.toISOString().split("T")[0].replace(/-/g, "-"),
    endDate: end.toISOString().split("T")[0].replace(/-/g, "-"),
  };
}

// ── Custom error class ──────────────────────────────────────

export class GoogleAdsError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details: unknown
  ) {
    super(message);
    this.name = "GoogleAdsError";
  }
}

// ── MCC-level token helper ───────────────────────────────────

/**
 * Get a fresh access token using the MCC-level refresh token.
 * This token can access any client account managed under the MCC.
 * Call this before every sync — Google tokens expire in 1 hour.
 */
export async function getMccAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      "GOOGLE_ADS_REFRESH_TOKEN is not set. Add the MCC account owner's refresh token to .env.local"
    );
  }
  const { accessToken } = await refreshGoogleAccessToken(refreshToken);
  return accessToken;
}

// ── Validation helpers ──────────────────────────────────────

/**
 * Validate that all required Google Ads env vars are set.
 */
export function validateGoogleAdsConfig(): void {
  const required = [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    "GOOGLE_ADS_REFRESH_TOKEN",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Google Ads environment variables: ${missing.join(", ")}`
    );
  }
}
