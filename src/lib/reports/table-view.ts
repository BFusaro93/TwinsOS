import type { ReportColumnDef, ReportFieldType, ReportResultRow } from "@/types/crm-reports";

// ============================================================
// Display-only view state for a rendered report table — the
// per-column header menu (sort / filter / hide / format / merge).
// Everything here operates on the rows already loaded in the
// browser; it never re-queries and never changes exports.
// ============================================================

export type ViewFilterOp =
  | "contains"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "empty"
  | "not_empty";

export interface ViewFilter {
  op: ViewFilterOp;
  value: string;
}

export type ViewAlign = "left" | "center" | "right";

/** A cell-number format a user picked from the header menu. "default" = the
 *  column's own type formatting. */
export type ViewNumberFormat = "default" | "number" | "currency" | "percent" | "boolean" | "timespan";

export interface ViewColumnFormat {
  align?: ViewAlign;
  number?: ViewNumberFormat;
  /** Continuous magnitude shading (same look as the report-level spectrum). */
  spectrum?: boolean;
  /** Proportional bar behind the number. */
  bars?: boolean;
}

export interface TableViewState {
  sort: { key: string; dir: "asc" | "desc" } | null;
  filters: Record<string, ViewFilter>;
  hidden: string[];
  formats: Record<string, ViewColumnFormat>;
  /** Columns whose repeated values show once (consecutive duplicates blanked). */
  merged: string[];
}

export const EMPTY_VIEW: TableViewState = {
  sort: null,
  filters: {},
  hidden: [],
  formats: {},
  merged: [],
};

export function isViewActive(v: TableViewState): boolean {
  return (
    v.sort !== null ||
    v.hidden.length > 0 ||
    v.merged.length > 0 ||
    Object.keys(v.filters).length > 0 ||
    Object.keys(v.formats).length > 0
  );
}

const NUMERIC: ReportFieldType[] = ["money", "number", "hours", "percent", "bps"];

export function isNumericType(type: ReportFieldType): boolean {
  return NUMERIC.includes(type);
}

/** Filter operators that make sense for a column of this type. */
export function filterOpsFor(type: ReportFieldType): { value: ViewFilterOp; label: string }[] {
  const empties = [
    { value: "empty" as const, label: "is empty" },
    { value: "not_empty" as const, label: "is not empty" },
  ];
  if (isNumericType(type) || type === "date" || type === "datetime") {
    return [
      { value: "eq", label: "equals" },
      { value: "neq", label: "not equals" },
      { value: "gt", label: "greater than" },
      { value: "gte", label: "at least" },
      { value: "lt", label: "less than" },
      { value: "lte", label: "at most" },
      ...empties,
    ];
  }
  if (type === "boolean") {
    return [{ value: "eq", label: "is" }, ...empties];
  }
  return [
    { value: "contains", label: "contains" },
    { value: "eq", label: "equals" },
    { value: "neq", label: "not equals" },
    ...empties,
  ];
}

/** The numeric value a typed filter input stands for, in the column's stored
 *  unit (money is typed in dollars, stored in cents; bps is typed as a percent). */
