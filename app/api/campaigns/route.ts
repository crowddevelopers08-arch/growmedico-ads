import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { CampaignFilters, CampaignSortField } from "@/types";

const SORT_FIELDS: CampaignSortField[] = [
  "spend", "clicks", "impressions", "conversions", "ctr", "cpc", "name", "lastSynced",
];

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

    const sortParam = searchParams.get("sortBy") as CampaignSortField | null;
    const sortBy: CampaignSortField = sortParam && SORT_FIELDS.includes(sortParam) ? sortParam : "spend";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? 20));
    const skip = (page - 1) * pageSize;

    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
      return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
    }
    if (from || to) {
      const result = await getCampaignsForRange(filters, from, to, sortBy, sortOrder, page, pageSize);
      return NextResponse.json({ ...result, page, pageSize, totalPages: Math.ceil(result.total / pageSize) });
    }

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
        orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
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

// ── Date-range metrics ──────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Computed metric expressions over the aggregated daily stats
const RANGE_SORT_SQL: Record<CampaignSortField, string> = {
  spend: `a.spend`,
  clicks: `a.clicks`,
  impressions: `a.impressions`,
  conversions: `a.conversions`,
  ctr: `CASE WHEN a.impressions > 0 THEN a.clicks / a.impressions ELSE 0 END`,
  cpc: `CASE WHEN a.clicks > 0 THEN a.spend / a.clicks ELSE 0 END`,
  name: `c."name"`,
  lastSynced: `c."lastSynced"`,
};

/**
 * Campaigns with activity between `from` and `to` (inclusive, YYYY-MM-DD in the
 * ad account's timezone), with metrics summed from the daily stats that sync
 * stores (last DAILY_STATS_DAYS days). Sorting and paging happen in SQL.
 */
async function getCampaignsForRange(
  filters: CampaignFilters,
  from: string | null,
  to: string | null,
  sortBy: CampaignSortField,
  sortOrder: "asc" | "desc",
  page: number,
  pageSize: number
) {
  const conditions = [
    Prisma.sql`jsonb_typeof(c."dailyStats") = 'array'`,
    filters.clientId ? Prisma.sql`c."clientId" = ${filters.clientId}` : null,
    filters.platform ? Prisma.sql`c."platform" = ${filters.platform}::"Platform"` : null,
    filters.status ? Prisma.sql`c."status" = ${filters.status}::"CampaignStatus"` : null,
    filters.search ? Prisma.sql`c."name" ILIKE ${`%${filters.search}%`}` : null,
  ].filter((s): s is Prisma.Sql => s !== null);

  const dayConditions = [
    from ? Prisma.sql`d->>'date' >= ${from}` : null,
    to ? Prisma.sql`d->>'date' <= ${to}` : null,
  ].filter((s): s is Prisma.Sql => s !== null);

  const aggregated = Prisma.sql`
    SELECT c.id,
      SUM((d->>'spend')::float8) AS spend,
      SUM((d->>'clicks')::float8) AS clicks,
      SUM((d->>'impressions')::float8) AS impressions,
      SUM((d->>'conversions')::float8) AS conversions
    FROM "campaigns" c
    CROSS JOIN LATERAL jsonb_array_elements(c."dailyStats") d
    WHERE ${Prisma.join(conditions, " AND ")}
      ${dayConditions.length > 0 ? Prisma.sql`AND ${Prisma.join(dayConditions, " AND ")}` : Prisma.empty}
    GROUP BY c.id
    HAVING SUM((d->>'spend')::float8) > 0 OR SUM((d->>'impressions')::float8) > 0
  `;

  const direction = Prisma.raw(sortOrder === "asc" ? "ASC" : "DESC");
  const rows = await prisma.$queryRaw<
    { id: string; spend: number; clicks: number; impressions: number; conversions: number; total: bigint }[]
  >`
    WITH a AS (${aggregated})
    SELECT a.*, COUNT(*) OVER () AS total
    FROM a JOIN "campaigns" c ON c.id = a.id
    ORDER BY ${Prisma.raw(RANGE_SORT_SQL[sortBy])} ${direction}, a.id ASC
    OFFSET ${(page - 1) * pageSize} LIMIT ${pageSize}
  `;

  const total = rows.length > 0 ? Number(rows[0].total) : 0;
  if (rows.length === 0) return { data: [], total };

  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: { client: { select: { id: true, name: true, platform: true } } },
  });
  const byId = new Map(campaigns.map((c) => [c.id, c]));

  const data = rows.flatMap((r) => {
    const c = byId.get(r.id);
    if (!c) return [];
    const clicks = Math.round(r.clicks);
    const conversions = Math.round(r.conversions);
    return [{
      ...c,
      spend: r.spend,
      clicks,
      impressions: Math.round(r.impressions),
      conversions,
      ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
      cpc: clicks > 0 ? r.spend / clicks : 0,
      cpa: conversions > 0 ? r.spend / conversions : 0,
    }];
  });

  return { data, total };
}
