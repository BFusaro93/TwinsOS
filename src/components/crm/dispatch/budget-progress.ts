import type { CRMJobVisit } from "@/types/crm-jobs";

export type BudgetLevel = "ok" | "warn" | "over";

export const BUDGET_BAR_CLASS: Record<BudgetLevel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  over: "bg-red-500",
};

/**
 * Hours-based budget health for a visit: actual vs. budgeted hours.
 * Returns null when there is no budget to measure against.
 *
 * A visit with no hours logged yet shows an empty (but present) bar so the
 * card still reads as "has a budget". Over 100% is red whether or not the
 * visit is finished; 90–100% is amber so a crew still on site gets a warning
 * before they blow the budget.
 */
export function visitBudgetState(
  v: Pick<CRMJobVisit, "actualHours" | "budgetedHours">
): { ratio: number; fillPct: number; level: BudgetLevel } | null {
  const budget = v.budgetedHours ?? 0;
  if (budget <= 0) return null;
  const ratio = (v.actualHours ?? 0) / budget;
  const level: BudgetLevel = ratio > 1 ? "over" : ratio >= 0.9 ? "warn" : "ok";
  return { ratio, fillPct: Math.min(100, Math.max(0, ratio * 100)), level };
}
