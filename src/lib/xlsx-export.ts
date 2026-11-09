/**
 * Excel (.xlsx) export utilities — mirrors the pattern in lib/csv.ts.
 * downloadXLSX is browser-only; xlsxBuffer is safe on the server. Uses @e965/xlsx (a maintained SheetJS fork without the
 * prototype-pollution/ReDoS advisories the upstream `xlsx` npm package has).
 */
import * as XLSX from "@e965/xlsx";

export interface XLSXCellColor {
  /** Fill, `#rrggbb`. */
  bg: string;
  /** Text, `#rrggbb`. */
  text: string;
  bold?: boolean;
}

export interface XLSXSheet {
  name: string;
  headers: string[];
  rows: unknown[][];
  /** Optional fills aligned to `rows` (null = uncolored). A sheet with any
   *  color is written through ExcelJS, which supports cell styles; plain
   *  sheets keep the lighter SheetJS path. */
  cellColors?: (XLSXCellColor | null)[][];
}

function hasColors(sheets: XLSXSheet[]): boolean {
  return sheets.some((s) => s.cellColors?.some((row) => row.some(Boolean)));
}

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

async function styledWorkbookBytes(sheets: XLSXSheet[]): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const safeBase = sanitizeSheetName(sheet.name);
    let name = safeBase.slice(0, 31);
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      const base = safeBase.slice(0, 31 - String(suffix).length - 1);
      name = `${base}~${suffix}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    const header = ws.addRow(sheet.headers);
    header.font = { bold: true };
    sheet.rows.forEach((row, ri) => {
      const added = ws.addRow(row.map((v) => (v === undefined ? null : (v as string | number | null))));
      sheet.cellColors?.[ri]?.forEach((color, ci) => {
        if (!color) return;
        const cell = added.getCell(ci + 1);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(color.bg) } };
        cell.font = { color: { argb: argb(color.text) }, bold: color.bold ?? false };
      });
    });
    sheet.headers.forEach((h, i) => {
      ws.getColumn(i + 1).width = Math.min(40, Math.max(10, h.length + 2));
    });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// Excel sheet names may not contain any of : \ / ? * [ ] — panel/report
// titles routinely do (e.g. "Revenue: Q1/Q2"), so strip them before
// truncating/de-duping or book_append_sheet throws and the export silently
// fails with no rows written.
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "").trim();
  return cleaned || "Sheet1";
}

/** Download a multi-sheet .xlsx workbook. Sheet names are sanitized of
 *  Excel-invalid characters, truncated to 31 chars (Excel's hard limit), and
 *  de-duplicated if that causes a collision. */
export async function downloadXLSX(filename: string, sheets: XLSXSheet[]): Promise<void> {
  if (!hasColors(sheets)) {
    XLSX.writeFile(buildWorkbook(sheets), filename);
    return;
  }
  const bytes = await styledWorkbookBytes(sheets);
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** The same workbook as downloadXLSX, as bytes — for server-side callers
 *  (the scheduled-report cron attaches it to an email). */
export async function xlsxBuffer(sheets: XLSXSheet[]): Promise<Buffer> {
  if (!hasColors(sheets)) {
    return XLSX.write(buildWorkbook(sheets), { type: "buffer", bookType: "xlsx" }) as Buffer;
  }
  return Buffer.from(await styledWorkbookBytes(sheets));
}

function buildWorkbook(sheets: XLSXSheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  // Excel sheet names are unique case-INsensitively ("Revenue" and
  // "revenue" collide), so the collision check has to compare lowercased.
  const usedNames = new Set<string>();
  for (const sheet of sheets) {
    const safeBase = sanitizeSheetName(sheet.name);
    let name = safeBase.slice(0, 31);
    let suffix = 2;
    while (usedNames.has(name.toLowerCase())) {
      const base = safeBase.slice(0, 31 - String(suffix).length - 1);
      name = `${base}~${suffix}`;
      suffix += 1;
    }
    usedNames.add(name.toLowerCase());
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}
