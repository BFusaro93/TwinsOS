export type SpendRange = "6m" | "12m" | "all";

export const SPEND_RANGE_OPTIONS: { key: SpendRange; label: string }[] = [
  { key: "6m", label: "Last 6 months" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
];

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Earliest "YYYY-MM" month inside the range (the current month counts as 1), or null for all time. */
export function rangeCutoffKey(range: SpendRange, now: Date = new Date()): string | null {
  if (range === "all") return null;
  const months = range === "6m" ? 6 : 12;
  return monthKeyOf(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
}

/** Month buckets (oldest → newest) for a trend chart; "all" spans back to `earliestKey`, minimum 6 months. */
export function rangeMonths(
  range: SpendRange,
  earliestKey: string | null,
  now: Date = new Date()
): { key: string; label: string }[] {
  let count = range === "6m" ? 6 : 12;
  if (range === "all") {
    if (earliestKey) {
      const [y, m] = earliestKey.split("-").map(Number);
      count = Math.max(6, (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) + 1);
    } else {
      count = 6;
    }
  }
  const months: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKeyOf(d), label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }) });
  }
  return months;
}
