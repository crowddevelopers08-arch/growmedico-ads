"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfWeek, subDays, subWeeks } from "date-fns";
import {
  AlertTriangle, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Loader2, RefreshCw, Search, Sheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ErrorMessage } from "@/components/shared/ErrorMessage";
import { useClients } from "@/hooks/useClients";
import { cn, formatCurrency, formatNumber, formatRelativeTime } from "@/lib/utils";

type Preset = "LAST_WEEK" | "LAST_2" | "LAST_4" | "LAST_8" | "THIS_WEEK" | "CUSTOM";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "LAST_WEEK", label: "Last week (Mon–Sun)" },
  { value: "LAST_2", label: "Last 2 weeks" },
  { value: "LAST_4", label: "Last 4 weeks" },
  { value: "LAST_8", label: "Last 8 weeks" },
  { value: "THIS_WEEK", label: "This week so far" },
  { value: "CUSTOM", label: "Custom range" },
];

const day = (d: Date) => format(d, "yyyy-MM-dd");

function presetRange(p: Preset): { from: string; to: string } | null {
  const now = new Date();
  const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
  const lastSunday = subDays(thisMonday, 1);
  const weeks = { LAST_WEEK: 1, LAST_2: 2, LAST_4: 4, LAST_8: 8 } as Record<string, number>;
  if (p === "THIS_WEEK") return { from: day(thisMonday), to: day(now) };
  if (weeks[p]) return { from: day(subWeeks(thisMonday, weeks[p])), to: day(lastSunday) };
  return null;
}

interface PreviewRow {
  clientId: string;
  name: string;
  platform: "META" | "GOOGLE";
  hasCrm: boolean;
  lastSynced: string | null;
  weeks: number;
  campaigns: number;
  spend: number;
  leads: number;
  crm: number | null;
  appt: number | null;
  visited: number | null;
}

interface SheetStatus {
  configured: boolean;
  serviceAccountEmail: string | null;
  defaultSpreadsheetUrl: string | null;
}

const SHEET_KEY = "audit.sheetUrl";

