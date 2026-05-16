import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CampaignFilters } from "@/types";

// ── GET /api/campaigns ──────────────────────────────────────
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const filters: CampaignFilters = {
      clientId: searchParams.get("clientId") ?? undefined,
      platform: (searchParams.get("platform") as "GOOGLE" | "META") ?? undefined,
      status: (searchParams.get("status") as never) ?? undefined,
      search: searchParams.get("search") ?? undefined,
    };

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? 20));
    const skip = (page - 1) * pageSize;

    const where = {
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.platform && { platform: filters.platform }),
      ...(filters.status && { status: filters.status }),
      ...(filters.search && {
        name: { contains: filters.search, mode: "insensitive" as const },
      }),
    };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, platform: true } },
        },
        orderBy: { spend: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.campaign.count({ where }),
    ]);

    return NextResponse.json({
      data: campaigns,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("[GET /api/campaigns]", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
