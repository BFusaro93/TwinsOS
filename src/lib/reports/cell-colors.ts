import { FORMAT_COLORS } from "@/types/crm-reports";
import type { FormatRule, ReportColumnDef, ReportResult, ReportResultRow } from "@/types/crm-reports";

// ============================================================
// Cell colors for report tables — conditional-format rules and the
// continuous color spectrum. One resolver shared by the on-screen table
// and by every export (Excel, PDF, scheduled sends), so a cell is the same
// color wherever it's read. Pure functions; colors are 6-digit hex.
// ============================================================

export interface CellColor {
  /** Fill, `#rrggbb`. */
  bg: string;
  /** Text, `#rrggbb`. */
  text: string;
  /** Rule matches are bold; spectrum shading is not. */
  bold?: boolean;
}

/** First matching rule wins (rules are checked in order). */
export function matchFormatRule(
  value: unknown,
  column: string,
  rules: FormatRule[] | undefined
): CellColor | null {
  if (!rules || rules.length === 0 || typeof value !== "number") return null;
  for (const rule of rules) {
    if (rule.column !== column) continue;
    const matches =
      rule.op === "gt" ? value > rule.value :
      rule.op === "gte" ? value >= rule.value :
      rule.op === "lt" ? value < rule.value :
      rule.op === "lte" ? value <= rule.value :
      rule.op === "eq" ? value === rule.value :
      value !== rule.value;
    if (matches) {
      const color = FORMAT_COLORS.find((c) => c.value === rule.color);
      if (color) return { bg: color.bg, text: color.text, bold: true };
    }
  }
  return null;
}

/** One min/max per requested column across the FULL result set, so the scale
 *  stays consistent as the user pages (and matches the export). */
export function computeSpectrumRanges(
  rows: ReportResultRow[],
  columns: string[] | undefined
): Record<string, { min: number; max: number }> {
  const ranges: Record<string, { min: number; max: number }> = {};
  if (!columns || columns.length === 0) return ranges;
  for (const key of columns) {
    let min = Infinity;
    let max = -Infinity;
    for (const row of rows) {
      const v = row[key];
      if (typeof v === "number") {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min !== Infinity) ranges[key] = { min, max };
  }
  return ranges;
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** Light-to-dark blue by where the value sits in its column's range. */
export function spectrumColorFor(value: number, range: { min: number; max: number }): CellColor {
  const t = range.max === range.min ? 0.5 : (value - range.min) / (range.max - range.min);
  const clamped = Math.min(1, Math.max(0, t));
  const lightness = 92 - clamped * 52; // 92% (near white, low) -> 40% (dark blue, high)
  return {
    bg: hslToHex(217, 70, lightness),
    text: lightness < 55 ? "#ffffff" : "#1e3a5f",
  };
}

/** The color for one cell: a rule match wins over spectrum shading. */
export function cellColorFor(
  value: unknown,
  column: string,
  rules: FormatRule[] | undefined,
  spectrumRanges: Record<string, { min: number; max: number }>
): CellColor | null {
  const rule = matchFormatRule(value, column, rules);
  if (rule) return rule;
  const range = spectrumRanges[column];
  if (range && typeof value === "number") return spectrumColorFor(value, range);
  return null;
}

/** A color grid aligned to `rows` x `columns` (null = no color), or undefined
 *  when nothing would be colored — so callers can skip the styled export path. */
export function buildCellColors(
  rows: ReportResultRow[],
  columns: Pick<ReportColumnDef, "key">[],
  rules: FormatRule[] | undefined,
  spectrumColumns: string[] | undefined
): (CellColor | null)[][] | undefined {
  const hasRules = (rules ?? []).length > 0;
  const ranges = computeSpectrumRanges(rows, spectrumColumns);
  if (!hasRules && Object.keys(ranges).length === 0) return undefined;
  let any = false;
  const grid = rows.map((row) =>
    columns.map((c) => {
      const color = cellColorFor(row[c.key], c.key, rules, ranges);
      if (color) any = true;
      return color;
    })
  );
  return any ? grid : undefined;
}

/** Same as buildCellColors for a whole result. */
export function resultCellColors(
  result: ReportResult,
  rules: FormatRule[] | undefined,
  spectrumColumns: string[] | undefined
): (CellColor | null)[][] | undefined {
  return buildCellColors(result.rows, result.columns, rules, spectrumColumns);
}
