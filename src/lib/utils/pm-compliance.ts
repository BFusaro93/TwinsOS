import type { PMOutcome } from "@/types/cmms";

export interface PMComplianceCounts {
  onTime: number;
  late: number;
  /** Done, but with no due date to judge it against. */
  completed: number;
  skipped: number;
  overdue: number;
  /** Due date passed and no work order was ever generated. */
  notGenerated: number;
}

export interface PMComplianceSummary extends PMComplianceCounts {
  /** PMs that came due: every outcome except "pending". */
  due: number;
  /** All completions, on time or not. */
  done: number;
  /** done ÷ due; null when nothing came due. */
  compliancePct: number | null;
  /** onTime ÷ (onTime + late) — only PMs that had a due date; null when none did. */
  onTimePct: number | null;
}

/**
 * The one place PM compliance is scored — mirrors the outcome buckets of
 * v_pm_outcomes. Skipped, still-overdue and never-generated PMs count as
 * missed; pending (open, not yet due) PMs aren't counted either way.
 */
export function summarizePMCompliance(c: PMComplianceCounts): PMComplianceSummary {
  const done = c.onTime + c.late + c.completed;
  const due = done + c.skipped + c.overdue + c.notGenerated;
  const measured = c.onTime + c.late;
  return {
    ...c,
    due,
    done,
    compliancePct: due > 0 ? Math.round((1000 * done) / due) / 10 : null,
    onTimePct: measured > 0 ? Math.round((1000 * c.onTime) / measured) / 10 : null,
  };
}

export function countPMOutcomes(outcomes: { outcome: PMOutcome }[]): PMComplianceCounts {
  const c: PMComplianceCounts = { onTime: 0, late: 0, completed: 0, skipped: 0, overdue: 0, notGenerated: 0 };
  for (const { outcome } of outcomes) {
    if (outcome === "on_time") c.onTime++;
    else if (outcome === "late") c.late++;
    else if (outcome === "completed") c.completed++;
    else if (outcome === "skipped") c.skipped++;
    else if (outcome === "overdue") c.overdue++;
    else if (outcome === "not_generated") c.notGenerated++;
  }
  return c;
}
