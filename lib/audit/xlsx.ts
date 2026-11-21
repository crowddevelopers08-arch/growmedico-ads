import ExcelJS from "exceljs";
import type { ClientAudit } from "./buildAudit";
import {
  THEME, buildClientSpec, buildMenuSpec, fmtDate, menuRow, tabNames, weekBody,
  type ColFormat, type SheetSpec, type Style,
} from "./layout";

const NUM_FMT: Partial<Record<ColFormat, string>> = {
  money: '"₹"#,##0',
  int: "#,##0",
  pct: "0.0%",
};

const argb = (hex: string) => `FF${hex}`;
const thin = { style: "thin" as const, color: { argb: argb(THEME.border) } };

function applyStyle(cell: ExcelJS.Cell, s: Style) {
  if (s.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(s.bg) } };
  if (s.fg || s.bold !== undefined || s.italic !== undefined || s.size || s.underline !== undefined) {
    cell.font = {
      ...cell.font,
      ...(s.fg && { color: { argb: argb(s.fg) } }),
      ...(s.bold !== undefined && { bold: s.bold }),
      ...(s.italic !== undefined && { italic: s.italic }),
      ...(s.size && { size: s.size }),
      ...(s.underline !== undefined && { underline: s.underline }),
    };
  }
  if (s.h || s.v || s.wrap !== undefined) {
    cell.alignment = {
      ...cell.alignment,
      ...(s.h && { horizontal: s.h }),
      ...(s.v && { vertical: s.v === "middle" ? "middle" : "top" }),
      ...(s.wrap !== undefined && { wrapText: s.wrap }),
    };
  }
  if (s.fmt && NUM_FMT[s.fmt]) cell.numFmt = NUM_FMT[s.fmt]!;
  if (s.border) cell.border = { top: thin, bottom: thin, left: thin, right: thin };
}

function renderSpec(wb: ExcelJS.Workbook, spec: SheetSpec) {
  const ws = wb.addWorksheet(spec.title, {
    properties: { tabColor: { argb: argb(spec.tabColor) } },
    views: [{ state: "frozen", ySplit: spec.frozenRows, showGridLines: false }],
  });
  ws.columns = spec.widths.map((w) => ({ width: w }));
  ws.properties.defaultRowHeight = 18;

  spec.rows.forEach((values, r) => {
    const row = ws.getRow(r + 1);
    values.forEach((v, c) => {
      if (v !== null && v !== "") row.getCell(c + 1).value = v;
    });
    const px = spec.heights[r];
    if (px) row.height = Math.round(px * 0.75);
  });

  for (const op of spec.ops) {
    for (let r = op.r0; r < op.r1; r++) {
      for (let c = op.c0; c < op.c1; c++) applyStyle(ws.getCell(r + 1, c + 1), op.style);
    }
  }
  for (const [r0, c0, r1, c1] of spec.merges) ws.mergeCells(r0 + 1, c0 + 1, r1, c1);

  for (const link of spec.links) {
    const cell = ws.getCell(link.r + 1, link.c + 1);
    cell.value = { text: link.text, hyperlink: `#'${link.target.replace(/'/g, "''")}'!A1` };
  }

  for (const rule of spec.conditional) {
    if (rule.r1 <= rule.r0) continue;
    const ref = `${ws.getCell(rule.r0 + 1, rule.c0 + 1).address}:${ws.getCell(rule.r1, rule.c1).address}`;
    ws.addConditionalFormatting({
      ref,
      rules: [{
        type: "cellIs",
        operator: rule.gt !== undefined ? "greaterThan" : "lessThan",
        formulae: [rule.gt ?? rule.lte ?? 0],
        priority: 1,
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: argb(rule.bg) } },
          font: { color: { argb: argb(rule.fg) }, bold: true },
        },
      }],
    });
  }
}

export async function auditToXlsx(audits: ClientAudit[], generatedAt = new Date()): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AdPulse";
  wb.created = generatedAt;

  const names = tabNames(audits);
  const latest = audits.find((a) => a.blocks[0])?.blocks[0];
  const weekLabel = latest ? `${fmtDate(latest.from).slice(0, 6)} – ${fmtDate(latest.to)}` : "";

  renderSpec(wb, buildMenuSpec(audits.map((a, i) => ({ row: menuRow(a, ""), tab: names[i] })), generatedAt, weekLabel));
  audits.forEach((audit, i) => {
    const weeks = audit.blocks.map((b) => weekBody(b));
    renderSpec(wb, buildClientSpec(audit, names[i], i, weeks, generatedAt));
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