function typedNumber(input: string, type: ReportFieldType): number | null {
  const n = parseFloat(input);
  if (!Number.isFinite(n)) return null;
  if (type === "money") return Math.round(n * 100);
  if (type === "bps") return Math.round(n * 100);
  return n;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function matchesFilter(value: unknown, col: ReportColumnDef, filter: ViewFilter): boolean {
  if (filter.op === "empty") return isBlank(value);
  if (filter.op === "not_empty") return !isBlank(value);
  if (filter.value.trim() === "") return true; // nothing typed yet — don't hide everything
  if (isBlank(value)) return filter.op === "neq";

  if (isNumericType(col.type)) {
    const target = typedNumber(filter.value, col.type);
    if (target === null) return true;
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    // Money/hours/percent cells show 1–2 decimals; compare at the shown precision
    // so "= 12.50" matches a stored 12.5 and not just a float-exact value.
    const eps = col.type === "money" || col.type === "bps" ? 0.5 : 0.005;
    switch (filter.op) {
      case "eq":
        return Math.abs(n - target) < eps;
      case "neq":
        return Math.abs(n - target) >= eps;
      case "gt":
        return n > target;
      case "gte":
        return n >= target - eps;
      case "lt":
        return n < target;
      case "lte":
        return n <= target + eps;
      default:
        return true;
    }
  }

  if (col.type === "date" || col.type === "datetime") {
    // ISO strings sort lexicographically; compare on the date part.
    const day = String(value).slice(0, 10);
    const target = filter.value.slice(0, 10);
    switch (filter.op) {
      case "eq":
        return day === target;
      case "neq":
        return day !== target;
      case "gt":
        return day > target;
      case "gte":
        return day >= target;
      case "lt":
        return day < target;
      case "lte":
        return day <= target;
      default:
        return true;
    }
  }

  if (col.type === "boolean") {
    const bool = value === true || value === "true";
    const want = filter.value === "true";
    return filter.op === "eq" ? bool === want : true;
  }

  const hay = String(value).toLowerCase();
  const needle = filter.value.trim().toLowerCase();
  switch (filter.op) {
    case "contains":
      return hay.includes(needle);
    case "eq":
      return hay === needle;
    case "neq":
      return hay !== needle;
    default:
      return true;
  }
}

/** Apply the view's filters, then its sort, to the loaded rows. */
export function applyRowView(
  rows: ReportResultRow[],
  columns: ReportColumnDef[],
  view: TableViewState,
  /** Subtotal mode relies on rows staying grouped by section, so a header sort
   *  would tear the groups apart — it's ignored there. */
  allowSort: boolean
): ReportResultRow[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  let out = rows;
  const active = Object.entries(view.filters).filter(([key]) => byKey.has(key));
  if (active.length > 0) {
    out = out.filter((row) =>
      active.every(([key, f]) => matchesFilter(row[key], byKey.get(key)!, f))
    );
  }
  if (allowSort && view.sort && byKey.has(view.sort.key)) {
    const { key, dir } = view.sort;
    const sign = dir === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const aBlank = isBlank(av);
      const bBlank = isBlank(bv);
      if (aBlank && bBlank) return 0;
      if (aBlank) return 1; // blanks last in both directions
      if (bBlank) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return sign * cmp;
    });
  }
  return out;
}

/** Cell text after a user-picked number format. Returns null when the format
 *  doesn't apply to this value, so the caller falls back to the type's own. */
export function formatWithView(value: unknown, col: ReportColumnDef, fmt: ViewNumberFormat | undefined): string | null {
  if (!fmt || fmt === "default") return null;
  if (isBlank(value)) return "—";
  if (fmt === "boolean") {
    if (typeof value === "boolean") return value ? "True" : "False";
    const n = Number(value);
    if (Number.isFinite(n)) return n !== 0 ? "True" : "False";
    return value === "true" ? "True" : "False";
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Stored units → display units: money/bps are cents/basis points.
  const display = col.type === "money" ? n / 100 : col.type === "bps" ? n / 100 : n;
  switch (fmt) {
    case "number":
      return display.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "currency":
      return display.toLocaleString("en-US", { style: "currency", currency: "USD" });
    case "percent":
      return `${display.toFixed(1)}%`;
    case "timespan": {
      // hours columns are in hours; any other number is read as minutes.
      const totalMinutes = Math.round(col.type === "hours" ? display * 60 : display);
      const sign = totalMinutes < 0 ? "-" : "";
      const abs = Math.abs(totalMinutes);
      return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
    }
    default:
      return null;
  }
}

/** Min/max per column across the full filtered set, for bar gauges. */
export function numericRange(rows: ReportResultRow[], key: string): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return min === Infinity ? null : { min, max };
}
