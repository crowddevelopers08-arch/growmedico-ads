/**
 * One standard, styled layout for every client tab and the MENU tab.
 * buildClientSpec / buildMenuSpec return the cell values *and* every style,
 * merge and highlight, and both renderers (Excel export, Google Sheets) just
 * apply the spec — so every tab looks exactly the same wherever it's opened.
 */

import { format, parseISO } from "date-fns";
import { blockTotal, type AuditBlock, type AuditMetrics, type ClientAudit } from "./buildAudit";

export type Cell = string | number | null;
export type RowKind =
  | "banner" | "subtitle" | "section" | "band" | "group" | "header"
  | "data" | "total" | "kpiLabel" | "kpiValue" | "blank";
export type ColFormat = "text" | "date" | "money" | "int" | "pct";

// ── Theme ───────────────────────────────────────────────────

export const THEME = {
  banner: "1E3A8A",
  bannerText: "FFFFFF",
  subtitleBg: "EEF2FF",
  subtitleText: "4338CA",
  sectionBg: "E0E7FF",
  sectionText: "1E3A8A",
  zebra: "F8FAFC",
  border: "CBD5E1",
  totalBg: "E2E8F0",
  totalText: "0F172A",
  link: "2563EB",
  danger: { bg: "FEE2E2", fg: "B91C1C" },
  good: { bg: "DCFCE7", fg: "15803D" },
  flagText: "B91C1C",
  chips: {
    Meta: { bg: "E0E7FF", fg: "3730A3" },
    Google: { bg: "DCFCE7", fg: "166534" },
    CRM: { bg: "FEF3C7", fg: "92400E" },
  } as Record<string, { bg: string; fg: string }>,
  /** Week bands and tab colours rotate through these. */
  accents: ["1E3A8A", "0F766E", "7C3AED", "B45309", "BE185D", "0369A1", "15803D", "9333EA"],
};

interface ColGroup { label: string; c0: number; c1: number; dark: string; light: string }

// ── Audit log columns ───────────────────────────────────────

export const LOG_COLUMNS: { label: string; fmt: ColFormat; width: number }[] = [
  { label: "Audit From", fmt: "date", width: 12 },
  { label: "Audit To", fmt: "date", width: 12 },
  { label: "Channel", fmt: "text", width: 9 },
  { label: "Campaign Name", fmt: "text", width: 46 },
  { label: "Daily Budget (₹)", fmt: "money", width: 11 },
  { label: "Spend (₹)", fmt: "money", width: 12 },
  { label: "Impressions", fmt: "int", width: 12 },
  { label: "Clicks", fmt: "int", width: 9 },
  { label: "CTR (%)", fmt: "pct", width: 8 },
  { label: "Leads (Platform)", fmt: "int", width: 10 },
  { label: "CPL (₹)", fmt: "money", width: 9 },
  { label: "Leads (TeleCRM)", fmt: "int", width: 10 },
  { label: "Leakage (#)", fmt: "int", width: 9 },
  { label: "Leakage (%)", fmt: "pct", width: 9 },
  { label: "Appt Booked", fmt: "int", width: 9 },
  { label: "Visited", fmt: "int", width: 8 },
  { label: "Cost / Appt (₹)", fmt: "money", width: 11 },
  { label: "Interested / Call Back", fmt: "int", width: 11 },
  { label: "RNR", fmt: "int", width: 7 },
  { label: "Not Interested", fmt: "int", width: 10 },
  { label: "Out of Location", fmt: "int", width: 10 },
  { label: "Other / Invalid", fmt: "int", width: 9 },
  { label: "Not Yet Called", fmt: "int", width: 9 },
  { label: "Notes (Quality / Issues)", fmt: "text", width: 40 },
  { label: "Action (Next 3 Days)", fmt: "text", width: 40 },
];
export const NOTES_COL = 23;
export const ACTION_COL = 24;
export const LOG_WIDTH = LOG_COLUMNS.length;
export const LOG_HEADER_LABEL = LOG_COLUMNS[0].label;
const LEAKAGE_PCT_COL = 13;

