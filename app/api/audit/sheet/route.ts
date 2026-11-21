/**
 * GET  /api/audit/sheet — is Google Sheets set up? (service account email, default sheet)
 * POST /api/audit/sheet — write the audit into a Google Sheet.
 *   body: { spreadsheet?: url-or-id, from?, to?, weekly?, clientIds? }
 *   Defaults: AUDIT_SPREADSHEET_ID and the last complete Mon–Sun week.
 *
 * Auth: a signed-in session, or the x-cron-secret header (weekly scheduled run).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildAudit } from "@/lib/audit/buildAudit";
import { parseAuditParams } from "@/lib/audit/params";
import { pushAuditToSheet } from "@/lib/audit/sheetsSync";
import { parseSpreadsheetId, sheetsConfig } from "@/lib/googleSheets";

export const maxDuration = 300;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { email, configured } = sheetsConfig();
  const id = process.env.AUDIT_SPREADSHEET_ID?.trim() || null;
  return NextResponse.json({
    configured,
    serviceAccountEmail: email ?? null,
    defaultSpreadsheetUrl: id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const cronSecret = request.headers.get("x-cron-secret");
  if (!session && !(cronSecret && cronSecret === process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const spreadsheetId = parseSpreadsheetId(String(body.spreadsheet ?? "")) ?? process.env.AUDIT_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) {
    return NextResponse.json({ error: "Paste the Google Sheet link (or set AUDIT_SPREADSHEET_ID)" }, { status: 400 });
  }
  if (!sheetsConfig().configured) {
    return NextResponse.json({ error: "Google Sheets isn't set up on the server yet — see SETUP.md (Audit sheets)" }, { status: 400 });
  }

  const params = parseAuditParams(body);
  if ("error" in params) return NextResponse.json({ error: params.error }, { status: 400 });

  try {
    const audits = await buildAudit(params);
    const result = await pushAuditToSheet(spreadsheetId, audits);
    return NextResponse.json({
      ...result,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      from: params.from,
      to: params.to,
    });
  } catch (error) {
    console.error("[POST /api/audit/sheet]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update the sheet" }, { status: 500 });
  }
}
