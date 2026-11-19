"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, parseISO,
} from "date-fns";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageLoader } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorMessage } from "@/components/shared/ErrorMessage";
import { Pagination } from "@/components/shared/Pagination";
import { useLeads } from "@/hooks/useLeads";
import { useClients } from "@/hooks/useClients";
import { cn, formatDate, formatNumber, getLeadSourceColor, getLeadSourceLabel } from "@/lib/utils";
import type { LeadSource } from "@/types";
import { Globe, Inbox, Layers, Mail, MessageCircle, Phone, PhoneIncoming, Search, FileText } from "lucide-react";

const PAGE_SIZE = 25;

const SOURCE_ICONS = {
  ALL: Layers,
  WHATSAPP: MessageCircle,
  META_FORM: FileText,
  WEBSITE: Globe,
  MANUAL: PhoneIncoming,
} as const;

const SOURCES: LeadSource[] = ["WHATSAPP", "META_FORM", "WEBSITE", "MANUAL"];

type DatePreset =
  | "ALL" | "TODAY" | "YESTERDAY" | "LAST_7" | "LAST_30"
  | "THIS_MONTH" | "LAST_MONTH" | "CUSTOM";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "ALL", label: "All time" },
  { value: "TODAY", label: "Today" },
  { value: "YESTERDAY", label: "Yesterday" },
  { value: "LAST_7", label: "Last 7 days" },
  { value: "LAST_30", label: "Last 30 days" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "CUSTOM", label: "Custom range" },
];

/** Resolve a preset to an ISO range in the viewer's local timezone. */
function resolveRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { from?: string; to?: string } {
  const now = new Date();
  const range = (from: Date, to: Date) => ({ from: from.toISOString(), to: to.toISOString() });

  switch (preset) {
    case "TODAY": return range(startOfDay(now), endOfDay(now));
    case "YESTERDAY": return range(startOfDay(subDays(now, 1)), endOfDay(subDays(now, 1)));
    case "LAST_7": return range(startOfDay(subDays(now, 6)), endOfDay(now));
    case "LAST_30": return range(startOfDay(subDays(now, 29)), endOfDay(now));
    case "THIS_MONTH": return range(startOfMonth(now), endOfDay(now));
    case "LAST_MONTH": {
      const last = subMonths(now, 1);
      return range(startOfMonth(last), endOfMonth(last));
    }
    case "CUSTOM":
      return {
        from: customFrom ? startOfDay(parseISO(customFrom)).toISOString() : undefined,
        to: customTo ? endOfDay(parseISO(customTo)).toISOString() : undefined,
      };
    default:
      return {};
  }
}

/** wa.me wants digits only, including country code */
function whatsappLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

interface LeadsViewProps {
  /** When set, the client filter is hidden and results are locked to this client. */
  clientId?: string;
}

