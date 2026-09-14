import { isoNy, shiftYmd } from "@/lib/reports/ny-date";

/**
 * Recalculates the next package-sequenced visit's date after an earlier visit in the
 * same job actually completes, so a service's `min_days` gap holds against the ACTUAL
 * completion date instead of only the static chain `computePackageVisitSchedule()`
 * (see package-schedule.ts) computes once at job-creation time in NewJobDialog.
 *
 * Called from both visit-completion paths — crew clock-out and office "mark complete" —
 * since they're independent routes that can each complete a package visit.
 */
export async function recalcNextPackageVisitDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  completedJobServiceId: string | null | undefined,
  completedDateStr: string
): Promise<void> {
  if (!completedJobServiceId) return;

  const { data: completedService } = await supabase
    .from("crm_job_services")
    .select("id, job_id, sort_order")
    .eq("id", completedJobServiceId)
    .maybeSingle();
  if (!completedService) return;

  // Every later service in the package's sequence for this same job, ascending
  // by sort_order. We don't stop at the immediate next one — see the walk
  // below for why.
  const { data: laterServices } = await supabase
    .from("crm_job_services")
    .select("id, min_days")
    .eq("job_id", completedService.job_id)
    .gt("sort_order", completedService.sort_order)
    .order("sort_order", { ascending: true });
  const services = (laterServices ?? []) as { id: string; min_days: number | null }[];
  if (services.length === 0) return;

  // Walk forward through later services in sort_order until we find the first
  // one with a real upcoming visit (not completed/cancelled/skipped). Stopping
  // at the FIRST later service unconditionally would silently no-op the whole
  // recalc whenever that immediate next visit was cancelled/skipped — the
  // chain must cascade past it to whichever visit actually comes next, using
  // THAT service's own min_days against the just-completed visit's date.
  for (const service of services) {
    // That service's own visit — one job_service_id can now have many visit rows
    // (per-service recurring visits generate one per occurrence), so this MUST
    // filter out completed/cancelled/skipped ones and order by date itself rather
    // than trusting an arbitrary unordered row: without both, `.limit(1)` could
    // just as easily return an already-terminal occurrence, silently no-opping
    // this whole recalc even though a real future visit still needs pushing out.
    const { data: nextVisits } = await supabase
      .from("crm_job_visits")
      .select("id, scheduled_date, status")
      .eq("job_service_id", service.id)
      .is("deleted_at", null)
      .not("status", "in", "(completed,cancelled,skipped)")
      .order("scheduled_date", { ascending: true })
      .limit(1);
    const nextVisit = nextVisits?.[0] as { id: string; scheduled_date: string; status: string } | undefined;

    // This service has no surviving (non-terminal) visit — keep walking
    // forward to the next service in the chain instead of giving up.
    if (!nextVisit) continue;

    // Found the real next visit in the chain. If its own service has no
    // min_days constraint, there's nothing to enforce — done either way.
    if (!service.min_days) return;

    const candidateStr = shiftYmd(completedDateStr, service.min_days);

    // min_days is a floor, not an exact offset — only push the next visit OUT if
    // the actual completion date requires it; never pull an already-later date
    // earlier.
    if (candidateStr > nextVisit.scheduled_date) {
      await supabase
        .from("crm_job_visits")
        .update({ scheduled_date: candidateStr })
        .eq("id", nextVisit.id);
    }
    return;
  }
}

