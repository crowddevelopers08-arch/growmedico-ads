/**
 * AdPulse — TeleCRM lead sync
 *
 * POST /api/leads/telecrm            — sync every TeleCRM account (last TELECRM_REFRESH_DAYS days)
 * POST /api/leads/telecrm?id=xxx     — only the account linked to this client
 *
 * Auth: a NextAuth session, or the CRON_SECRET in `x-cron-secret` (schedule every ~15 min).
 * The first full import of an account's history is done with `npm run telecrm:backfill`.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncTeleCrmLeads } from "@/lib/telecrmSync";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  const cronSecret = request.headers.get("x-cron-secret");
  const isAuthorized = !!session || (!!cronSecret && cronSecret === process.env.CRON_SECRET);
  if (!isAuthorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = new URL(request.url).searchParams.get("id");

  try {
    const results = await syncTeleCrmLeads(clientId ? { clientIds: [clientId] } : {});
    const failed = results.filter((r) => r.error);
    return NextResponse.json({
      message: `TeleCRM sync: ${results.length - failed.length} account(s) synced, ${failed.length} failed`,
      results,
    });
  } catch (error) {
    console.error("[POST /api/leads/telecrm]", error);
    return NextResponse.json({ error: "TeleCRM sync failed" }, { status: 500 });
  }
}
