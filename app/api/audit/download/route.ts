/**
 * GET /api/audit/download?from&to&weekly&clientIds — the audit as an .xlsx workbook
 * (MENU tab + one identically laid-out tab per client).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAudit } from "@/lib/audit/buildAudit";
import { parseAuditParams } from "@/lib/audit/params";
import { auditToXlsx } from "@/lib/audit/xlsx";

export const maxDuration = 120;

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
    const buffer = await auditToXlsx(audits);
    const filename = `PM Audit ${params.from} to ${params.to}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/audit/download]", error);
    return NextResponse.json({ error: "Failed to build the workbook" }, { status: 500 });
  }
}
