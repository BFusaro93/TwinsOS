/** Parses a typed quantity; anything that isn't a positive number (blank, 0, negative, NaN) falls back to 1. */
export function parsePositiveQty(value: string | number): number {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
