import { shiftYmd } from "@/lib/time/zone";

export type DispatchDateMode =
  | "today" | "past_1" | "past_3" | "past_5" | "next_3" | "next_5" | "next_7" | "this_week" | "next_week";

export const DISPATCH_DATE_PRESETS: { value: DispatchDateMode; label: string }[] = [
  { value: "today",     label: "Today" },
  { value: "past_1",    label: "Past 1 day" },
  { value: "past_3",    label: "Past 3 days" },
  { value: "past_5",    label: "Past 5 days" },
  { value: "next_3",    label: "Next 3 days" },
  { value: "next_5",    label: "Next 5 days" },
  { value: "next_7",    label: "Next 7 days" },
  { value: "this_week", label: "This week" },
  { value: "next_week", label: "Next week" },
];

export function isDispatchDateMode(v: unknown): v is DispatchDateMode {
  return DISPATCH_DATE_PRESETS.some((p) => p.value === v);
}

/**
 * Resolves a relative range against the org's "today" (YYYY-MM-DD). Past/Next
 * ranges are inclusive of today; weeks run Sunday–Saturday, matching the
 * board's week strip. `to` is "" for a single day, like the board's own state.
 */
export function resolveDispatchDateMode(
  mode: DispatchDateMode,
  today: string,
  weekdayOf: (ymd: string) => number | null
): { from: string; to: string } {
  switch (mode) {
    case "today":     return { from: today, to: "" };
    case "past_1":    return { from: shiftYmd(today, -1), to: today };
    case "past_3":    return { from: shiftYmd(today, -3), to: today };
    case "past_5":    return { from: shiftYmd(today, -5), to: today };
    case "next_3":    return { from: today, to: shiftYmd(today, 3) };
    case "next_5":    return { from: today, to: shiftYmd(today, 5) };
    case "next_7":    return { from: today, to: shiftYmd(today, 7) };
    case "this_week":
    case "next_week": {
      const sunday = shiftYmd(today, -(weekdayOf(today) ?? 0) + (mode === "next_week" ? 7 : 0));
      return { from: sunday, to: shiftYmd(sunday, 6) };
    }
  }
}
