/**
 * POST /api/clients/validate
 *
 * Verifies that an ad account ID exists and is accessible before saving.
 * - Google Ads: fetches the customer resource using the MCC token
 * - Meta Ads:   fetches the ad account using the provided access token
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMccAccessToken } from "@/lib/googleAds";

const GOOGLE_ADS_API_VERSION = "v18";
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const META_GRAPH_BASE = `https://graph.facebook.com/${process.env.META_API_VERSION ?? "v21.0"}`;

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.platform || !body?.accountId) {
    return NextResponse.json({ error: "platform and accountId are required" }, { status: 400 });
  }

  const { platform, accountId, accessToken } = body as {
    platform: "GOOGLE" | "META";
    accountId: string;
    accessToken?: string;
  };

  try {
    if (platform === "GOOGLE") {
      return await validateGoogleAccount(accountId);
    } else {
      return await validateMetaAccount(accountId, accessToken);
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Validation failed";
    // Surface credential config errors more clearly
    const message = raw.toLowerCase().includes("refresh token") || raw.toLowerCase().includes("unauthorized")
      ? "Google Ads credentials error: the GOOGLE_ADS_REFRESH_TOKEN in .env.local is invalid or expired. Generate a new one via Google OAuth."
      : raw;
    return NextResponse.json({ valid: false, error: message }, { status: 200 });
  }
}

// ── Google ───────────────────────────────────────────────────

async function validateGoogleAccount(accountId: string) {
  if (!process.env.GOOGLE_ADS_REFRESH_TOKEN) {
    return NextResponse.json(
      { valid: false, error: "GOOGLE_ADS_REFRESH_TOKEN is not configured in .env.local" },
      { status: 200 }
    );
  }

  const customerId = accountId.replace(/-/g, "");
  const accessToken = await getMccAccessToken();

  const response = await fetch(
    `${GOOGLE_ADS_BASE_URL}/customers/${customerId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, ""),
      },
    }
  );

  if (response.status === 404) {
    return NextResponse.json(
      { valid: false, error: `Google Ads account "${accountId}" not found` },
      { status: 200 }
    );
  }

  if (response.status === 403) {
    return NextResponse.json(
      { valid: false, error: `Access denied to Google Ads account "${accountId}". Ensure it is managed under your MCC.` },
      { status: 200 }
    );
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message = err?.error?.message ?? `Google Ads API error (${response.status})`;
    return NextResponse.json({ valid: false, error: message }, { status: 200 });
  }

  const data = await response.json();
  return NextResponse.json({
    valid: true,
    name: data.descriptiveName ?? data.id,
  });
}

// ── Meta ─────────────────────────────────────────────────────

async function validateMetaAccount(accountId: string, accessToken?: string) {
  if (!accessToken) {
    return NextResponse.json(
      { valid: false, error: "Access token is required to validate a Meta Ads account" },
      { status: 200 }
    );
  }

  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const params = new URLSearchParams({
    fields: "id,name,account_status",
    access_token: accessToken,
  });

  const response = await fetch(`${META_GRAPH_BASE}/${normalizedId}?${params}`);
  const data = await response.json();

  if (!response.ok || data.error) {
    const message = data.error?.message ?? `Meta account "${accountId}" not found or inaccessible`;
    return NextResponse.json({ valid: false, error: message }, { status: 200 });
  }

  // account_status: 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED, 7 = PENDING_RISK_REVIEW, etc.
  if (data.account_status === 2) {
    return NextResponse.json(
      { valid: false, error: `Meta Ads account "${accountId}" is disabled` },
      { status: 200 }
    );
  }

  return NextResponse.json({
    valid: true,
    name: data.name ?? normalizedId,
  });
}
