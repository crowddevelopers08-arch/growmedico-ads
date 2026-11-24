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
import { ClientDateFilter } from "@/components/clients/ClientDateFilter";
import { TeleCrmStatusPanel } from "@/components/clients/TeleCrmStatusPanel";
import { SyncButton } from "@/components/shared/SyncButton";
import { Button } from "@/components/ui/button";
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
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  return { title: client?.name ?? "Client" };
}

function resolveDateRange(range: string, from?: string, to?: string) {
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
    case "THIS_WEEK": {
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      return { from: shift(today, -((weekday + 6) % 7)), to: today };
    }
    case "THIS_MONTH": return { from: `${today.slice(0, 7)}-01`, to: today };
    case "LAST_MONTH": {
      const first = `${today.slice(0, 7)}-01`;
      const end = shift(first, -1);
      return { from: `${end.slice(0, 7)}-01`, to: end };
    }
    case "CUSTOM": return { from: from || undefined, to: to || undefined };
    case "ALL": return {};
    default: return { from: shift(today, -29), to: today };
  }
}

function istDateBoundary(date: string, end = false) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, end ? 18 : -6, end ? 30 : 30));
}

async function getClientData(id: string, range: { from?: string; to?: string }) {
  const leadDateFilter = {
    ...(range.from && { gte: istDateBoundary(range.from) }),
    ...(range.to && { lt: istDateBoundary(range.to, true) }),
  };
  const [client, leadStatuses] = await Promise.all([prisma.client.findUnique({
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
  }), prisma.lead.groupBy({
    by: ["crmStatus"],
    where: { clientId: id, crmStatus: { not: null }, ...(Object.keys(leadDateFilter).length ? { createdAt: leadDateFilter } : {}) },
    _count: { _all: true },
  })]);

  if (!client) return null;

  const totalSpend = client.campaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = client.campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalClicks = client.campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = client.campaigns.reduce((s, c) => s + c.impressions, 0);
  const activeCampaigns = client.campaigns.filter((c) => c.status === "ACTIVE").length;
  const hasDateRange = Boolean(range.from || range.to);
  const campaignStats = client.campaigns.map((campaign) => {
    const stats = safeJsonParse<DailyStatEntry[]>(campaign.dailyStats, []).filter((stat) =>
      (!range.from || stat.date >= range.from) && (!range.to || stat.date <= range.to)
    );
    if (!hasDateRange) return campaign;
    const spend = stats.reduce((sum, stat) => sum + stat.spend, 0);
    const clicks = stats.reduce((sum, stat) => sum + stat.clicks, 0);
    const impressions = stats.reduce((sum, stat) => sum + stat.impressions, 0);
    const conversions = stats.reduce((sum, stat) => sum + stat.conversions, 0);
    return { ...campaign, spend, clicks, impressions, conversions,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0, cpa: conversions > 0 ? spend / conversions : 0 };
  });
  const displayedCampaigns = hasDateRange
    ? campaignStats.sort((a, b) => b.spend - a.spend)
    : client.campaigns;
  const displayedSpend = hasDateRange ? campaignStats.reduce((sum, campaign) => sum + campaign.spend, 0) : totalSpend;
  const displayedConversions = hasDateRange ? campaignStats.reduce((sum, campaign) => sum + campaign.conversions, 0) : totalConversions;
  const displayedClicks = hasDateRange ? campaignStats.reduce((sum, campaign) => sum + campaign.clicks, 0) : totalClicks;
  const displayedImpressions = hasDateRange ? campaignStats.reduce((sum, campaign) => sum + campaign.impressions, 0) : totalImpressions;
  const crmStatusCounts = leadStatuses
    .map(({ crmStatus, _count }) => ({ status: crmStatus!, count: _count._all }))
    .sort((a, b) => b.count - a.count);
  const totalCrmLeads = crmStatusCounts.reduce((sum, item) => sum + item.count, 0);

  // Merge daily stats for chart
  const chartDataMap = new Map<string, ChartDataPoint>();
  for (const campaign of client.campaigns) {
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

  return {
    client,
    campaignStats: displayedCampaigns,
    crmStatusCounts,
    totalCrmLeads,
    stats: {
      totalSpend: displayedSpend, totalConversions: displayedConversions, totalClicks: displayedClicks, activeCampaigns,
      costPerConversion: displayedConversions > 0 ? displayedSpend / displayedConversions : 0,
      ctr: displayedImpressions > 0 ? (displayedClicks / displayedImpressions) * 100 : 0,
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

export default async function ClientDetailPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const range = resolveDateRange(query.range ?? "LAST_30", query.from, query.to);
  const data = await getClientData(id, range);

  if (!data) notFound();

  const { client, stats, chartData, crmStatusCounts, totalCrmLeads, campaignStats } = data;
  const rangeLabel = query.range === "ALL" ? "All time" : query.range === "CUSTOM"
    ? `${range.from ?? "Any date"} – ${range.to ?? "Today"}`
    : query.range === "TODAY" ? "Today" : query.range === "YESTERDAY" ? "Yesterday"
    : query.range === "LAST_7" ? "Last 7 days" : query.range === "THIS_WEEK" ? "This week"
    : query.range === "THIS_MONTH" ? "This month" : query.range === "LAST_MONTH" ? "Last month"
    : "Last 30 days";
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

        <ClientDateFilter />

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
            subtitle={rangeLabel}
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

        <TeleCrmStatusPanel statuses={crmStatusCounts} total={totalCrmLeads} />

        {/* Unread alerts first — they're the most actionable thing on the page */}
        {client.alerts.length > 0 && (
          <RecentAlerts
            alerts={client.alerts as AlertWithClient[]}
            title="Unread Alerts"
            description={`${client.alerts.length} alert${client.alerts.length !== 1 ? "s" : ""} for this client`}
            compact
          />
        )}

        {/* Chart + Budget */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SpendChart
              data={chartData}
              title="Spend & Conversions"
              description={`Daily totals · ${rangeLabel}`}
            />
          </div>
          <BudgetProgress campaigns={client.campaigns} />
        </div>

        {/* Campaign table */}
        <CampaignTable
          campaigns={campaignStats.map((c) => ({
            ...c,
            client: { id: client.id, name: client.name, platform: client.platform },
          })) as CampaignWithClient[]}
          title="Campaigns"
          description={`${client.campaigns.length} campaign${client.campaigns.length !== 1 ? "s" : ""}, highest spend first`}
          showClientColumn={false}
        />

        {/* Leads */}
        <section id="client-leads" className="scroll-mt-20 space-y-4">
          <SectionHeading
            title="Leads"
            description={`WhatsApp, Meta Lead Form, website and call enquiries for ${client.name}`}
          />
          <LeadsView
            key={`${query.range ?? "LAST_30"}-${query.from ?? ""}-${query.to ?? ""}-${query.crmStatus ?? ""}`}
            clientId={client.id}
            initialCrmStatus={query.crmStatus}
            initialDatePreset={(query.range ?? "LAST_30") as "ALL" | "TODAY" | "YESTERDAY" | "LAST_7" | "THIS_WEEK" | "LAST_30" | "THIS_MONTH" | "LAST_MONTH" | "CUSTOM"}
            initialFrom={query.from}
            initialTo={query.to}
          />
        </section>
      </div>
    </div>
  );
}
