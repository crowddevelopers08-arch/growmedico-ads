/**
 * Writes the audit into a Google Sheet in the standard, styled layout.
 *
 * Safe to run every week:
 *   • weeks in this run are (re)written; older weeks already in the tab are kept;
 *   • the team's Notes / Action cells and MENU "Media Buyer" are carried over;
 *   • blocks in any other (hand-made) layout are never copied into the new tabs.
 */

import {
  a1, batchClearValues, batchGetValues, batchUpdate, batchUpdateValues, getSheets, type SheetProps,
} from "@/lib/googleSheets";
import type { ClientAudit } from "./buildAudit";
import {
  ACTION_COL, LOG_COLUMNS, LOG_HEADER_LABEL, LOG_WIDTH, MENU_BUYER_COL, MENU_COLUMNS, MENU_HEADER_LABEL, NOTES_COL,
  THEME, buildClientSpec, buildMenuSpec, fmtDate, menuRow, rowKey, tabNames, weekBody,
  type Cell, type ColFormat, type SheetSpec, type Style, type WeekBody,
} from "./layout";

const DATE_TEXT = /^\d{2} [A-Za-z]{3} \d{4}$/;
const REQUEST_CHUNK = 1500;

const rgb = (hex: string) => ({
  red: parseInt(hex.slice(0, 2), 16) / 255,
  green: parseInt(hex.slice(2, 4), 16) / 255,
  blue: parseInt(hex.slice(4, 6), 16) / 255,
});
const NUMBER_FORMAT: Partial<Record<ColFormat, { type: string; pattern: string }>> = {
  money: { type: "NUMBER", pattern: "₹#,##0" },
  int: { type: "NUMBER", pattern: "#,##0" },
  pct: { type: "PERCENT", pattern: "0.0%" },
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

// ── Reading back what's already in the sheet ────────────────

interface ParsedTab {
  notes: Map<string, [string, string]>;
  weeks: WeekBody[];
}

/** Read back a client tab written in our layout: team notes + every week block. */
export function parseTab(values: unknown[][]): ParsedTab {
  const notes = new Map<string, [string, string]>();
  const weeks: WeekBody[] = [];
  const headerLabels = LOG_COLUMNS.map((c) => c.label);
  let current: WeekBody | null = null;

  for (const raw of values) {
    const row = raw.map((v) => (v === "" ? null : (v as Cell)));
    const first = str(row[0]);
    if (first === LOG_HEADER_LABEL) {
      const ours = headerLabels.every((l, i) => str(row[i]) === l);
      current = ours ? { from: "", to: "", rows: [], kinds: [] } : null;
      if (current) weeks.push(current);
      continue;
    }
    if (!current || !DATE_TEXT.test(first)) {
      if (!row.some((v) => str(v).trim() !== "")) current = null;
      continue;
    }
    current.rows.push(Array.from({ length: LOG_WIDTH }, (_, i) => row[i] ?? null));
    current.kinds.push(str(row[3]) === "Total" ? "total" : "data");
    if (!current.from) {
      current.from = first;
      current.to = str(row[1]);
    }
    const n = str(row[NOTES_COL]);
    const a = str(row[ACTION_COL]);
    if (n || a) notes.set(rowKey({ from: first, to: str(row[1]), channel: str(row[2]), campaign: str(row[3]) }), [n, a]);
  }
  return { notes, weeks: weeks.filter((w) => w.rows.length > 0) };
}

/** MENU rows below its header, keyed by client name. */
function parseMenu(values: unknown[][]) {
  const out = new Map<string, unknown[]>();
  const h = values.findIndex((r) => str(r[0]) === MENU_HEADER_LABEL);
  if (h < 0) return out;
  for (const r of values.slice(h + 1)) if (str(r[0]).trim()) out.set(str(r[0]).trim().toLowerCase(), r);
  return out;
}

// ── Spec → Sheets API requests ──────────────────────────────

function cellFormat(s: Style): { format: Record<string, unknown>; fields: string[] } {
  const format: Record<string, unknown> = {};
  const fields: string[] = [];
  const text: Record<string, unknown> = {};
  if (s.bg) { format.backgroundColor = rgb(s.bg); fields.push("backgroundColor"); }
  if (s.fg) { text.foregroundColor = rgb(s.fg); fields.push("textFormat.foregroundColor"); }
  if (s.bold !== undefined) { text.bold = s.bold; fields.push("textFormat.bold"); }
  if (s.italic !== undefined) { text.italic = s.italic; fields.push("textFormat.italic"); }
  if (s.underline !== undefined) { text.underline = s.underline; fields.push("textFormat.underline"); }
  if (s.size) { text.fontSize = s.size; fields.push("textFormat.fontSize"); }
  if (Object.keys(text).length) format.textFormat = text;
  if (s.h) { format.horizontalAlignment = s.h.toUpperCase(); fields.push("horizontalAlignment"); }
  if (s.v) { format.verticalAlignment = s.v === "middle" ? "MIDDLE" : "TOP"; fields.push("verticalAlignment"); }
  if (s.wrap !== undefined) { format.wrapStrategy = s.wrap ? "WRAP" : "OVERFLOW_CELL"; fields.push("wrapStrategy"); }
  if (s.fmt && NUMBER_FORMAT[s.fmt]) { format.numberFormat = NUMBER_FORMAT[s.fmt]; fields.push("numberFormat"); }
  return { format, fields: fields.map((f) => `userEnteredFormat.${f}`) };
}

/** Requests that reset a tab before rewriting (size, freeze, gridlines, merges, old rules). */
function resetRequests(sheet: SheetProps, spec: SheetSpec, existingRules: number): object[] {
  const reqs: object[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheet.sheetId,
          tabColorStyle: { rgbColor: rgb(spec.tabColor) },
          gridProperties: {
            rowCount: Math.max(1000, spec.rows.length + 100),
            columnCount: Math.max(26, spec.widths.length),
            frozenRowCount: spec.frozenRows,
            frozenColumnCount: 0,
            hideGridlines: true,
          },
        },
        fields: "tabColorStyle,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount,hideGridlines)",
      },
    },
    { unmergeCells: { range: { sheetId: sheet.sheetId } } },
  ];
  for (let i = 0; i < existingRules; i++) reqs.push({ deleteConditionalFormatRule: { sheetId: sheet.sheetId, index: 0 } });
  return reqs;
}

