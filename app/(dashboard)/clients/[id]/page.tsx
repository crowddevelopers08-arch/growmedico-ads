import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { SpendChart } from "@/components/dashboard/SpendChart";
import { BudgetProgress } from "@/components/dashboard/BudgetProgress";
import { RecentAlerts } from "@/components/dashboard/RecentAlerts";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Edit, RefreshCw, DollarSign, MousePointerClick,
  TrendingUp, Activity, Mail, Phone, Building2,
} from "lucide-react";
import {
  formatCurrency, formatNumber, getPlatformLabel,
  getPlatformColor, safeJsonParse, formatDate,
} from "@/lib/utils";
import type { CampaignWithClient, AlertWithClient, ChartDataPoint, DailyStatEntry } from "@/types";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  return { title: client?.name ?? "Client" };
}

async function getClientData(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      campaigns: { orderBy: { spend: "desc" } },
      alerts: {
        where: { isRead: false },
        include: { client: { select: { id: true, name: true, platform: true } } },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 10,
      },
    },
  });

  if (!client) return null;

  const totalSpend = client.campaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = client.campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalClicks = client.campaigns.reduce((s, c) => s + c.clicks, 0);
  const activeCampaigns = client.campaigns.filter((c) => c.status === "ACTIVE").length;

  // Merge daily stats for chart
  const chartDataMap = new Map<string, ChartDataPoint>();
  for (const campaign of client.campaigns) {
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
    client,
    stats: { totalSpend, totalConversions, totalClicks, activeCampaigns },
    chartData,
  };
}

export default async function ClientDetailPage({ params }: Params) {
  const { id } = await params;
  const data = await getClientData(id);

  if (!data) notFound();

  const { client, stats, chartData } = data;
  const platformColor = getPlatformColor(client.platform);

  return (
    <div className="flex flex-col h-full">
      <Header title={client.name} />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
        {/* Client header card */}
        <Card className="overflow-hidden">
          <div className="h-1.5" style={{ backgroundColor: platformColor }} />
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold">{client.name}</h2>
                  <Badge
                    className="text-white font-medium"
                    style={{ backgroundColor: platformColor }}
                  >
                    {getPlatformLabel(client.platform)}
                  </Badge>
                  {!client.isActive && (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {client.company && (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      {client.company}
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {client.email}
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {client.phone}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                      {client.accountId}
                    </code>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Added {formatDate(client.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <form action={`/api/sync?id=${client.id}`} method="POST">
                  <Button variant="outline" size="sm" className="gap-2 h-9">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync
                  </Button>
                </form>
                <Link href={`/clients/${client.id}/edit`}>
                  <Button size="sm" className="gap-2 h-9">
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Spend"
            value={formatCurrency(stats.totalSpend, "INR", true)}
            icon={DollarSign}
            variant="default"
          />
          <StatsCard
            title="Total Conversions"
            value={formatNumber(stats.totalConversions)}
            icon={TrendingUp}
            variant="success"
          />
          <StatsCard
            title="Total Clicks"
            value={formatNumber(stats.totalClicks, true)}
            icon={MousePointerClick}
            variant="info"
          />
          <StatsCard
            title="Active Campaigns"
            value={String(stats.activeCampaigns)}
            subtitle={`of ${client.campaigns.length} total`}
            icon={Activity}
            variant="default"
          />
        </div>

        {/* Chart + Budget */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SpendChart
              data={chartData}
              title={`${client.name} — Spend (Last 30 Days)`}
              description="Daily spend and conversion performance"
            />
          </div>
          <BudgetProgress campaigns={client.campaigns} />
        </div>

        {/* Campaign table */}
        <CampaignTable
          campaigns={client.campaigns.map((c) => ({
            ...c,
            client: { id: client.id, name: client.name, platform: client.platform },
          })) as CampaignWithClient[]}
          title="Campaigns"
          description={`All campaigns for ${client.name}`}
          showClientColumn={false}
        />

        {/* Alerts */}
        {client.alerts.length > 0 && (
          <RecentAlerts
            alerts={client.alerts as AlertWithClient[]}
            title="Unread Alerts"
            description="Alerts for this client"
          />
        )}
      </div>
    </div>
  );
}
