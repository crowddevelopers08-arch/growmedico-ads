import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── GET /api/dashboard ──────────────────────────────────────
// Returns all stats needed for the main dashboard in a single request
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [
      campaigns,
      totalClients,
      unreadAlerts,
      recentAlerts,
      topCampaigns,
    ] = await Promise.all([
      // All campaigns for aggregate metrics
      prisma.campaign.findMany({
        select: {
          spend: true,
          clicks: true,
          impressions: true,
          conversions: true,
          status: true,
          dailyBudget: true,
          totalBudget: true,
          platform: true,
        },
      }),
      prisma.client.count({ where: { isActive: true } }),
      prisma.alert.count({ where: { isRead: false } }),
      prisma.alert.findMany({
        where: { isRead: false },
        include: { client: { select: { id: true, name: true, platform: true } } },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 5,
      }),
      prisma.campaign.findMany({
        where: { status: "ACTIVE" },
        include: { client: { select: { id: true, name: true, platform: true } } },
        orderBy: { spend: "desc" },
        take: 10,
      }),
    ]);

    // Aggregate stats
    const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0);
    const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;

    // Low budget campaigns (spend > 80% of budget)
    const lowBudgetCampaigns = campaigns.filter((c) => {
      const budget = c.totalBudget > 0 ? c.totalBudget : c.dailyBudget;
      if (budget <= 0) return false;
      return (c.spend / budget) * 100 >= 80;
    }).length;

    // Spend by platform
    const spendByPlatform = campaigns.reduce<Record<string, number>>((acc, c) => {
      acc[c.platform] = (acc[c.platform] ?? 0) + c.spend;
      return acc;
    }, {});

    return NextResponse.json({
      data: {
        stats: {
          totalSpend,
          totalConversions,
          totalClicks,
          totalImpressions,
          activeCampaigns,
          totalClients,
          unreadAlerts,
          lowBudgetCampaigns,
        },
        spendByPlatform: Object.entries(spendByPlatform).map(([platform, spend]) => ({
          platform,
          spend,
        })),
        recentAlerts,
        topCampaigns,
      },
    });
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