const LOG_GROUPS: ColGroup[] = [
  { label: "CAMPAIGN", c0: 0, c1: 4, dark: "334155", light: "F1F5F9" },
  { label: "AD PERFORMANCE", c0: 4, c1: 11, dark: "1D4ED8", light: "DBEAFE" },
  { label: "CRM FUNNEL", c0: 11, c1: 17, dark: "047857", light: "D1FAE5" },
  { label: "LEAD QUALITY", c0: 17, c1: 23, dark: "C2410C", light: "FFEDD5" },
  { label: "TEAM NOTES", c0: 23, c1: 25, dark: "6D28D9", light: "EDE9FE" },
];

// ── Metric cells ────────────────────────────────────────────

const div = (a: number, b: number) => (b > 0 ? a / b : null);
const r0 = (n: number | null) => (n === null ? null : Math.round(n));
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

export function fmtDate(iso: string) {
  return format(parseISO(iso), "dd MMM yyyy");
}

/** Columns E–W (budget → not yet called). */
function metricCells(m: AuditMetrics, withBudget: boolean, leakageFrom: AuditMetrics | null = m): Cell[] {
  const crm = m.crm;
  const appt = crm ? crm.apptBooked + crm.visited : null;
  // Leakage = platform leads that never reached the CRM; only meaningful for ad rows
  const lk = leakageFrom?.crm && leakageFrom.leads > 0 ? leakageFrom : null;
  const leakage = lk ? Math.max(0, lk.leads - lk.crm!.total) : null;
  return [
    withBudget && m.budget ? r0(m.budget) : null,
    r2(m.spend),
    r0(m.impressions),
    r0(m.clicks),
    div(m.clicks, m.impressions),
    r0(m.leads),
    r0(div(m.spend, m.leads)),
    crm ? crm.total : null,
    leakage,
    lk ? leakage! / lk.leads : null,
    appt,
    crm ? crm.visited : null,
    appt ? r0(m.spend / appt) : null,
    crm ? crm.interested : null,
    crm ? crm.rnr : null,
    crm ? crm.notInterested : null,
    crm ? crm.outOfLocation : null,
    crm ? crm.invalid : null,
    crm ? crm.fresh : null,
  ];
}
// metricCells index → meaning (used by MENU / band text)
const M = { spend: 1, leads: 5, cpl: 6, crm: 7, leakPct: 9, appt: 10, visited: 11, costAppt: 12 };

/** Meta + Google totals only (no CRM-only leads) — the base for leakage. */
function adsOnly(block: AuditBlock | undefined, hasCrm: boolean): AuditMetrics | null {
  if (!block) return null;
  return blockTotal({ ...block, rows: block.rows.filter((r) => r.channel !== "CRM") }, hasCrm);
}

// ── Weekly blocks ───────────────────────────────────────────

export interface LogRowKey { from: string; to: string; channel: string; campaign: string }
export const rowKey = (k: LogRowKey) => `${k.from}|${k.to}|${k.channel}|${k.campaign}`.toLowerCase();

/** A week's body rows (campaign + total rows) — dates as "dd MMM yyyy". */
export interface WeekBody { from: string; to: string; rows: Cell[][]; kinds: ("data" | "total")[] }

