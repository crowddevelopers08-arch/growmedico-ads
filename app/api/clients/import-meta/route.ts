/**
 * AdPulse — Import Meta ad accounts as clients
 *
 * GET  /api/clients/import-meta  — list every ad account the shared
 *      META_ACCESS_TOKEN can reach, flagged with whether it's already a client.
 * POST /api/clients/import-meta  — { accountIds: string[] } create a client for
 *      each selected account. Imported clients use the shared token (no
 *      per-client token is stored), so rotating the token is a one-line change.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchMetaAdAccounts } from "@/lib/metaAds";

export const dynamic = "force-dynamic";

const NO_TOKEN_ERROR = "META_ACCESS_TOKEN is not set in .env. Add the shared Meta access token and restart the server.";

async function listAccounts(token: string) {
  const [accounts, existing] = await Promise.all([
    fetchMetaAdAccounts(token),
    prisma.client.findMany({
      where: { platform: "META" },
      select: { id: true, name: true, accountId: true },
    }),
  ]);
  const byAccountId = new Map(existing.map((c) => [c.accountId, c]));

  return accounts
    .map((a) => {
      const client = byAccountId.get(a.accountId);
      return { ...a, existingClient: client ? { id: client.id, name: client.name } : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: NO_TOKEN_ERROR }, { status: 400 });

  try {
    return NextResponse.json({ data: await listAccounts(token) });
  } catch (error) {
    console.error("[GET /api/clients/import-meta]", error);
    const message = error instanceof Error ? error.message : "Failed to list ad accounts";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

const importSchema = z.object({
  accountIds: z.array(z.string().regex(/^act_\d+$/)).min(1).max(200),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: NO_TOKEN_ERROR }, { status: 400 });

  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Select at least one ad account" }, { status: 400 });
  }

  try {
    // Re-fetch from Meta so we only create clients the token can actually reach
    const accounts = await listAccounts(token);
    const wanted = new Set(parsed.data.accountIds);
    const toCreate = accounts.filter((a) => wanted.has(a.accountId) && !a.existingClient);

    const created = await prisma.$transaction(
      toCreate.map((a) =>
        prisma.client.create({
          data: {
            name: a.name,
            company: a.businessName,
            platform: "META",
            accountId: a.accountId,
            isActive: a.accountStatus === 1,
            notes: "Imported from Meta using the shared access token.",
          },
          select: { id: true, name: true, accountId: true },
        })
      )
    );

    return NextResponse.json({ data: created, skipped: parsed.data.accountIds.length - created.length }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/clients/import-meta]", error);
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