export function AuditSheetsView() {
  const [preset, setPreset] = useState<Preset>("LAST_WEEK");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [weekly, setWeekly] = useState(true);
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = all active
  const [clientSearch, setClientSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<{ url: string; tabsWritten: number; weeksWritten: number; notesKept: number; spreadsheetTitle: string } | null>(null);

  const [sheetStatus, setSheetStatus] = useState<SheetStatus | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");

  const { clients } = useClients({ isActive: true });

  const range = useMemo(
    () => (preset === "CUSTOM" ? (customFrom && customTo ? { from: customFrom, to: customTo } : null) : presetRange(preset)),
    [preset, customFrom, customTo]
  );

  const query = useMemo(() => {
    if (!range) return null;
    const p = new URLSearchParams({ from: range.from, to: range.to, weekly: String(weekly) });
    if (selected && selected.size > 0) p.set("clientIds", [...selected].join(","));
    return p.toString();
  }, [range, weekly, selected]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SHEET_KEY);
      if (saved) setSheetUrl(saved);
    } catch {}
    fetch("/api/audit/sheet")
      .then((r) => r.json())
      .then((s: SheetStatus) => {
        setSheetStatus(s);
        setSheetUrl((cur) => cur || s.defaultSpreadsheetUrl || "");
      })
      .catch(() => setSheetStatus({ configured: false, serviceAccountEmail: null, defaultSpreadsheetUrl: null }));
  }, []);

  const loadPreview = useCallback(async () => {
    if (!query) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/audit?${query}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load preview");
      setPreview(json.data);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [query]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const download = async () => {
    if (!query || !range) return;
    setDownloading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/audit/download?${query}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Download failed");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `PM Audit ${range.from} to ${range.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const pushToSheet = async () => {
    if (!range) return;
    setPushing(true);
    setActionError(null);
    setPushResult(null);
    try {
      try { localStorage.setItem(SHEET_KEY, sheetUrl); } catch {}
      const res = await fetch("/api/audit/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheet: sheetUrl,
          from: range.from,
          to: range.to,
          weekly,
          clientIds: selected && selected.size > 0 ? [...selected] : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update the sheet");
      setPushResult(json);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update the sheet");
    } finally {
      setPushing(false);
    }
  };

  const toggleClient = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur ?? clients.map((c) => c.id));
      next.has(id) ? next.delete(id) : next.add(id);
      return next.size === clients.length ? null : next;
    });

  const visibleClients = clients.filter((c) => c.name.toLowerCase().includes(clientSearch.trim().toLowerCase()));
  const selectedCount = selected ? selected.size : clients.length;

  const totals = useMemo(() => {
    if (!preview) return null;
    return preview.reduce(
      (t, r) => ({ spend: t.spend + r.spend, leads: t.leads + r.leads, appt: t.appt + (r.appt ?? 0), crm: t.crm + (r.crm ?? 0) }),
      { spend: 0, leads: 0, appt: 0, crm: 0 }
    );
  }, [preview]);

  const busy = downloading || pushing;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full space-y-1.5 sm:w-[220px]">
            <label className="text-xs font-medium text-muted-foreground">Period</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {preset === "CUSTOM" && (
            <div className="flex w-full items-end gap-2 sm:w-auto">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">From</label>
                <Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="bg-card sm:w-[150px]" />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="bg-card sm:w-[150px]" />
              </div>
            </div>
          )}

          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm">
            <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            One block per week
          </label>

          <div className="relative">
            <Button variant="outline" className="bg-card" onClick={() => setPickerOpen((o) => !o)}>
              {selected ? `${selectedCount} of ${clients.length} clients` : `All active clients (${clients.length})`}
            </Button>
            {pickerOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-[300px] rounded-md border bg-popover p-2 shadow-md">
                <div className="mb-2 flex items-center gap-2 border-b px-1 pb-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    autoFocus
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search clients…"
                    className="h-7 w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="mb-2 flex gap-2 px-1 text-xs">
                  <button className="text-primary hover:underline" onClick={() => setSelected(null)}>Select all</button>
                  <button className="text-primary hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
                  <button className="ml-auto text-muted-foreground hover:underline" onClick={() => setPickerOpen(false)}>Done</button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {visibleClients.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                      <input type="checkbox" checked={!selected || selected.has(c.id)} onChange={() => toggleClient(c.id)} className="h-4 w-4" />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button onClick={download} disabled={!range || busy || selectedCount === 0}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            Download Excel
          </Button>
          <Button variant="outline" onClick={pushToSheet} disabled={!range || busy || !sheetStatus?.configured || !sheetUrl || selectedCount === 0}>
            {pushing ? <Loader2 className="animate-spin" /> : <Sheet />}
            Update Google Sheet
          </Button>
          <Button variant="ghost" size="sm" onClick={loadPreview} disabled={previewLoading || !range}>
            <RefreshCw className={cn(previewLoading && "animate-spin")} />
            Refresh preview
          </Button>
          {range && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(range.from), "dd MMM")} – {format(new Date(range.to), "dd MMM yyyy")}
            </span>
          )}
        </div>

        {actionError && <ErrorMessage message={actionError} />}
        {pushResult && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Updated “{pushResult.spreadsheetTitle}” — {pushResult.tabsWritten} client tabs, {pushResult.weeksWritten} week blocks
            {pushResult.notesKept > 0 && `, ${pushResult.notesKept} team notes kept`}.
            <a href={pushResult.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">
              Open sheet <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </Card>

      {/* Google Sheet target */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Google Sheet</h2>
        </div>
        {sheetStatus === null ? (
          <p className="text-sm text-muted-foreground">Checking setup…</p>
        ) : !sheetStatus.configured ? (
          <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Google Sheets isn’t connected yet. Add <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and{" "}
              <code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code> to the server (see SETUP.md → “Audit sheets”). Excel download works without it.
            </span>
          </div>
        ) : (
          <>
            <Input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="Paste the Google Sheet link — https://docs.google.com/spreadsheets/d/…"
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground">
              Share the sheet with <span className="font-medium text-foreground">{sheetStatus.serviceAccountEmail}</span> as an
              Editor. Use a new, empty spreadsheet — each update rewrites the weeks you pick, keeps older weeks, and keeps
              what the team typed in Notes, Action and Media Buyer.
            </p>
          </>
        )}
      </Card>

      {/* Preview */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Preview — what goes into the sheet</h2>
          {totals && (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(totals.spend)} spend · {formatNumber(totals.leads)} platform leads · {formatNumber(totals.crm)} CRM leads ·{" "}
              {formatNumber(totals.appt)} appointments
            </p>
          )}
        </div>
        {previewError ? (
          <div className="p-5"><ErrorMessage message={previewError} /></div>
        ) : previewLoading && !preview ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building preview…
          </div>
        ) : (
          <div className={cn("overflow-x-auto", previewLoading && "opacity-60")}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {["Client", "TeleCRM", "Campaigns", "Spend", "Leads", "CPL", "CRM leads", "Appt", "Visited", "Ads synced"].map((h, i) => (
                    <th key={h} className={cn("whitespace-nowrap px-4 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(preview ?? []).map((r) => (
                  <tr key={r.clientId} className="border-t">
                    <td className="max-w-[260px] truncate px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right">
                      {r.hasCrm ? <span className="text-emerald-600 dark:text-emerald-400">Yes</span> : <span className="text-amber-600 dark:text-amber-400">No</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.campaigns}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.spend)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(r.leads)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.leads > 0 ? formatCurrency(r.spend / r.leads) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.crm ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.appt ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.visited ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted-foreground">
                      {r.lastSynced ? formatRelativeTime(r.lastSynced) : "never"}
                    </td>
                  </tr>
                ))}
                {preview && preview.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">No clients selected</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