export function weekBody(block: AuditBlock, notes: Map<string, [string, string]> = new Map()): WeekBody {
  const from = fmtDate(block.from);
  const to = fmtDate(block.to);
  const rows: Cell[][] = [];
  const kinds: ("data" | "total")[] = [];
  const keep = (channel: string, campaign: string) => notes.get(rowKey({ from, to, channel, campaign }));

  for (const row of block.rows) {
    const cells = metricCells(row, true);
    // CRM-only rows have no ad data: leave budget → CPL blank instead of ₹0
    if (row.channel === "CRM") for (let i = 0; i <= 6; i++) cells[i] = null;
    const saved = keep(row.channel, row.campaign);
    rows.push([from, to, row.channel, row.campaign, ...cells, saved?.[0] ?? "", saved?.[1] ?? ""]);
    kinds.push("data");
  }
  for (const ch of ["Meta", "Google"] as const) {
    const t = block.totals[ch];
    if (!t) continue;
    const saved = keep(ch, "Total");
    rows.push([from, to, ch, "Total", ...metricCells(t, true), saved?.[0] ?? "", saved?.[1] ?? ""]);
    kinds.push("total");
  }
  if (rows.length === 0) {
    rows.push([from, to, "", "No ad spend or CRM leads this week", ...Array(LOG_WIDTH - 4).fill(null)]);
    kinds.push("data");
  }
  return { from, to, rows, kinds };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (v: Cell) => (typeof v === "number" ? v : 0);

/** "WEEK · 09 Nov – 15 Nov 2026   Spend ₹55,843 · Leads 353 · CPL ₹158 · Appts 139" from the total rows. */
function bandText(w: WeekBody): string {
  const totals = w.rows.filter((_, i) => w.kinds[i] === "total");
  const spend = totals.reduce((s, r) => s + num(r[4 + M.spend]), 0);
  const leads = totals.reduce((s, r) => s + num(r[4 + M.leads]), 0);
  const hasCrm = totals.some((r) => typeof r[4 + M.crm] === "number");
  const appts = totals.reduce((s, r) => s + num(r[4 + M.appt]), 0);
  const parts = [`Spend ${inr(spend)}`, `Leads ${leads.toLocaleString("en-IN")}`];
  if (leads > 0) parts.push(`CPL ${inr(spend / leads)}`);
  if (hasCrm) parts.push(`Appts ${appts.toLocaleString("en-IN")}`);
  return `WEEK  ·  ${w.from.slice(0, 6)} – ${w.to}        ${parts.join("   ·   ")}`;
}

// ── Sheet spec ──────────────────────────────────────────────

export interface Style {
  bg?: string; fg?: string; bold?: boolean; italic?: boolean; size?: number; underline?: boolean;
  h?: "left" | "center" | "right"; v?: "top" | "middle"; wrap?: boolean; fmt?: ColFormat; border?: boolean;
}
export interface StyleOp { r0: number; r1: number; c0: number; c1: number; style: Style } // half-open ranges
export interface CondRule { r0: number; r1: number; c0: number; c1: number; gt?: number; lte?: number; bg: string; fg: string }
export interface SheetSpec {
  title: string;
  tabColor: string;
  rows: Cell[][];
  kinds: RowKind[];
  widths: number[];
  frozenRows: number;
  ops: StyleOp[];
  merges: [number, number, number, number][]; // r0, c0, r1, c1 (half-open)
  heights: Record<number, number>; // px
  conditional: CondRule[];
  links: { r: number; c: number; text: string; target: string }[]; // target = tab title
}

const HEIGHTS: Partial<Record<RowKind, number>> = {
  banner: 46, subtitle: 22, section: 26, band: 30, group: 20, header: 42, kpiLabel: 22, kpiValue: 38, blank: 10,
};

class SpecBuilder {
  rows: Cell[][] = [];
  kinds: RowKind[] = [];
  ops: StyleOp[] = [];
  merges: SheetSpec["merges"] = [];
  heights: Record<number, number> = {};
  constructor(readonly width: number) {}

  add(kind: RowKind, cells: Cell[] = []): number {
    const r = this.rows.length;
    this.rows.push(cells);
    this.kinds.push(kind);
    if (HEIGHTS[kind]) this.heights[r] = HEIGHTS[kind]!;
    return r;
  }
  style(r0: number, r1: number, c0: number, c1: number, style: Style) {
    this.ops.push({ r0, r1, c0, c1, style });
  }
  merge(r: number, c0: number, c1: number) {
    if (c1 - c0 > 1) this.merges.push([r, c0, r + 1, c1]);
  }
  /** Full-width coloured strip with one merged text cell. */
  strip(kind: RowKind, text: string, style: Style, c1 = this.width) {
    const r = this.add(kind, [text]);
    this.merge(r, 0, c1);
    this.style(r, r + 1, 0, this.width, { ...style, v: "middle" });
    return r;
  }
  groupHeader(groups: ColGroup[], labels: string[]) {
    const g = this.add("group", groups.flatMap((gr) => [gr.label, ...Array(gr.c1 - gr.c0 - 1).fill(null)]));
    for (const gr of groups) {
      this.merge(g, gr.c0, gr.c1);
      this.style(g, g + 1, gr.c0, gr.c1, { bg: gr.dark, fg: "FFFFFF", bold: true, size: 9, h: "center", v: "middle" });
    }
    const h = this.add("header", labels);
    for (const gr of groups) {
      this.style(h, h + 1, gr.c0, gr.c1, { bg: gr.light, fg: gr.dark, bold: true, size: 9, h: "center", v: "middle", wrap: true, border: true });
    }
    return h;
  }
}

function chip(b: SpecBuilder, r: number, c0: number, c1: number, channel: string) {
  const ch = THEME.chips[channel];
  if (ch) b.style(r, r + 1, c0, c1, { bg: ch.bg, fg: ch.fg, bold: true, h: "center" });
}

function bodyStyles(b: SpecBuilder, r0: number, kinds: ("data" | "total")[], rows: Cell[][], columns: { fmt: ColFormat }[], channelCol: number | null) {
  const r1 = r0 + kinds.length;
  b.style(r0, r1, 0, columns.length, { border: true, v: "top", size: 10 });
  columns.forEach((c, i) => {
    if (c.fmt !== "text" && c.fmt !== "date") b.style(r0, r1, i, i + 1, { fmt: c.fmt, h: "right" });
    if (c.fmt === "date") b.style(r0, r1, i, i + 1, { h: "center", fg: "475569" });
  });
  kinds.forEach((k, i) => {
    const r = r0 + i;
    if (k === "total") b.style(r, r + 1, 0, columns.length, { bg: THEME.totalBg, fg: THEME.totalText, bold: true });
    else if (i % 2 === 1) b.style(r, r + 1, 0, columns.length, { bg: THEME.zebra });
    if (channelCol !== null) chip(b, r, channelCol, channelCol + 1, String(rows[i][channelCol] ?? ""));
  });
}

export function tabColorFor(index: number) {
  return THEME.accents[index % THEME.accents.length];
}

/**
 * One client tab. `weeks` are all week blocks to show (fresh + kept), any order.
 */
export function buildClientSpec(
  audit: ClientAudit,
  title: string,
  tabIndex: number,
  weeks: WeekBody[],
  generatedAt: Date
): SheetSpec {
  const b = new SpecBuilder(LOG_WIDTH);
  const labels = LOG_COLUMNS.map((c) => c.label);
  const latest = audit.blocks[0];

  b.strip("banner", `${audit.name}  —  Weekly Performance Audit`, { bg: THEME.banner, fg: THEME.bannerText, bold: true, size: 18 });
  const sub = b.add("subtitle", [
    `Auto-filled from ${audit.platform === "GOOGLE" ? "Google" : "Meta"} Ads` +
      (audit.hasCrm ? " + TeleCRM" : "  ·  No TeleCRM connected — CRM columns are blank") +
      `   ·   Updated ${format(generatedAt, "dd MMM yyyy, h:mm a")}` +
      (audit.lastSynced ? `   ·   Ads synced ${format(new Date(audit.lastSynced), "dd MMM, h:mm a")}` : ""),
  ]);
  b.merge(sub, 0, LOG_WIDTH - 1);
  b.style(sub, sub + 1, 0, LOG_WIDTH, { bg: THEME.subtitleBg, fg: THEME.subtitleText, italic: true, size: 9, v: "middle" });
  b.style(sub, sub + 1, LOG_WIDTH - 1, LOG_WIDTH, { fg: THEME.link, underline: true, bold: true, italic: false, h: "center" });
  const links = [{ r: sub, c: LOG_WIDTH - 1, text: "← Back to MENU", target: "MENU" }];
  b.add("blank");

  // Latest-week summary, aligned under the same columns as the log
  b.strip("section", latest ? `LATEST WEEK SUMMARY   ·   ${fmtDate(latest.from)} – ${fmtDate(latest.to)}` : "LATEST WEEK SUMMARY", {
    bg: THEME.sectionBg, fg: THEME.sectionText, bold: true, size: 11,
  });
  b.groupHeader(LOG_GROUPS.slice(0, 4), ["Channel", "", "", "", ...labels.slice(4, NOTES_COL)]);
  b.merge(b.rows.length - 1, 0, 4);
  const sumStart = b.rows.length;
  const summary: [string, AuditMetrics | null, AuditMetrics | null, "data" | "total", string][] = [
    ["Meta Ads", latest?.totals.Meta ?? null, latest?.totals.Meta ?? null, "data", "Meta"],
    ["Google Ads", latest?.totals.Google ?? null, latest?.totals.Google ?? null, "data", "Google"],
    ["All channels (incl. CRM-only leads)", latest ? blockTotal(latest, audit.hasCrm) : null, adsOnly(latest, audit.hasCrm), "total", ""],
  ];
  for (const [label, m, lk, kind] of summary) {
    const cells = m ? metricCells(m, false, lk) : Array(19).fill(null);
    const r = b.add(kind, [label, null, null, null, ...cells]);
    b.merge(r, 0, 4);
  }
  bodyStyles(b, sumStart, summary.map((s) => s[3]), [], LOG_COLUMNS.slice(0, NOTES_COL), null);
  summary.forEach(([, , , , ch], i) => chip(b, sumStart + i, 0, 4, ch));
  b.style(sumStart, sumStart + summary.length, 0, 4, { h: "left", bold: true });
  b.add("blank");

  b.strip("section", "WEEKLY AUDIT LOG   ·   newest week first   ·   numbers are filled automatically — add your Notes & Action in the violet columns", {
    bg: THEME.sectionBg, fg: THEME.sectionText, bold: true, size: 11,
  });
  b.add("blank");

  const sorted = [...weeks].sort((x, y) => parseDisplayDate(y.from) - parseDisplayDate(x.from));
  sorted.forEach((w, i) => {
    const accent = THEME.accents[i % THEME.accents.length];
    b.strip("band", bandText(w), { bg: accent, fg: "FFFFFF", bold: true, size: 11 });
    b.groupHeader(LOG_GROUPS, labels);
    const start = b.rows.length;
    w.rows.forEach((row, j) => b.add(w.kinds[j], row));
    bodyStyles(b, start, w.kinds, w.rows, LOG_COLUMNS, 2);
    b.style(start, start + w.rows.length, NOTES_COL, LOG_WIDTH, { wrap: true });
    b.add("blank");
  });

  const end = b.rows.length;
  return {
    title,
    tabColor: tabColorFor(tabIndex),
    rows: b.rows,
    kinds: b.kinds,
    widths: LOG_COLUMNS.map((c) => c.width),
    frozenRows: 2,
    ops: b.ops,
    merges: b.merges,
    heights: b.heights,
    conditional: [
      { r0: 4, r1: end, c0: LEAKAGE_PCT_COL, c1: LEAKAGE_PCT_COL + 1, gt: 0.3, ...THEME.danger },
    ],
    links,
  };
}

export const parseDisplayDate = (s: string) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
};

