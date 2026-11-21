"use client";

import { useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { Header } from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { PageLoader } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorMessage } from "@/components/shared/ErrorMessage";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { ClientSelect } from "@/components/shared/ClientSelect";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useClients } from "@/hooks/useClients";
import type { CampaignSortField } from "@/types";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, BarChart3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;

/** Matches DAILY_STATS_DAYS in lib/metaAds — how far back daily stats are synced. */
const HISTORY_DAYS = 90;

type DatePreset =
  | "LAST_30" | "TODAY" | "YESTERDAY" | "LAST_7" | "LAST_14"
  | "THIS_MONTH" | "LAST_MONTH" | "LAST_90" | "CUSTOM";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "YESTERDAY", label: "Yesterday" },
  { value: "LAST_7", label: "Last 7 days" },
  { value: "LAST_14", label: "Last 14 days" },
  { value: "LAST_30", label: "Last 30 days" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "LAST_90", label: "Last 90 days" },
  { value: "CUSTOM", label: "Custom range" },
];

const day = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Resolve a preset to a YYYY-MM-DD range. "Last 30 days" returns no range so
 * the API serves the campaign totals stored at sync time.
 */
function resolveRange(preset: DatePreset, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  switch (preset) {
    case "TODAY": return { from: day(now), to: day(now) };
    case "YESTERDAY": return { from: day(subDays(now, 1)), to: day(subDays(now, 1)) };
    case "LAST_7": return { from: day(subDays(now, 6)), to: day(now) };
    case "LAST_14": return { from: day(subDays(now, 13)), to: day(now) };
    case "THIS_MONTH": return { from: day(startOfMonth(now)), to: day(now) };
    case "LAST_MONTH": {
      const last = subMonths(now, 1);
      return { from: day(startOfMonth(last)), to: day(endOfMonth(last)) };
    }
    case "LAST_90": return { from: day(subDays(now, HISTORY_DAYS - 1)), to: day(now) };
    case "CUSTOM": return { from: customFrom || undefined, to: customTo || undefined };
    default: return {};
  }
}

const SORT_OPTIONS: { value: CampaignSortField; label: string }[] = [
  { value: "spend", label: "Spend" },
  { value: "clicks", label: "Clicks" },
  { value: "impressions", label: "Impressions" },
  { value: "conversions", label: "Conversions" },
  { value: "ctr", label: "CTR" },
  { value: "cpc", label: "CPC" },
  { value: "name", label: "Name" },
  { value: "lastSynced", label: "Last synced" },
];

export default function CampaignsPage() {
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("ALL");
  const [platform, setPlatform] = useState<"ALL" | "GOOGLE" | "META">("ALL");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "PAUSED" | "ENDED" | "DELETED">("ALL");
  const [sortBy, setSortBy] = useState<CampaignSortField>("spend");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [datePreset, setDatePreset] = useState<DatePreset>("LAST_30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);

  const { from, to } = useMemo(
    () => resolveRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo]
  );
  const minDate = day(subDays(new Date(), HISTORY_DAYS - 1));

  const { clients } = useClients();
  const { campaigns, total, totalPages, isLoading, error } = useCampaigns({
    clientId: clientId !== "ALL" ? clientId : undefined,
    platform: platform !== "ALL" ? platform : undefined,
    status: status !== "ALL" ? status : undefined,
    search: search.length > 1 ? search : undefined,
    from,
    to,
    sortBy,
    sortOrder,
    page,
    pageSize: PAGE_SIZE,
  });

  const resetPage = () => setPage(1);
  const isFiltered =
    search !== "" || clientId !== "ALL" || platform !== "ALL" || status !== "ALL" ||
    datePreset !== "LAST_30" || sortBy !== "spend" || sortOrder !== "desc";

  const resetFilters = () => {
    setSearch("");
    setDatePreset("LAST_30");
    setCustomFrom("");
    setCustomTo("");
    setClientId("ALL");
    setPlatform("ALL");
    setStatus("ALL");
    setSortBy("spend");
    setSortOrder("desc");
    resetPage();
  };

  return (
    <div className="flex flex-col">
      <Header title="Campaigns" />

      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 animate-fade-in md:p-8">
        <PageHeader
          title="Campaigns"
          description="Every campaign across all clients and platforms"
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:w-auto sm:min-w-[240px] sm:flex-1 lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search campaigns…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              className="bg-card pl-9"
            />
          </div>

          <ClientSelect
            clients={clients}
            value={clientId}
            onChange={(v) => { setClientId(v); resetPage(); }}
            className="w-[calc(50%-4px)] sm:w-[190px]"
          />

          <Select value={platform} onValueChange={(v) => { setPlatform(v as typeof platform); resetPage(); }}>
            <SelectTrigger className="w-[calc(50%-4px)] bg-card sm:w-[150px]">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All platforms</SelectItem>
              <SelectItem value="GOOGLE">Google Ads</SelectItem>
              <SelectItem value="META">Meta Ads</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); resetPage(); }}>
            <SelectTrigger className="w-[calc(50%-4px)] bg-card sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="ENDED">Ended</SelectItem>
              <SelectItem value="DELETED">Deleted</SelectItem>
            </SelectContent>
          </Select>

          <Select value={datePreset} onValueChange={(v) => { setDatePreset(v as DatePreset); resetPage(); }}>
            <SelectTrigger className="w-[calc(50%-4px)] bg-card sm:w-[160px]">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {datePreset === "CUSTOM" && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input
                type="date"
                aria-label="From date"
                value={customFrom}
                min={minDate}
                max={customTo || day(new Date())}
                onChange={(e) => { setCustomFrom(e.target.value); resetPage(); }}
                className="flex-1 bg-card sm:w-[150px]"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                value={customTo}
                min={customFrom || minDate}
                max={day(new Date())}
                onChange={(e) => { setCustomTo(e.target.value); resetPage(); }}
                className="flex-1 bg-card sm:w-[150px]"
              />
            </div>
          )}

          <div className="flex w-[calc(50%-4px)] items-center gap-1 sm:w-auto">
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v as CampaignSortField); resetPage(); }}>
              <SelectTrigger className="min-w-0 flex-1 bg-card sm:w-[170px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>Sort: {o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 bg-card"
              aria-label={sortOrder === "desc" ? "Sorted high to low" : "Sorted low to high"}
              title={sortOrder === "desc" ? "High to low" : "Low to high"}
              onClick={() => { setSortOrder((o) => (o === "desc" ? "asc" : "desc")); resetPage(); }}
            >
              {sortOrder === "desc" ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
            </Button>
          </div>

          {isFiltered && (
            <Button variant="ghost" onClick={resetFilters} className="text-muted-foreground">
              <X />
              Clear
            </Button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <PageLoader text="Loading campaigns..." />
        ) : error ? (
          <ErrorMessage message={error} />
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No campaigns found"
            description={
              isFiltered
                ? "No campaigns match these filters."
                : "Sync your clients to pull in their campaign data."
            }
            action={isFiltered ? { label: "Clear filters", onClick: resetFilters } : undefined}
          />
        ) : (
          <div className="space-y-4">
            <CampaignTable
              campaigns={campaigns}
              title="Campaign performance"
              description={`${DATE_PRESETS.find((p) => p.value === datePreset)?.label}${
                datePreset === "CUSTOM" && (from || to) ? ` (${from ?? "…"} – ${to ?? "…"})` : ""
              } · CTR is green above 2% and red below 1%`}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="campaigns"
            />
          </div>
        )}
      </div>
    </div>
  );
}
