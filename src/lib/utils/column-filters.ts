/**
 * Value encodings for the list pages' column filters. Each list keeps one
 * `filterValue` string, so range/amount filters are packed into it rather than
 * needing their own state.
 */

/** "YYYY-MM-DD..YYYY-MM-DD"; either side may be empty. */
export function encodeDateRange(from: string, to: string): string {
  return from || to ? `${from}..${to}` : "";
}

export function parseDateRange(value: string): { from: string; to: string } {
  const [from = "", to = ""] = value.split("..");
  return { from, to };
}

/** Inclusive; an empty range matches everything, an undated row matches nothing. */
export function inDateRange(date: string | null | undefined, value: string): boolean {
  const { from, to } = parseDateRange(value);
  if (!from && !to) return true;
  const d = (date ?? "").slice(0, 10);
  return !!d && (!from || d >= from) && (!to || d <= to);
}

export type AmountOp = ">=" | "<=" | "=";

/** "<op>:<dollars>", e.g. ">=:100". */
export function encodeAmountFilter(op: AmountOp, dollars: string): string {
  return dollars.trim() === "" ? "" : `${op}:${dollars}`;
}

export function parseAmountFilter(value: string): { op: AmountOp; dollars: string } {
  const i = value.indexOf(":");
  if (i < 0) return { op: ">=", dollars: "" };
  const op = value.slice(0, i);
  return { op: (op === "<=" || op === "=" ? op : ">=") as AmountOp, dollars: value.slice(i + 1) };
}

/** Compares cents against the dollar amount typed in the filter. */
export function matchesAmount(cents: number, value: string): boolean {
  const { op, dollars } = parseAmountFilter(value);
  const target = Math.round(parseFloat(dollars) * 100);
  if (!Number.isFinite(target)) return true;
  if (op === "<=") return cents <= target;
  if (op === "=") return cents === target;
  return cents >= target;
}