// ── MENU tab ────────────────────────────────────────────────

export const MENU_COLUMNS: { label: string; fmt: ColFormat; width: number }[] = [
  { label: "Client Name (click to open)", fmt: "text", width: 34 },
  { label: "Platform", fmt: "text", width: 9 },
  { label: "TeleCRM", fmt: "text", width: 9 },
  { label: "Media Buyer", fmt: "text", width: 14 },
  { label: "Latest Week", fmt: "text", width: 24 },
  { label: "Spend (₹)", fmt: "money", width: 13 },
  { label: "Leads (Platform)", fmt: "int", width: 11 },
  { label: "CPL (₹)", fmt: "money", width: 10 },
  { label: "Leads (TeleCRM)", fmt: "int", width: 11 },
  { label: "Leakage (%)", fmt: "pct", width: 10 },
  { label: "Appt Booked", fmt: "int", width: 10 },
  { label: "Visited", fmt: "int", width: 9 },
  { label: "Cost / Appt (₹)", fmt: "money", width: 11 },
  { label: "Flags", fmt: "text", width: 44 },
];
export const MENU_BUYER_COL = 3;
export const MENU_HEADER_LABEL = MENU_COLUMNS[0].label;

const MENU_GROUPS: ColGroup[] = [
  { label: "CLIENT", c0: 0, c1: 5, dark: "334155", light: "F1F5F9" },
  { label: "AD PERFORMANCE", c0: 5, c1: 8, dark: "1D4ED8", light: "DBEAFE" },
  { label: "CRM FUNNEL", c0: 8, c1: 13, dark: "047857", light: "D1FAE5" },
  { label: "ATTENTION", c0: 13, c1: 14, dark: "B91C1C", light: "FEE2E2" },
];

