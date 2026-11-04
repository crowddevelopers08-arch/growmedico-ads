/**
 * AdPulse — Lead source health
 *
 * GET /api/leads/status — reports whether Meta Lead Form submissions can be
 * fetched with the shared META_ACCESS_TOKEN, so the Leads page can explain an
 * empty list instead of silently showing zero.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { countMetaAccessiblePages, fetchMetaTokenPermissions, META_LEAD_PERMISSIONS } from "@/lib/metaAds";

export const dynamic = "force-dynamic";

interface MetaLeadStatus {
  ok: boolean;
  reason?: "no_token" | "missing_permission" | "no_pages" | "check_failed";
  granted?: string[];
  message?: string;
}

// Permissions rarely change; avoid a Graph call on every page view
const CACHE_MS = 10 * 60 * 1000;
let cached: { at: number; token: string; status: MetaLeadStatus } | null = null;

async function getMetaLeadStatus(): Promise<MetaLeadStatus> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: "no_token" };
  if (cached && cached.token === token && Date.now() - cached.at < CACHE_MS) return cached.status;

  let status: MetaLeadStatus;
  try {
    const granted = await fetchMetaTokenPermissions(token);
    if (!META_LEAD_PERMISSIONS.some((p) => granted.includes(p))) {
      status = { ok: false, reason: "missing_permission", granted };
    } else {
      // The permission alone isn't enough: lead forms live on Pages the user must have access to
      const pages = await countMetaAccessiblePages(token);
      status = pages > 0 ? { ok: true, granted } : { ok: false, reason: "no_pages", granted };
    }
  } catch (error) {
    // Don't cache transient failures
    return { ok: false, reason: "check_failed", message: error instanceof Error ? error.message : String(error) };
  }

  cached = { at: Date.now(), token, status };
  return status;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ metaLeads: await getMetaLeadStatus() });
}
