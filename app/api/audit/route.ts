/**
 * GET /api/audit?from=YYYY-MM-DD&to=YYYY-MM-DD&weekly=true&clientIds=a,b
 * Preview of the audit sheet as JSON (what the download / Google Sheet will contain).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAudit, blockTotal } from "@/lib/audit/buildAudit";
import { parseAuditParams } from "@/lib/audit/params";

export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const params = parseAuditParams({
    from: sp.get("from"), to: sp.get("to"), weekly: sp.get("weekly"), clientIds: sp.get("clientIds"),
  });
  if ("error" in params) return NextResponse.json({ error: params.error }, { status: 400 });

  try {
    const audits = await buildAudit(params);
    const data = audits.map((a) => {
      const total = a.blocks.reduce(
        (acc, b) => {
          const t = blockTotal(b, a.hasCrm);
          acc.spend += t.spend;
          acc.leads += t.leads;
          acc.campaigns += b.rows.filter((r) => r.channel !== "CRM").length;
          if (t.crm) {
            acc.crm = (acc.crm ?? 0) + t.crm.total;
            acc.appt = (acc.appt ?? 0) + t.crm.apptBooked + t.crm.visited;
            acc.visited = (acc.visited ?? 0) + t.crm.visited;
          }
          return acc;
        },
        { spend: 0, leads: 0, campaigns: 0, crm: null as number | null, appt: null as number | null, visited: null as number | null }
      );
      return {
        clientId: a.clientId,
        name: a.name,
        platform: a.platform,
        hasCrm: a.hasCrm,
        lastSynced: a.lastSynced,
        weeks: a.blocks.length,
        ...total,
      };
    });
    return NextResponse.json({ params, data });
  } catch (error) {
    console.error("[GET /api/audit]", error);
    return NextResponse.json({ error: "Failed to build audit" }, { status: 500 });
  }
}