function styleRequests(sheetId: number, spec: SheetSpec): object[] {
  const range = (r0: number, r1: number, c0: number, c1: number) => ({
    sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1,
  });
  const reqs: object[] = [
    { repeatCell: { range: { sheetId }, cell: { userEnteredFormat: { textFormat: { fontFamily: "Roboto", fontSize: 10 }, verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat" } },
    { updateBorders: { range: range(0, Math.max(1000, spec.rows.length + 100), 0, Math.max(26, spec.widths.length)), top: { style: "NONE" }, bottom: { style: "NONE" }, left: { style: "NONE" }, right: { style: "NONE" }, innerHorizontal: { style: "NONE" }, innerVertical: { style: "NONE" } } },
    { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: spec.rows.length }, properties: { pixelSize: 22 }, fields: "pixelSize" } },
  ];
  spec.widths.forEach((w, i) =>
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: Math.round(w * 7.5) }, fields: "pixelSize" } })
  );
  for (const [r, px] of Object.entries(spec.heights)) {
    const i = Number(r);
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: "pixelSize" } });
  }

  const border = { style: "SOLID", color: rgb(THEME.border) };
  for (const op of spec.ops) {
    const { format, fields } = cellFormat(op.style);
    if (fields.length) reqs.push({ repeatCell: { range: range(op.r0, op.r1, op.c0, op.c1), cell: { userEnteredFormat: format }, fields: fields.join(",") } });
    if (op.style.border) {
      reqs.push({ updateBorders: { range: range(op.r0, op.r1, op.c0, op.c1), top: border, bottom: border, left: border, right: border, innerHorizontal: border, innerVertical: border } });
    }
  }
  for (const [r0, c0, r1, c1] of spec.merges) reqs.push({ mergeCells: { range: range(r0, r1, c0, c1), mergeType: "MERGE_ALL" } });

  for (const rule of spec.conditional) {
    if (rule.r1 <= rule.r0) continue;
    reqs.push({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [range(rule.r0, rule.r1, rule.c0, rule.c1)],
          booleanRule: {
            condition: rule.gt !== undefined
              ? { type: "NUMBER_GREATER", values: [{ userEnteredValue: String(rule.gt) }] }
              : { type: "NUMBER_LESS_THAN_EQ", values: [{ userEnteredValue: String(rule.lte ?? 0) }] },
            format: { backgroundColor: rgb(rule.bg), textFormat: { foregroundColor: rgb(rule.fg), bold: true } },
          },
        },
      },
    });
  }
  return reqs;
}

// ── Main ────────────────────────────────────────────────────

export interface SheetPushResult {
  spreadsheetTitle: string;
  tabsWritten: number;
  weeksWritten: number;
  notesKept: number;
}