export function LeadsView({ clientId: lockedClientId }: LeadsViewProps) {
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("ALL");
  const [source, setSource] = useState<LeadSource | "ALL">("ALL");
  const [datePreset, setDatePreset] = useState<DatePreset>("LAST_30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);

  const { clients } = useClients();
  const { from, to } = useMemo(
    () => resolveRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo]
  );

  const effectiveClientId = lockedClientId ?? (clientId !== "ALL" ? clientId : undefined);

  const { leads, total, totalPages, countsBySource, isLoading, error } = useLeads({
    clientId: effectiveClientId,
    source: source !== "ALL" ? source : undefined,
    from,
    to,
    search: search.length > 1 ? search : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const allCount = SOURCES.reduce((sum, s) => sum + countsBySource[s], 0);
  const resetPage = () => setPage(1);
  const periodLabel = DATE_PRESETS.find((p) => p.value === datePreset)?.label.toLowerCase();

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-auto sm:min-w-[240px] sm:flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, email, campaign…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="bg-card pl-9"
          />
        </div>

        {!lockedClientId && (
          <Select value={clientId} onValueChange={(v) => { setClientId(v); resetPage(); }}>
            <SelectTrigger className="w-[calc(50%-4px)] bg-card sm:w-[190px]">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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
              max={customTo || undefined}
              onChange={(e) => { setCustomFrom(e.target.value); resetPage(); }}
              className="flex-1 bg-card sm:w-[150px]"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => { setCustomTo(e.target.value); resetPage(); }}
              className="flex-1 bg-card sm:w-[150px]"
            />
          </div>
        )}
      </div>

      {/* Source breakdown — doubles as the source filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(["ALL", ...SOURCES] as const).map((s) => {
          const count = s === "ALL" ? allCount : countsBySource[s];
          const active = source === s;
          const Icon = SOURCE_ICONS[s];
          const color = s === "ALL" ? undefined : getLeadSourceColor(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => { setSource(s); resetPage(); }}
              className={cn(
                "rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40",
                active && "border-primary ring-1 ring-primary"
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span
                  className={cn("flex h-7 w-7 items-center justify-center rounded-md", s === "ALL" && "bg-primary/10 text-primary")}
                  style={color ? { backgroundColor: `${color}1a`, color } : undefined}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate">{s === "ALL" ? "All leads" : getLeadSourceLabel(s)}</span>
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums">{formatNumber(count)}</div>
              <div className="text-xs text-muted-foreground">{periodLabel}</div>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <PageLoader text="Loading leads..." />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No leads found"
          description="Try a wider date range or different filters."
          action={datePreset !== "ALL" ? { label: "Show all time", onClick: () => { setDatePreset("ALL"); resetPage(); } } : undefined}
        />
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="th pl-5">Received</th>
                    <th className="th">Lead</th>
                    <th className="th">Source</th>
                    <th className="th">Status</th>
                    {!lockedClientId && <th className="th">Client</th>}
                    <th className="th">Campaign</th>
                    <th className="th pr-5">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="align-top transition-colors hover:bg-muted/40">
                      <td className="whitespace-nowrap py-3 pl-5 pr-4">
                        <div className="font-medium">{formatDate(lead.createdAt, "MMM d, yyyy")}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(lead.createdAt, "h:mm a")}</div>
                      </td>
                      <td className="min-w-[180px] px-4 py-3">
                        <div className="font-medium">{lead.name || <span className="text-muted-foreground">Unnamed</span>}</div>
                        <div className="mt-1 space-y-0.5 text-xs">
                          {lead.phone && (
                            <a
                              href={lead.source === "WHATSAPP" ? whatsappLink(lead.phone) : `tel:${lead.phone}`}
                              target={lead.source === "WHATSAPP" ? "_blank" : undefined}
                              rel="noreferrer"
                              className="flex items-center gap-1.5 tabular-nums text-muted-foreground hover:text-primary"
                              title={lead.source === "WHATSAPP" ? "Open WhatsApp chat" : "Call"}
                            >
                              {lead.source === "WHATSAPP" ? <MessageCircle className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                              {lead.phone}
                            </a>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{lead.email}</span>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: `${getLeadSourceColor(lead.source)}1a`, color: getLeadSourceColor(lead.source) }}
                        >
                          {getLeadSourceLabel(lead.source)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {lead.crmStatus ? (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80" title="TeleCRM status">
                            {lead.crmStatus}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {!lockedClientId && (
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link href={`/clients/${lead.client.id}`} className="font-medium text-foreground/80 hover:text-primary hover:underline">
                            {lead.client.name}
                          </Link>
                        </td>
                      )}
                      <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground" title={lead.campaign ?? undefined}>
                        {lead.campaign || "—"}
                      </td>
                      <td className="max-w-[280px] py-3 pl-4 pr-5 text-muted-foreground" title={lead.message ?? undefined}>
                        <p className="line-clamp-2">{lead.message || "—"}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="leads"
          />
        </div>
      )}
    </div>
  );
}
