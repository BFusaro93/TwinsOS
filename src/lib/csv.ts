/**
 * CSV import / export utilities.
 * All functions are client-side only (browser File API / Blob).
 */

/** A single row that failed during a bulk CSV import, with enough context to
 *  act on it (which row, and why). `row` is 1-based within the batch of rows
 *  handed to the importer (i.e. the preview table's row numbering). */
export interface BulkImportRowError {
  row: number;
  error: string;
}

/**
 * Standard return shape for a `useBulkImport*` mutation: rather than
 * aborting the whole batch on the first bad row, each hook processes every
 * row and reports which ones succeeded vs. failed (with a reason) here.
 * `ImportExportMenu` renders this directly when a hook returns it.
 */
export interface BulkImportResult {
  succeeded: number;
  failed: BulkImportRowError[];
  /** Rows deliberately not imported because they match an existing record
   *  (duplicates). Not errors; reported separately from `failed`. */
  skipped?: BulkImportRowError[];
}

/** Type guard: does an `onImport` return value look like a `BulkImportResult`? */
export function isBulkImportResult(value: unknown): value is BulkImportResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as BulkImportResult).succeeded === "number" &&
    Array.isArray((value as BulkImportResult).failed)
  );
}

/** One-line summary of a partial import (first 5 failed rows) for dialogs without a details list. */
export function summarizeImportFailures(result: BulkImportResult): string {
  const shown = result.failed.slice(0, 5).map((f) => `Row ${f.row}: ${f.error}`).join(" | ");
  const more = result.failed.length > 5 ? ` (+${result.failed.length - 5} more)` : "";
  const skippedNote = result.skipped?.length ? `, ${result.skipped.length} skipped as duplicates` : "";
  return `${result.succeeded} imported, ${result.failed.length} failed${skippedNote}. ${shown}${more}`;
}

// Leading characters a spreadsheet (Excel, Sheets, LibreOffice) treats as the
// start of a formula / DDE command. Tab and CR are included because some
// apps strip them and then evaluate what follows.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// Plain numbers ("-12.50", "+3") are left alone so negative amounts still
// export as numbers — a bare numeric literal can't carry a formula.
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Escape a single cell value for CSV output (EXPORT only — import parsing is
 * untouched). Neutralizes CSV/formula injection per OWASP by prefixing a
 * single quote to text that starts with = + - @ TAB or CR, so a client name
 * like `=HYPERLINK(...)` submitted through a public form can't execute when
 * staff open the export in a spreadsheet.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (typeof val !== "number" && FORMULA_TRIGGER.test(str) && !PLAIN_NUMBER.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Download a CSV file from explicit headers and row arrays.
 * Fields containing commas, quotes, or newlines are properly escaped.
 */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: unknown[][],
): void {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download an array of records as a CSV file.
 * Column order follows the keys of the first record.
 */
export function exportCSV(data: Record<string, unknown>[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(","));
  const csv = "\uFEFF" + [headers.map(escapeCsvCell).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download an empty CSV file containing only the header row.
 * Useful as an import template for users.
 */
export function exportCSVTemplate(columns: string[], filename: string): void {
  const csv = columns.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parse a single CSV row, handling quoted fields with embedded commas and quotes */
function parseRow(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && (inQuotes || current === "")) {
      // A quote only opens a quoted field at the START of a field; mid-field it is a
      // literal (e.g. an unquoted `12" hose`), so it can't swallow the rest of the row.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parse a CSV string into an array of row objects keyed by the header row.
 * Returns an empty array if the text has fewer than 2 rows.
 */
/**
 * Split CSV text into logical rows, handling quoted fields that contain newlines.
 * A line break inside a quoted field does NOT start a new row.
 */
function splitCSVRows(text: string): string[] {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const atFieldStart = current === "" || /[,;\t]$/.test(current);
    if (ch === '"' && (inQuotes || atFieldStart)) {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      // Skip \n after \r (CRLF)
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim()) rows.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) rows.push(current);
  return rows;
}

/**
 * Inverse of the export-side formula guard: drop the single leading `'` that
 * escapeCsvCell adds, but only when what follows starts with = + - @. A
 * legitimate leading apostrophe (e.g. "'Tis") is left untouched.
 */
function unescapeCsvCell(val: string): string {
  return /^'[=+\-@]/.test(val) ? val.slice(1) : val;
}

/**
 * Pick the delimiter (comma, semicolon or tab) from the header row by
 * counting unquoted occurrences of each; ties and no-delimiter headers fall
 * back to comma so existing comma files behave exactly as before.
 */
function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  let best = ",";
  for (const d of [";", "\t"]) if (counts[d] > counts[best]) best = d;
  return best;
}

export function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM (Excel UTF-8 CSVs often start with \uFEFF)
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = splitCSVRows(cleaned);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseRow(lines[0], delimiter).map((h) => h.trim());
  // Deduplicate headers: if "Part Number" appears twice, the second becomes "Part Number (2)"
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return count > 1 ? `${h} (${count})` : h;
  });
  return lines
    .slice(1)
    .map((line) => parseRow(line, delimiter))
    // Spreadsheet exports pad the sheet with rows of bare delimiters (",,,,").
    // They pass the non-blank-line check in splitCSVRows, so each one used to
    // reach the importer as an empty record and be reported as a failed row
    // ("Missing required field") or, for importers with no required field,
    // create an empty record.
    .filter((values) => values.some((v) => v.trim() !== ""))
    .map((values) => Object.fromEntries(headers.map((h, i) => [h, unescapeCsvCell((values[i] ?? "").trim())])));
}

/**
 * Decode raw file bytes to text. UTF-8 (with or without BOM) is tried first in
 * strict mode; a file that is not valid UTF-8 is what "CSV (Comma delimited)"
 * saved by Windows Excel produces (Windows-1252), so fall back to that rather
 * than turning every accented letter / smart quote into U+FFFD. UTF-16 files
 * ("Unicode Text") are detected by their BOM.
 */
export function decodeCsvBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Dollar cell -> integer cents. Strips "$", thousands separators and spaces
 * ("$1,250.50" -> 125050): parseFloat("1,250.50") is 1, which silently imported
 * a $1.00 cost. Returns null for a blank cell and NaN for content that is not
 * a number, so callers can fail the row instead of storing a corrupt amount.
 */
export function parseCsvDollarsToCents(raw: string | null | undefined): number | null {
  const cleaned = (raw ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/**
 * Read a File object as text and parse it as CSV.
 * Returns a Promise resolving to the parsed rows.
 */
export function readCSVFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseCSV(decodeCsvBytes(e.target?.result as ArrayBuffer)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}
