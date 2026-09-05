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

/**
 * Validates a manual reschedule (dispatch-board drag or direct edit) of a
 * package-sequenced visit against its service's `min_days` constraint.
 *
 * Unlike `recalcNextPackageVisitDate` (which pushes a later visit OUT after an
 * earlier one completes), this runs BEFORE a write to block a reschedule that
 * would land a visit too close to the preceding visit's actual completion —
 * the completion-triggered recalc above only ever fires on the completion
 * path, so a manual drag/edit of `scheduled_date` has no other guard.
 *
 * Returns a human-readable error string if the new date violates min_days,
 * or null if the reschedule is fine (not a package visit, no min_days
 * constraint, no completed preceding visit, or the date already satisfies it).
 */
export async function checkPackageMinDaysViolation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  visitId: string,
  newScheduledDate: string
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await supabase
    .from("crm_job_visits")
    .select("job_service_id")
    .eq("id", visitId)
    .maybeSingle();
  const jobServiceId = (visit as { job_service_id: string | null } | null)?.job_service_id;
  if (!jobServiceId) return null;

  const { data: service } = await supabase
    .from("crm_job_services")
    .select("id, job_id, sort_order, min_days")
    .eq("id", jobServiceId)
    .maybeSingle();
  const svc = service as { id: string; job_id: string; sort_order: number; min_days: number | null } | null;
  if (!svc?.min_days) return null;

  // Walk backward through earlier services (by sort_order, descending) until
  // we find one with a completed visit — mirrors the forward walk in
  // recalcNextPackageVisitDate, so a cancelled/skipped intermediate service
  // doesn't hide a real completed predecessor further back in the chain.
  const { data: earlierServices } = await supabase
    .from("crm_job_services")
    .select("id")
    .eq("job_id", svc.job_id)
    .lt("sort_order", svc.sort_order)
    .order("sort_order", { ascending: false });

  for (const earlier of (earlierServices ?? []) as { id: string }[]) {
    const { data: completedVisits } = await supabase
      .from("crm_job_visits")
      .select("completed_at, scheduled_date")
      .eq("job_service_id", earlier.id)
      .eq("status", "completed")
      .is("deleted_at", null)
      .order("completed_at", { ascending: false })
      .limit(1);
    const prevVisit = completedVisits?.[0] as { completed_at: string | null; scheduled_date: string } | undefined;
    if (!prevVisit) continue; // this earlier service never completed — keep walking back

    const baselineDate = prevVisit.completed_at ? isoNy(new Date(prevVisit.completed_at)) : prevVisit.scheduled_date;
    const minDate = shiftYmd(baselineDate, svc.min_days);
    if (newScheduledDate < minDate) {
      return `This visit requires at least ${svc.min_days} day(s) after the previous visit's completion (${baselineDate}). The earliest allowed date is ${minDate}.`;
    }
    return null; // baseline found and satisfied
  }
  return null; // no completed preceding visit — nothing to enforce yet
}
