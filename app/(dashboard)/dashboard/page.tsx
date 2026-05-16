import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import {
  DollarSign,
  Users,
  TrendingUp,
  Activity,
  AlertTriangle,
  MousePointerClick,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { AvailableFundsCard } from "@/components/dashboard/AvailableFundsCard";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { SpendChart } from "@/components/dashboard/SpendChart";
import { RecentAlerts } from "@/components/dashboard/RecentAlerts";
import { PlatformPieChart } from "@/components/dashboard/PlatformPieChart";
import { StatCardSkeleton } from "@/components/shared/LoadingSpinner";
import { formatCurrency, formatNumber, safeJsonParse } from "@/lib/utils";
import type { CampaignWithClient, AlertWithClient, ChartDataPoint, DailyStatEntry } from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [campaigns, clients, alerts, topCampaigns] = await Promise.all([
    prisma.campaign.findMany({
      select: {
        spend: true, clicks: true, impressions: true,
        conversions: true, status: true, dailyBudget: true,
        totalBudget: true, platform: true, dailyStats: true,
      },
    }),
    prisma.client.findMany({ where: { isActive: true }, select: { balance: true } }),
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

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;
  const totalClients = clients.length;
  const unreadAlerts = alerts.length;
  const lowBudgetCampaigns = campaigns.filter((c) => {
    const budget = c.totalBudget > 0 ? c.totalBudget : c.dailyBudget;
    return budget > 0 && (c.spend / budget) * 100 >= 80;
  }).length;
  // Sum of account prepaid balances fetched from Meta/Google APIs during sync
  const availableFunds = clients.reduce((sum, c) => sum + c.balance, 0);

  const spendByPlatform = campaigns.reduce<Record<string, number>>((acc, c) => {
    acc[c.platform] = (acc[c.platform] ?? 0) + c.spend;
    return acc;
  }, {});

  // Merge daily stats for chart
  const chartDataMap = new Map<string, ChartDataPoint>();
  for (const campaign of campaigns) {
    const stats = safeJsonParse<DailyStatEntry[]>(campaign.dailyStats, []);
    for (const stat of stats) {
      const existing = chartDataMap.get(stat.date) ?? {
        date: stat.date, spend: 0, clicks: 0, impressions: 0, conversions: 0,
      };
      chartDataMap.set(stat.date, {
        date: stat.date,
        spend: existing.spend + stat.spend,
        clicks: existing.clicks + stat.clicks,
        impressions: existing.impressions + stat.impressions,
        conversions: existing.conversions + stat.conversions,
      });
    }
  }

  const chartData = Array.from(chartDataMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  return {
    stats: { totalSpend, totalConversions, totalClicks, activeCampaigns, totalClients, unreadAlerts, lowBudgetCampaigns, availableFunds },
    spendByPlatform: Object.entries(spendByPlatform).map(([platform, spend]) => ({ platform, spend })),
    recentAlerts: alerts as AlertWithClient[],
    topCampaigns: topCampaigns as CampaignWithClient[],
    chartData,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const { stats, spendByPlatform, recentAlerts, topCampaigns, chartData } = data;

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatsCard
            title="Total Spend"
            value={formatCurrency(stats.totalSpend, "INR", true)}
            subtitle="all platforms"
            icon={DollarSign}
            variant="default"
            className="xl:col-span-2"
          />
          <StatsCard
            title="Total Conversions"
            value={formatNumber(stats.totalConversions)}
            subtitle="all campaigns"
            icon={TrendingUp}
            variant="success"
          />
          <StatsCard
            title="Total Clicks"
            value={formatNumber(stats.totalClicks, true)}
            subtitle="all campaigns"
            icon={MousePointerClick}
            variant="info"
          />
          <StatsCard
            title="Active Campaigns"
            value={String(stats.activeCampaigns)}
            subtitle="currently running"
            icon={Activity}
            variant="default"
          />
          <StatsCard
            title="Active Clients"
            value={String(stats.totalClients)}
            subtitle="accounts connected"
            icon={Users}
            variant="info"
          />
          <AvailableFundsCard fallback={stats.availableFunds} />
          {stats.lowBudgetCampaigns > 0 && (
            <StatsCard
              title="Budget Alerts"
              value={String(stats.lowBudgetCampaigns)}
              subtitle="campaigns at >80% budget"
              icon={AlertTriangle}
              variant="warning"
            />
          )}
        </div>

        {/* Charts Row */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SpendChart
              data={chartData}
              title="Spend & Conversions (Last 30 Days)"
              description="Daily aggregate across all clients"
            />
          </div>
          <PlatformPieChart
            data={spendByPlatform}
            title="Spend by Platform"
            description="Breakdown by ad network"
          />
        </div>

        {/* Table + Alerts Row */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Suspense fallback={<StatCardSkeleton />}>
              <CampaignTable
                campaigns={topCampaigns}
                title="Top Active Campaigns"
                description="Ranked by spend"
                compact={false}
              />
            </Suspense>
          </div>
          <RecentAlerts
            alerts={recentAlerts}
            title="Unread Alerts"
            description={`${stats.unreadAlerts} requiring attention`}
          />
        </div>
      </div>
    </div>
  );
}
