/**
 * Excel (.xlsx) export utilities — client-side only, mirrors the pattern in
 * lib/csv.ts. Uses @e965/xlsx (a maintained SheetJS fork without the
 * prototype-pollution/ReDoS advisories the upstream `xlsx` npm package has).
 */
import * as XLSX from "@e965/xlsx";

export interface XLSXSheet {
  name: string;
  headers: string[];
  rows: unknown[][];
}

/** Download a multi-sheet .xlsx workbook. Sheet names are truncated to 31
 *  chars (Excel's hard limit) and de-duplicated if that causes a collision. */
export function downloadXLSX(filename: string, sheets: XLSXSheet[]): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const sheet of sheets) {
    let name = (sheet.name || "Sheet1").slice(0, 31);
    let suffix = 2;
    while (usedNames.has(name)) {
      const base = sheet.name.slice(0, 31 - String(suffix).length - 1);
      name = `${base}~${suffix}`;
      suffix += 1;
    }
    usedNames.add(name);
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}
