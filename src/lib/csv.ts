/**
 * CSV import / export utilities.
 * All functions are client-side only (browser File API / Blob).
 */

/** Escape a single cell value for CSV output */
function escapeCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
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
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];
  const csv = lines.join("\n");
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
  const rows = data.map((row) => headers.map((h) => escapeCell(row[h])).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
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
function parseRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
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
    if (ch === '"') {
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

export function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM (Excel UTF-8 CSVs often start with \uFEFF)
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = splitCSVRows(cleaned);
  if (lines.length < 2) return [];
  const rawHeaders = parseRow(lines[0]).map((h) => h.trim());
  // Deduplicate headers: if "Part Number" appears twice, the second becomes "Part Number (2)"
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return count > 1 ? `${h} (${count})` : h;
  });
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
  });
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
        const text = e.target?.result as string;
        resolve(parseCSV(text));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
