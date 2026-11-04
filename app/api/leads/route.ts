import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { LeadFilters, LeadSource } from "@/types";

const LEAD_SOURCES: LeadSource[] = ["WHATSAPP", "META_FORM", "WEBSITE"];

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// ── GET /api/leads ──────────────────────────────────────────
// Query: clientId, source, from, to (ISO), search, page, pageSize
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const sourceParam = searchParams.get("source") as LeadSource | null;
    const filters: LeadFilters = {
      clientId: searchParams.get("clientId") ?? undefined,
      source: sourceParam && LEAD_SOURCES.includes(sourceParam) ? sourceParam : undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    };

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? 25));
    const skip = (page - 1) * pageSize;

    const from = parseDate(filters.from ?? null);
    const to = parseDate(filters.to ?? null);

    // Everything except source — reused for the per-source counts
    const baseWhere: Prisma.LeadWhereInput = {
      ...(filters.clientId && { clientId: filters.clientId }),
      ...((from || to) && {
        createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) },
      }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { phone: { contains: filters.search } },
          { email: { contains: filters.search, mode: "insensitive" } },
          { campaign: { contains: filters.search, mode: "insensitive" } },
        ],
      }),
    };

    const where: Prisma.LeadWhereInput = {
      ...baseWhere,
      ...(filters.source && { source: filters.source }),
    };

    const [leads, total, grouped] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.lead.count({ where }),
      prisma.lead.groupBy({
        by: ["source"],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);

    const countsBySource = Object.fromEntries(
      LEAD_SOURCES.map((s) => [s, grouped.find((g) => g.source === s)?._count._all ?? 0])
    ) as Record<LeadSource, number>;

    return NextResponse.json({
      data: leads,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      countsBySource,
    });
  } catch (error) {
    console.error("[GET /api/leads]", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}
