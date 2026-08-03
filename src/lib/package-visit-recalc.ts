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

  // The next service in the package's sequence for this same job.
  const { data: nextServices } = await supabase
    .from("crm_job_services")
    .select("id, min_days")
    .eq("job_id", completedService.job_id)
    .gt("sort_order", completedService.sort_order)
    .order("sort_order", { ascending: true })
    .limit(1);
  const nextService = nextServices?.[0] as { id: string; min_days: number | null } | undefined;
  if (!nextService?.min_days) return;

  // That service's own visit — one job_service_id can now have many visit rows
  // (per-service recurring visits generate one per occurrence), so this MUST
  // filter out completed/cancelled ones and order by date itself rather than
  // trusting an arbitrary unordered row: without both, `.limit(1)` could just
  // as easily return an already-completed occurrence, silently no-opping this
  // whole recalc even though a real future visit still needs pushing out.
  const { data: nextVisits } = await supabase
    .from("crm_job_visits")
    .select("id, scheduled_date, status")
    .eq("job_service_id", nextService.id)
    .is("deleted_at", null)
    .not("status", "in", "(completed,cancelled)")
    .order("scheduled_date", { ascending: true })
    .limit(1);
  const nextVisit = nextVisits?.[0] as { id: string; scheduled_date: string; status: string } | undefined;
  if (!nextVisit) return;

  const candidate = new Date(`${completedDateStr}T00:00:00`);
  candidate.setDate(candidate.getDate() + nextService.min_days);
  const candidateStr = candidate.toISOString().slice(0, 10);

  // min_days is a floor, not an exact offset — only push the next visit OUT if the
  // actual completion date requires it; never pull an already-later date earlier.
  if (candidateStr > nextVisit.scheduled_date) {
    await supabase
      .from("crm_job_visits")
      .update({ scheduled_date: candidateStr })
      .eq("id", nextVisit.id);
  }
}
