import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  IndianRupee,
  Users,
  Target,
  Activity,
  AlertTriangle,
  MousePointerClick,
  Bell,
  ArrowRight,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PageHeader } from "@/components/shared/PageHeader";
import { ClientDateFilter } from "@/components/clients/ClientDateFilter";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { AvailableFundsCard } from "@/components/dashboard/AvailableFundsCard";
import { AccountBalances } from "@/components/dashboard/AccountBalances";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { SpendChart } from "@/components/dashboard/SpendChart";
import { RecentAlerts } from "@/components/dashboard/RecentAlerts";
import { PlatformPieChart } from "@/components/dashboard/PlatformPieChart";
import { Card } from "@/components/ui/card";
import { cn, formatCurrency, formatNumber, formatPercent, safeJsonParse } from "@/lib/utils";
import type { CampaignWithClient, AlertWithClient, ChartDataPoint, DailyStatEntry } from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

function dashboardRange(range: string, from?: string, to?: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const shift = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  switch (range) {
    case "TODAY": return { from: today, to: today };
    case "YESTERDAY": { const day = shift(today, -1); return { from: day, to: day }; }
    case "LAST_7": return { from: shift(today, -6), to: today };
    case "THIS_WEEK": return { from: shift(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)), to: today };
    case "THIS_MONTH": return { from: `${today.slice(0, 7)}-01`, to: today };
    case "LAST_MONTH": {
      const end = shift(`${today.slice(0, 7)}-01`, -1);
      return { from: `${end.slice(0, 7)}-01`, to: end };
    }
    case "CUSTOM": return { from: from || undefined, to: to || undefined };
    case "ALL": return {};
    default: return { from: shift(today, -29), to: today };
  }
}