/** "9/7"-style month/day for the min-days toast. */
function monthDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}`;
}

/**
 * Validates a manual reschedule (Move to Day, dispatch-board drag, JobDetail
 * dispatch, direct API edit) of a package-sequenced visit against the
 * package's `min_days` spacing rules.
 *
 * `min_days` on a step means "at least N days after the PREVIOUS step" (see
 * computePackageVisitSchedule in package-schedule.ts). The baseline is the
 * previous step's actual completion date once it has completed, otherwise
 * its currently scheduled date — an earlier version only enforced against a
 * COMPLETED predecessor, which is how "Fert 2 of 5" could be moved onto
 * Fert 1's day before Fert 1 was done. Cancelled/skipped/deleted visits are
 * ignored when looking for a neighbour, so a skipped intermediate step
 * doesn't hide the real one further back.
 *
 * Two directions are checked:
 *   - backward: this step vs. the nearest earlier step (this step's min_days)
 *   - forward:  the nearest later step vs. this step's new date (that later
 *               step's min_days) — moving Fert 1 onto Fert 2's day is the
 *               same violation seen from the other side.
 *
 * Returns a human-readable error string, or null when the move is fine (not
 * a package visit, no min_days configured, no neighbouring visit, or the
 * date already satisfies the gap). Mirrored server-side by the
 * crm_job_visits_enforce_package_min_days trigger, which only checks the
 * backward direction (the completion-time recalc pushes later visits OUT and
 * must never be blocked by a forward check).
 */
export async function checkPackageMinDaysViolation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  visitId: string,
  newScheduledDate: string
): Promise<string | null> {
  const { data: visit } = await supabase
    .from("crm_job_visits")
    .select("job_service_id, job_id")
    .eq("id", visitId)
    .maybeSingle();
  const moved = visit as { job_service_id: string | null; job_id: string } | null;
  if (!moved?.job_service_id) return null;

  type Step = { id: string; sort_order: number; min_days: number | null; service_name: string | null };
  const { data: stepRows } = await supabase
    .from("crm_job_services")
    .select("id, sort_order, min_days, service_name")
    .eq("job_id", moved.job_id)
    .order("sort_order", { ascending: true });
  const steps = (stepRows ?? []) as Step[];
  const idx = steps.findIndex((s) => s.id === moved.job_service_id);
  if (idx < 0) return null;
  const me = steps[idx];
  // Nothing to enforce in either direction if no step has min_days.
  if (!steps.some((s) => (s.min_days ?? 0) > 0)) return null;

  type NeighbourVisit = { scheduled_date: string; completed_at: string | null; status: string };
  // Nearest neighbouring step (in the given direction) that has a live visit
  // — prefers a completed visit, then the latest scheduled one.
  async function nearest(direction: "before" | "after"): Promise<{ step: Step; stepNo: number; visit: NeighbourVisit } | null> {
    const candidates = direction === "before" ? steps.slice(0, idx).reverse() : steps.slice(idx + 1);
    for (const step of candidates) {
      const { data: rows } = await supabase
        .from("crm_job_visits")
        .select("scheduled_date, completed_at, status")
        .eq("job_service_id", step.id)
        .neq("id", visitId)
        .is("deleted_at", null)
        .not("status", "in", "(cancelled,skipped)")
        .order("scheduled_date", { ascending: false });
      const list = (rows ?? []) as NeighbourVisit[];
      if (list.length === 0) continue;
      const v = list.find((r) => r.status === "completed") ?? list[0];
      return { step, stepNo: steps.indexOf(step) + 1, visit: v };
    }
    return null;
  }
  const baselineOf = (v: NeighbourVisit) =>
    v.status === "completed" && v.completed_at ? isoNy(new Date(v.completed_at)) : v.scheduled_date;
  const label = (step: Step, no: number) => `Step ${no}${step.service_name ? ` (${step.service_name})` : ""}`;
  const myNo = idx + 1;

  // Backward: I must be >= previous + my min_days.
  if ((me.min_days ?? 0) > 0) {
    const prev = await nearest("before");
    if (prev) {
      const earliest = shiftYmd(baselineOf(prev.visit), me.min_days as number);
      if (newScheduledDate < earliest) {
        return `${label(me, myNo)} must be at least ${me.min_days} days after ${label(prev.step, prev.stepNo)} (earliest ${monthDay(earliest)})`;
      }
    }
  }

  // Forward: the next step must stay >= my new date + its min_days.
  const next = await nearest("after");
  if (next && (next.step.min_days ?? 0) > 0) {
    const earliestNext = shiftYmd(newScheduledDate, next.step.min_days as number);
    if (next.visit.scheduled_date < earliestNext) {
      return `${label(next.step, next.stepNo)} (${monthDay(next.visit.scheduled_date)}) must be at least ${next.step.min_days} days after ${label(me, myNo)} — move it to ${monthDay(earliestNext)} or later first`;
    }
  }
  return null;
}
