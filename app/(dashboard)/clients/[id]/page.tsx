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
import { LeadsView } from "@/components/leads/LeadsView";
import { SyncButton } from "@/components/shared/SyncButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Edit, IndianRupee, MousePointerClick,
  Target, Activity, Mail, Phone, Building2, CalendarDays, Wallet, CreditCard,
} from "lucide-react";
import {
  cn, formatCurrency, formatNumber, formatPercent, getPlatformLabel,
  getPlatformColor, safeJsonParse, formatDate, formatRelativeTime,
} from "@/lib/utils";
import {
  balanceCaption, balanceLabel, balanceToneClass, balanceValue, getBalanceTone,
} from "@/components/clients/BalanceInfo";
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
  const totalImpressions = client.campaigns.reduce((s, c) => s + c.impressions, 0);
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
    stats: {
      totalSpend, totalConversions, totalClicks, activeCampaigns,
      costPerConversion: totalConversions > 0 ? totalSpend / totalConversions : 0,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    },
    chartData,
  };
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default async function ClientDetailPage({ params }: Params) {
  const { id } = await params;
  const data = await getClientData(id);

  if (!data) notFound();

  const { client, stats, chartData } = data;
  const platformColor = getPlatformColor(client.platform);
  const balanceTone = getBalanceTone(client);
  const initials = client.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex flex-col">
      <Header title={client.name} parent={{ label: "Clients", href: "/clients" }} />

      <div className="mx-auto w-full max-w-[1400px] space-y-8 p-4 animate-fade-in md:p-8">
        {/* Client profile */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white shadow-sm"
              style={{ backgroundColor: platformColor }}
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${platformColor}1a`, color: platformColor }}
                >
                  {getPlatformLabel(client.platform)}
                </span>
                {!client.isActive && (
                  <span className="rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                    Inactive
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                {client.company && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {client.company}
                  </span>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-primary">
                    <Mail className="h-3.5 w-3.5" />
                    {client.email}
                  </a>
                )}
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-primary">
                    <Phone className="h-3.5 w-3.5" />
                    {client.phone}
                  </a>
                )}
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Added {formatDate(client.createdAt)}
                </span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" title="Ad account ID">
                  {client.accountId}
                </code>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SyncButton clientId={client.id} />
            <Button asChild>
              <Link href={`/clients/${client.id}/edit`}>
                <Edit />
                Edit client
              </Link>
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <StatsCard
            title={balanceLabel(client)}
            value={balanceValue(client)}
            subtitle={
              <span className={cn(["critical", "warning"].includes(balanceTone) && balanceToneClass[balanceTone])}>
                {balanceCaption(client)}
                {client.balanceUpdatedAt && <span className="text-muted-foreground"> · {formatRelativeTime(client.balanceUpdatedAt)}</span>}
              </span>
            }
            icon={balanceTone === "postpaid" ? CreditCard : Wallet}
            variant={balanceTone === "critical" ? "danger" : balanceTone === "warning" ? "warning" : "success"}
          />
          <StatsCard
            title="Total Spend"
            value={formatCurrency(stats.totalSpend, "INR", true)}
            subtitle="Lifetime"
            icon={IndianRupee}
          />
          <StatsCard
            title="Conversions"
            value={formatNumber(stats.totalConversions)}
            subtitle={stats.costPerConversion > 0 ? `${formatCurrency(stats.costPerConversion)} per conversion` : "No conversions yet"}
            icon={Target}
            variant="success"
          />
          <StatsCard
            title="Clicks"
            value={formatNumber(stats.totalClicks, true)}
            subtitle={`${formatPercent(stats.ctr)} CTR`}
            icon={MousePointerClick}
            variant="info"
          />
          <StatsCard
            title="Active Campaigns"
            value={String(stats.activeCampaigns)}
            subtitle={`of ${client.campaigns.length} total`}
            icon={Activity}
            variant="warning"
          />
        </div>

        {/* Unread alerts first — they're the most actionable thing on the page */}
        {client.alerts.length > 0 && (
          <RecentAlerts
            alerts={client.alerts as AlertWithClient[]}
            title="Unread Alerts"
            description={`${client.alerts.length} alert${client.alerts.length !== 1 ? "s" : ""} for this client`}
          />
        )}

        {/* Chart + Budget */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SpendChart
              data={chartData}
              title="Spend & Conversions"
              description="Daily totals for the last 30 days"
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
          description={`${client.campaigns.length} campaign${client.campaigns.length !== 1 ? "s" : ""}, highest spend first`}
          showClientColumn={false}
        />

        {/* Leads */}
        <section className="space-y-4">
          <SectionHeading
            title="Leads"
            description={`WhatsApp, Meta Lead Form, website and call enquiries for ${client.name}`}
          />
          <LeadsView clientId={client.id} />
        </section>
      </div>
    </div>
  );
}