async function getDashboardData(range: { from?: string; to?: string }) {
  const [campaigns, clients, alerts, unreadAlerts] = await Promise.all([
    prisma.campaign.findMany({
      include: { client: { select: { id: true, name: true, platform: true } } },
    }),
    prisma.client.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, platform: true, balance: true, isPrepaid: true,
        amountDue: true, fundingLabel: true, balanceUpdatedAt: true,
      },
    }),
    prisma.alert.findMany({
      where: { isRead: false },
      include: { client: { select: { id: true, name: true, platform: true } } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 5,
    }),
    prisma.alert.count({ where: { isRead: false } }),
  ]);

  const hasRange = Boolean(range.from || range.to);
  const visibleCampaigns = campaigns.map((campaign) => {
    if (!hasRange) return campaign;
    const stats = safeJsonParse<DailyStatEntry[]>(campaign.dailyStats, []).filter((stat) =>
      (!range.from || stat.date >= range.from) && (!range.to || stat.date <= range.to)
    );
    const spend = stats.reduce((sum, stat) => sum + stat.spend, 0);
    const clicks = stats.reduce((sum, stat) => sum + stat.clicks, 0);
    const impressions = stats.reduce((sum, stat) => sum + stat.impressions, 0);
    const conversions = stats.reduce((sum, stat) => sum + stat.conversions, 0);
    return { ...campaign, spend, clicks, impressions, conversions,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0, cpa: conversions > 0 ? spend / conversions : 0 };
  });
  const totalSpend = visibleCampaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = visibleCampaigns.reduce((s, c) => s + c.conversions, 0);
  const totalClicks = visibleCampaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = visibleCampaigns.reduce((s, c) => s + c.impressions, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;
  const totalClients = clients.length;
  const lowBudgetCampaigns = campaigns.filter((c) => {
    const budget = c.totalBudget > 0 ? c.totalBudget : c.dailyBudget;
    return c.status === "ACTIVE" && budget > 0 && (c.spend / budget) * 100 >= 80;
  }).length;
  // Sum of account prepaid balances fetched from Meta/Google APIs during sync
  const availableFunds = clients.reduce((sum, c) => sum + c.balance, 0);

  const spendByPlatform = visibleCampaigns.reduce<Record<string, number>>((acc, c) => {
    acc[c.platform] = (acc[c.platform] ?? 0) + c.spend;
    return acc;
  }, {});

  // Merge daily stats for chart
  const chartDataMap = new Map<string, ChartDataPoint>();
  for (const campaign of campaigns) {
    const stats = safeJsonParse<DailyStatEntry[]>(campaign.dailyStats, []).filter((stat) =>
      (!range.from || stat.date >= range.from) && (!range.to || stat.date <= range.to)
    );
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
    .sort((a, b) => a.date.localeCompare(b.date));
  const topCampaigns = visibleCampaigns
    .filter((campaign) => campaign.status === "ACTIVE")
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  return {
    stats: {
      totalSpend, totalConversions, totalClicks, totalImpressions, activeCampaigns,
      totalCampaigns: campaigns.length, totalClients, unreadAlerts, lowBudgetCampaigns, availableFunds,
      costPerConversion: totalConversions > 0 ? totalSpend / totalConversions : 0,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    },
    spendByPlatform: Object.entries(spendByPlatform).map(([platform, spend]) => ({ platform, spend })),
    clientBalances: clients,
    recentAlerts: alerts as AlertWithClient[],
    topCampaigns: topCampaigns as CampaignWithClient[],
    chartData,
  };
}

/** Compact row of secondary numbers that link to their sections. */
function QuickStat({
  href, icon: Icon, label, value, hint, tone = "default",
}: {
  href: string;
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "alert";
}) {
  return (
    <Link href={href} className="group flex items-center gap-3 p-4 transition-colors hover:bg-muted/40 sm:p-5">
      <Icon className={cn("h-5 w-5 shrink-0", tone === "alert" ? "text-red-500" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums">{value}</span>
          <span className="truncate text-xs text-muted-foreground">{hint}</span>
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const query = await searchParams;
  const range = dashboardRange(query.range ?? "LAST_30", query.from, query.to);
  const rangeLabel = query.range === "ALL" ? "All time" : query.range === "CUSTOM"
    ? `${range.from ?? "Any date"} – ${range.to ?? "Today"}`
    : query.range === "TODAY" ? "Today" : query.range === "YESTERDAY" ? "Yesterday"
    : query.range === "LAST_7" ? "Last 7 days" : query.range === "THIS_WEEK" ? "This week"
    : query.range === "THIS_MONTH" ? "This month" : query.range === "LAST_MONTH" ? "Last month"
    : "Last 30 days";
  const { stats, spendByPlatform, clientBalances, recentAlerts, topCampaigns, chartData } = await getDashboardData(range);

  return (
    <div className="flex flex-col">
      <Header title="Overview" />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 animate-fade-in md:p-8">
        <PageHeader
          title="Overview"
          description="Performance across all clients and ad platforms"
        />

        <ClientDateFilter />

        {/* Budget warning banner — only when something needs action */}
        {stats.lowBudgetCampaigns > 0 && (
          <Link
            href="/campaigns"
            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              <strong className="font-semibold">{stats.lowBudgetCampaigns} active campaign{stats.lowBudgetCampaigns !== 1 ? "s" : ""}</strong>{" "}
              {stats.lowBudgetCampaigns !== 1 ? "have" : "has"} used over 80% of budget.
            </span>
            <span className="hidden items-center gap-1 font-medium sm:inline-flex">
              Review <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        )}

        {/* Primary KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            title="Total Spend"
            value={formatCurrency(stats.totalSpend, "INR", true)}
            subtitle={`${rangeLabel}, all platforms`}
            icon={IndianRupee}
          />
          <AvailableFundsCard fallback={stats.availableFunds} />
          <StatsCard
            title="Conversions"
            value={formatNumber(stats.totalConversions)}
            subtitle={
              stats.costPerConversion > 0
                ? <>{formatCurrency(stats.costPerConversion)} <span className="opacity-70">per conversion</span></>
                : "No conversions yet"
            }
            icon={Target}
            variant="success"
          />
          <StatsCard
            title="Clicks"
            value={formatNumber(stats.totalClicks, true)}
            subtitle={<>{formatPercent(stats.ctr)} <span className="opacity-70">CTR · {formatNumber(stats.totalImpressions, true)} impressions</span></>}
            icon={MousePointerClick}
            variant="info"
          />
        </div>

        {/* Secondary counts */}
        <Card className="grid divide-y overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <QuickStat
            href="/campaigns"
            icon={Activity}
            label="Active campaigns"
            value={String(stats.activeCampaigns)}
            hint={`of ${stats.totalCampaigns} total`}
          />
          <QuickStat
            href="/clients"
            icon={Users}
            label="Active clients"
            value={String(stats.totalClients)}
            hint="accounts connected"
          />
          <QuickStat
            href="/alerts"
            icon={Bell}
            label="Unread alerts"
            value={String(stats.unreadAlerts)}
            hint={stats.unreadAlerts > 0 ? "need attention" : "all caught up"}
            tone={stats.unreadAlerts > 0 ? "alert" : "default"}
          />
        </Card>

        <AccountBalances clients={clientBalances} />

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SpendChart
              data={chartData}
              title="Spend & Conversions"
              description={`Daily totals · ${rangeLabel}`}
            />
          </div>
          <PlatformPieChart
            data={spendByPlatform}
            title="Spend by Platform"
            description={`Share of spend · ${rangeLabel}`}
          />
        </div>

        {/* Campaigns + alerts */}
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <CampaignTable
              campaigns={topCampaigns}
              title="Top Active Campaigns"
              description={`Highest spend · ${rangeLabel}`}
              compact
              viewAllHref="/campaigns"
            />
          </div>
          <RecentAlerts
            alerts={recentAlerts}
            title="Unread Alerts"
            description={
              stats.unreadAlerts > 0
                ? `${stats.unreadAlerts} need${stats.unreadAlerts === 1 ? "s" : ""} attention`
                : "Nothing needs attention"
            }
          />
        </div>
      </div>
    </div>
  );
}