export async function pushAuditToSheet(spreadsheetId: string, audits: ClientAudit[], generatedAt = new Date()): Promise<SheetPushResult> {
  const { title, sheets } = await getSheets(spreadsheetId);
  const byTitle = new Map(sheets.map((s) => [s.title.toLowerCase(), s]));
  const names = tabNames(audits);

  // 1. Make sure MENU + every client tab exists
  const wanted = ["MENU", ...names];
  const missing = wanted.filter((t) => !byTitle.has(t.toLowerCase()));
  if (missing.length) {
    const res = await batchUpdate(
      spreadsheetId,
      missing.map((t) => ({ addSheet: { properties: { title: t, ...(t === "MENU" ? { index: 0 } : {}), gridProperties: { rowCount: 1000, columnCount: 26 } } } }))
    );
    for (const r of res.replies) if (r.addSheet) byTitle.set(r.addSheet.properties.title.toLowerCase(), { ...r.addSheet.properties, conditionalRules: 0 });
  }
  const sheetOf = (t: string) => byTitle.get(t.toLowerCase()) as SheetProps;

  // 2. Read what's there now (to keep notes, older weeks and Media Buyer)
  const existing = await batchGetValues(spreadsheetId, wanted.map((t) => a1(t)));
  const oldMenu = parseMenu(existing[0] ?? []);

  const specs: SheetSpec[] = [];
  let weeksWritten = 0;
  let notesKept = 0;

  audits.forEach((audit, i) => {
    const parsed = parseTab(existing[i + 1] ?? []);
    const fresh = audit.blocks.map((b) => weekBody(b, parsed.notes));
    const freshKeys = new Set(fresh.map((w) => `${w.from}|${w.to}`));
    const kept = parsed.weeks.filter((w) => !freshKeys.has(`${w.from}|${w.to}`));
    weeksWritten += fresh.length;
    for (const w of fresh) for (const r of w.rows) if (str(r[NOTES_COL]) || str(r[ACTION_COL])) notesKept++;
    specs.push(buildClientSpec(audit, names[i], i, [...fresh, ...kept], generatedAt));
  });

  // 3. MENU — keep Media Buyer, and rows for clients not in this run
  const entries = new Map<string, { row: Cell[]; tab: string | null }>();
  audits.forEach((a, i) => {
    const buyer = str(oldMenu.get(a.name.trim().toLowerCase())?.[MENU_BUYER_COL]);
    entries.set(a.name.trim().toLowerCase(), { row: menuRow(a, buyer), tab: names[i] });
  });
  for (const [k, r] of oldMenu) {
    if (entries.has(k)) continue;
    const tab = tabNames([{ name: str(r[0]) }])[0];
    entries.set(k, {
      row: Array.from({ length: MENU_COLUMNS.length }, (_, j) => (r[j] ?? null) as Cell),
      tab: byTitle.has(tab.toLowerCase()) ? tab : null,
    });
  }
  const latest = audits.find((a) => a.blocks[0])?.blocks[0];
  const weekLabel = latest ? `${fmtDate(latest.from).slice(0, 6)} – ${fmtDate(latest.to)}` : "";
  const menuSpec = buildMenuSpec(
    [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, e]) => e),
    generatedAt,
    weekLabel
  );
  specs.unshift(menuSpec);

  // 4. Write: reset → clear → values → links → styles
  const ruleCounts = await conditionalRuleCounts(spreadsheetId);
  await batchUpdate(spreadsheetId, specs.flatMap((s) => resetRequests(sheetOf(s.title), s, ruleCounts.get(sheetOf(s.title).sheetId) ?? 0)));
  await batchClearValues(spreadsheetId, specs.map((s) => a1(s.title)));
  await batchUpdateValues(
    spreadsheetId,
    specs.map((s) => ({ range: a1(s.title, "A1"), values: s.rows.map((r) => r.map((v) => (v === null ? "" : v))) })),
    "RAW"
  );
  const linkData = specs.flatMap((s) =>
    s.links.map((l) => {
      const target = byTitle.get(l.target.toLowerCase());
      const col = String.fromCharCode(65 + l.c);
      const formula = target ? `=HYPERLINK("#gid=${target.sheetId}","${l.text.replace(/"/g, '""')}")` : l.text;
      return { range: a1(s.title, `${col}${l.r + 1}`), values: [[formula]] };
    })
  );
  await batchUpdateValues(spreadsheetId, linkData, "USER_ENTERED");

  const styleReqs = specs.flatMap((s) => styleRequests(sheetOf(s.title).sheetId, s));
  for (let i = 0; i < styleReqs.length; i += REQUEST_CHUNK) {
    await batchUpdate(spreadsheetId, styleReqs.slice(i, i + REQUEST_CHUNK));
  }

  return { spreadsheetTitle: title, tabsWritten: audits.length, weeksWritten, notesKept };
}

async function conditionalRuleCounts(spreadsheetId: string): Promise<Map<number, number>> {
  const { sheets } = await getSheets(spreadsheetId, true);
  return new Map(sheets.map((s) => [s.sheetId, s.conditionalRules ?? 0]));
}