/** MENU row values for one client in this run. */
export function menuRow(audit: ClientAudit, buyer: string): Cell[] {
  const latest = audit.blocks[0];
  const t = latest ? blockTotal(latest, audit.hasCrm) : null;
  const ads = adsOnly(latest, audit.hasCrm);
  const c = t ? metricCells(t, false, ads) : null;
  const flags: string[] = [];
  if (!audit.hasCrm) flags.push("No TeleCRM — can't track appointments");
  if (t && t.spend === 0) flags.push("No spend this week");
  if (t && t.spend > 0 && t.leads === 0) flags.push("Spend with 0 platform leads");
  if (ads?.crm && ads.leads > 0 && ads.crm.total / ads.leads < 0.7) flags.push("High CRM leakage (>30%)");
  if (audit.lastSynced && Date.now() - new Date(audit.lastSynced).getTime() > 2 * 86400000) flags.push("Ads data older than 2 days");
  return [
    audit.name,
    audit.platform === "GOOGLE" ? "Google" : "Meta",
    audit.hasCrm ? "Yes" : "No",
    buyer,
    latest ? `${fmtDate(latest.from).slice(0, 6)} – ${fmtDate(latest.to)}` : "",
    c?.[M.spend] ?? null, c?.[M.leads] ?? null, c?.[M.cpl] ?? null, c?.[M.crm] ?? null, c?.[M.leakPct] ?? null,
    c?.[M.appt] ?? null, c?.[M.visited] ?? null, c?.[M.costAppt] ?? null,
    flags.join("  ·  "),
  ];
}

