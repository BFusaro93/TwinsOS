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
export function downloadXLSX(filename: string, sheets: XLSXSheet[]): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const sheet of sheets) {
    const safeBase = sanitizeSheetName(sheet.name);
    let name = safeBase.slice(0, 31);
    let suffix = 2;
    while (usedNames.has(name)) {
      const base = safeBase.slice(0, 31 - String(suffix).length - 1);
      name = `${base}~${suffix}`;
      suffix += 1;
    }
    usedNames.add(name);
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}
