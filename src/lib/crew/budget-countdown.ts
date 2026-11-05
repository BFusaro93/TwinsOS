/**
 * Time left against a stop's budgeted hours, for the running-job timer (SA's
 * Team app counts down from the visit's budget instead of only counting up).
 *
 * Budgeted hours are per crew member, and a crew works a stop side by side, so
 * the budget is a wall-clock allowance: the sum of the stop's live services'
 * budgeted hours. Time already spent on breaks (breakMinutes) doesn't count
 * against it. Returns null when nothing is budgeted — the caller then shows the
 * plain elapsed timer, as SA does.
 */
export interface BudgetCountdown {
  /** Minutes left; negative once over budget. */
  remainingMinutes: number;
  over: boolean;
  /** e.g. "1h 05m left" or "12m over budget". */
  label: string;
}

export function budgetCountdown(args: {
  budgetedHours: (number | null | undefined)[];
  clockedInAt: string;
  breakMinutes?: number | null;
  now?: Date;
}): BudgetCountdown | null {
  const budgetMinutes = Math.round(args.budgetedHours.reduce<number>((sum, h) => sum + (h ?? 0), 0) * 60);
  if (budgetMinutes <= 0) return null;
  const now = args.now ?? new Date();
  const workedMs = now.getTime() - new Date(args.clockedInAt).getTime() - (args.breakMinutes ?? 0) * 60_000;
  const remainingMinutes = budgetMinutes - Math.floor(Math.max(0, workedMs) / 60_000);
  const abs = Math.abs(remainingMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const text = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return { remainingMinutes, over: remainingMinutes < 0, label: remainingMinutes < 0 ? `${text} over budget` : `${text} left` };
}