/**
 * MENU tab. `entries` = every client row to list (this run + kept ones), each
 * with the tab title it links to (null if the tab doesn't exist).
 */
export function buildMenuSpec(entries: { row: Cell[]; tab: string | null }[], generatedAt: Date, weekLabel: string): SheetSpec {
  const W = MENU_COLUMNS.length;
  const b = new SpecBuilder(W);
  b.strip("banner", "CLIENT AUDIT DASHBOARD", { bg: THEME.banner, fg: THEME.bannerText, bold: true, size: 20 });
  b.strip("subtitle", `Week ${weekLabel}   ·   Updated ${format(generatedAt, "dd MMM yyyy, h:mm a")}   ·   one tab per client, same layout everywhere   ·   Media Buyer column is yours to edit`, {
    bg: THEME.subtitleBg, fg: THEME.subtitleText, italic: true, size: 9,
  });
  b.add("blank");

  // KPI cards sit directly above their matching columns
  const rows = entries.map((e) => e.row);
  const sum = (i: number) => rows.reduce((s, r) => s + num(r[i]), 0);
  const spend = sum(5), leads = sum(6), crm = sum(8), appt = sum(10), visited = sum(11);
  const withCrm = rows.filter((r) => r[2] === "Yes");
  // Portfolio leakage = each client's ad-lead leakage, weighted by its platform leads
  const leakRows = withCrm.filter((r) => typeof r[9] === "number" && num(r[6]) > 0);
  const leakBase = leakRows.reduce((s, r) => s + num(r[6]), 0);
  const leaked = leakRows.reduce((s, r) => s + num(r[9]) * num(r[6]), 0);
  const flagged = rows.filter((r) => String(r[13] ?? "").trim() !== "").length;
  const kpis: [number, string, Cell, string][] = [
    [5, "TOTAL SPEND", spend, "1D4ED8"],
    [6, "PLATFORM LEADS", leads, "2563EB"],
    [7, "AVG CPL", leads ? Math.round(spend / leads) : null, "0369A1"],
    [8, "CRM LEADS", crm, "047857"],
    [9, "LEAKAGE", leakBase ? leaked / leakBase : null, "0F766E"],
    [10, "APPOINTMENTS", appt, "15803D"],
    [11, "VISITED", visited, "65A30D"],
    [12, "COST / APPT", appt ? Math.round(spend / appt) : null, "7C3AED"],
    [13, "CLIENTS FLAGGED", flagged, "B91C1C"],
  ];
  const lab = b.add("kpiLabel", Array(W).fill(null));
  const val = b.add("kpiValue", Array(W).fill(null));
  b.rows[lab][0] = "PORTFOLIO  ·  LATEST WEEK";
  b.rows[val][0] = `${rows.length} clients  ·  ${withCrm.length} with TeleCRM`;
  b.merge(lab, 0, 5);
  b.merge(val, 0, 5);
  b.style(lab, val + 1, 0, 5, { bg: "0F172A", fg: "FFFFFF", bold: true, v: "middle" });
  b.style(val, val + 1, 0, 5, { size: 11, bold: false });
  for (const [c, label, value, color] of kpis) {
    b.rows[lab][c] = label;
    b.rows[val][c] = value;
    b.style(lab, lab + 1, c, c + 1, { bg: color, fg: "FFFFFF", bold: true, size: 8, h: "center", v: "middle" });
    b.style(val, val + 1, c, c + 1, { bg: color, fg: "FFFFFF", bold: true, size: 15, h: "center", v: "middle", fmt: MENU_COLUMNS[c].fmt });
  }
  b.add("blank");

  b.groupHeader(MENU_GROUPS, MENU_COLUMNS.map((c) => c.label));
  const start = b.rows.length;
  const links: SheetSpec["links"] = [];
  for (const e of entries) {
    const r = b.add("data", e.row);
    if (e.tab) links.push({ r, c: 0, text: String(e.row[0] ?? ""), target: e.tab });
  }
  bodyStyles(b, start, entries.map(() => "data"), rows, MENU_COLUMNS, 1);
  b.style(start, start + entries.length, 0, 1, { fg: THEME.link, bold: true, underline: true });
  b.style(start, start + entries.length, 2, 5, { h: "center" });
  b.style(start, start + entries.length, 13, 14, { fg: THEME.flagText, wrap: true, size: 9 });
  entries.forEach((e, i) => {
    const r = start + i;
    b.style(r, r + 1, 2, 3, e.row[2] === "Yes" ? { fg: THEME.good.fg, bold: true } : { fg: THEME.danger.fg, bold: true });
  });

  return {
    title: "MENU",
    tabColor: "0F172A",
    rows: b.rows,
    kinds: b.kinds,
    widths: MENU_COLUMNS.map((c) => c.width),
    frozenRows: start,
    ops: b.ops,
    merges: b.merges,
    heights: b.heights,
    conditional: [{ r0: start, r1: start + entries.length, c0: 9, c1: 10, gt: 0.3, ...THEME.danger }],
    links,
  };
}

/** Excel / Sheets tab names: ≤31 chars, no []:*?/\ , unique. */
export function tabNames(audits: { name: string }[]): string[] {
  const used = new Set<string>(["menu"]);
  return audits.map((a) => {
    const base = a.name.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Client";
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}
