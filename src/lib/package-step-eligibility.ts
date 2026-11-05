/**
 * When a package step can first be dispatched, for the Waiting List's
 * "too soon" hint. Mirrors the Min Days rule the server enforces on every move
 * (src/lib/package-visit-recalc.ts): a step must be at least `minDays` after the
 * nearest earlier step that has a live visit — measured from the day that step
 * was completed if it was, else from its scheduled date. The step's own window
 * start is reported separately (it isn't enforced, but dispatching ahead of it
 * is usually a mistake).
 */

export interface StepOrder {
  id: string;
  sortOrder: number;
  minDays: number | null;
  startDate: string | null;
}

export interface StepVisit {
  scheduledDate: string;
  status: string;
  completedAt?: string | null;
  jobServiceId: string | null;
}

export interface StepEligibility {
  /** Earliest day the Min Days rule allows, or null when it doesn't apply. */
  spacingEarliest: string | null;
  /** The earlier step the spacing is measured from (1-based step number). */
  afterStepNo: number | null;
  minDays: number | null;
  /** The step's own window start, when it hasn't opened yet. */
  windowOpens: string | null;
}

function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function packageStepEligibility(args: {
  steps: StepOrder[];
  visits: StepVisit[];
  stepId: string;
  today: string;
  /** completed_at instant -> service day in the org's timezone */
  toYmd: (d: Date) => string;
}): StepEligibility {
  const { visits, stepId, today, toYmd } = args;
  const steps = [...args.steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = steps.findIndex((s) => s.id === stepId);
  const none: StepEligibility = { spacingEarliest: null, afterStepNo: null, minDays: null, windowOpens: null };
  if (idx < 0) return none;
  const me = steps[idx];
  const windowOpens = me.startDate && me.startDate > today ? me.startDate : null;
  if (!(me.minDays && me.minDays > 0)) return { ...none, windowOpens };

  // Nearest earlier step with a live visit; a completed visit wins, else the latest scheduled.
  for (let i = idx - 1; i >= 0; i--) {
    const live = visits.filter(
      (v) => v.jobServiceId === steps[i].id && v.status !== "cancelled" && v.status !== "skipped"
    );
    if (live.length === 0) continue;
    const done = live.find((v) => v.status === "completed");
    const pick = done ?? [...live].sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1))[0];
    const baseline = done && done.completedAt ? toYmd(new Date(done.completedAt)) : pick.scheduledDate;
    const earliest = addDaysYmd(baseline, me.minDays);
    return {
      spacingEarliest: earliest > today ? earliest : null,
      afterStepNo: i + 1,
      minDays: me.minDays,
      windowOpens,
    };
  }
  return { ...none, windowOpens };
}
