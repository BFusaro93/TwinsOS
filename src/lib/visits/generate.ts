import {
  addDaysYmd,
  occurrencesForRules,
  rulesForJob,
  type ScheduleRow,
} from "@/lib/visits/recurrence";

/**
 * The ONE recurring/package visit generator, used by the daily cron
 * (/api/cron/recurring-visits, service-role client, every org) and the
 * per-job route (/api/crm/jobs/generate-visits, the caller's RLS client).
 *
 * Occurrence identity: every generated visit records occurrence_date — the
 * date the generator produced it for. A visit is never generated for a
 * (job, job_service, occurrence_date) that already exists, INCLUDING
 * soft-deleted rows, so moving or deleting a visit sticks. System prunes
 * (schedule change / hold / cancel, see prune.ts) null occurrence_date on the
 * rows they remove, which releases the occurrence for regeneration.
 *
 * Legacy guards kept from the old generators: a date with a live UNLINKED
 * visit (one combined visit, or a manual "Add Visit" without a service) or a
 * visit that is already clocked in is left alone, and a live visit for the
 * same service on the same scheduled_date (e.g. the first visit inserted by
 * job creation, which has no occurrence_date) counts as that occurrence.
 *
 * UNLINKED occurrences (job_service_id NULL with an occurrence_date — the
 * legacy combined visits the 20260927110000 backfill stamped, or visits the
 * generator made for a job with no services) occupy their date for EVERY
 * service of the job, live or soft-deleted: moving or deleting one must not
 * regenerate per-service visits on that date. An unlinked visit completes
 * into an invoice for all of the job's services, so it also counts toward
 * every capped service's max_visits.
 *
 * Every read is paginated (PostgREST caps a response at 1000 rows): a
 * truncated read silently re-created visits that existed and under-counted
 * max_visits usage, overbilling the client.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export const GENERATOR_JOB_COLUMNS =
  "id, org_id, client_id, crew_id, job_type, status, schedule, schedule_days, recurrence_start, recurrence_end, scheduled_date, start_date_window, package_total_steps, priority, notes_to_crew, man_count";

export interface GeneratorJob {
  id: string;
  org_id: string | null;
  client_id: string;
  crew_id: string | null;
  job_type: string;
  status: string | null;
  schedule: string | null;
  schedule_days: string[] | null;
  recurrence_start: string | null;
  recurrence_end: string | null;
  scheduled_date: string | null;
  start_date_window: string | null;
  package_total_steps: number | null;
  priority: number | null;
  notes_to_crew: string | null;
  man_count: number | null;
}

interface GeneratorService {
  id: string;
  job_id: string;
  included: boolean | null;
  start_recurring: string | null;
  start_date: string | null;
  sort_order: number | null;
  /** Visit budget for this service (estimate line's visit count); null = no cap. */
  max_visits?: number | null;
}

interface ExistingVisit {
  job_id: string;
  job_service_id: string | null;
  scheduled_date: string | null;
  occurrence_date: string | null;
  deleted_at: string | null;
  clocked_in_at: string | null;
}

export interface VisitInsert {
  org_id?: string;
  job_id: string;
  client_id: string;
  crew_id: string | null;
  scheduled_date: string;
  occurrence_date: string;
  job_service_id: string | null;
  men_count: number;
  priority: number;
  notes_to_crew: string | null;
}

/** Job statuses that never get new visits. */
export const NON_GENERATING_JOB_STATUSES = ["hold", "cancelled", "completed"];

export interface PlanArgs {
  job: GeneratorJob;
  services: GeneratorService[];
  existing: ExistingVisit[];
  schedulesByName: Map<string, ScheduleRow>;
  /** Org-calendar today, "YYYY-MM-DD". Nothing is generated before it. */
  today: string;
  /** Last date (inclusive) of the rolling horizon. */
  horizonEnd: string;
  /** Package jobs: only services whose start_date falls in [today, horizonEnd]
   *  (the cron). The per-job route generates every dated service. */
  packageWindowOnly?: boolean;
  maxVisits?: number;
  /** org_id to stamp when the job row has none (session org). */
  fallbackOrgId?: string | null;
  /** Per job_service_id: ALL-TIME visits already counting toward max_visits
   *  (live rows, plus soft-deleted rows that still hold an occurrence_date —
   *  a moved/deleted occurrence consumed its slot; rows a system prune
   *  cleared don't), including the job's UNLINKED visits. Required for
   *  services with max_visits set. */
  usedVisitsByService?: Map<string, number>;
  /** ALL-TIME live (non-deleted) visit count for the job — what
   *  package_total_steps caps. `existing` is window-limited for recurring
   *  jobs, so it can't supply this. Required when package_total_steps is set. */
  liveVisitCount?: number;
}

const keyOf = (serviceId: string | null, date: string) => `${serviceId ?? ""}|${date}`;

export function planVisitsForJob(args: PlanArgs): VisitInsert[] {
  const { job, services, existing, schedulesByName, today, horizonEnd } = args;
  const maxVisits = args.maxVisits ?? Number.POSITIVE_INFINITY;
  if (job.status && NON_GENERATING_JOB_STATUSES.includes(job.status)) return [];

  const orgId = job.org_id ?? args.fallbackOrgId ?? null;
  const menCount = Math.max(1, Number(job.man_count ?? 1) || 1);
  const base = (date: string, occurrence: string, serviceId: string | null): VisitInsert => ({
    ...(orgId ? { org_id: orgId } : {}),
    job_id: job.id,
    client_id: job.client_id,
    crew_id: job.crew_id ?? null,
    scheduled_date: date,
    occurrence_date: occurrence,
    job_service_id: serviceId,
    men_count: menCount,
    priority: job.priority ?? 1,
    notes_to_crew: job.notes_to_crew ?? null,
  });

  const identity = new Set<string>();
  const liveKeys = new Set<string>();
  const liveDates = new Set<string>();
  const liveUnlinkedDates = new Set<string>();
  /** Dates held by an unlinked occurrence, live or soft-deleted. */
  const unlinkedOccurrenceDates = new Set<string>();
  const startedDates = new Set<string>();
  const claimedServices = new Set<string>();
  let liveCount = 0;
  for (const v of existing) {
    if (v.occurrence_date) identity.add(keyOf(v.job_service_id, v.occurrence_date));
    if (v.occurrence_date && !v.job_service_id) unlinkedOccurrenceDates.add(v.occurrence_date);
    if (v.job_service_id && (!v.deleted_at || v.occurrence_date)) claimedServices.add(v.job_service_id);
    if (v.deleted_at) continue;
    liveCount++;
    if (!v.scheduled_date) continue;
    liveKeys.add(keyOf(v.job_service_id, v.scheduled_date));
    liveDates.add(v.scheduled_date);
    if (!v.job_service_id) liveUnlinkedDates.add(v.scheduled_date);
    if (v.clocked_in_at) startedDates.add(v.scheduled_date);
  }
  // package_total_steps counts ALL-TIME live visits (as the old cron did),
  // not just the window `existing` covers.
  if (args.liveVisitCount != null) liveCount = args.liveVisitCount;
  const unlinkedHolds = (date: string) => liveUnlinkedDates.has(date) || unlinkedOccurrenceDates.has(date);

  const out: VisitInsert[] = [];

  // max_visits budget per service, decremented as visits are planned.
  const remaining = new Map<string, number>();
  for (const s of services) {
    if (s.max_visits != null && s.max_visits > 0) {
      remaining.set(s.id, Math.max(0, s.max_visits - (args.usedVisitsByService?.get(s.id) ?? 0)));
    }
  }
  const hasBudget = (serviceId: string) => !remaining.has(serviceId) || remaining.get(serviceId)! > 0;
  const spend = (serviceId: string) => {
    if (remaining.has(serviceId)) remaining.set(serviceId, remaining.get(serviceId)! - 1);
  };

  // ── package: one visit per dated service ──────────────────────────────────
  if (job.job_type === "package") {
    for (const s of services) {
      if (out.length >= maxVisits) break;
      if (!s.start_date || s.included === false) continue;
      if (args.packageWindowOnly && (s.start_date < today || s.start_date > horizonEnd)) continue;
      // Per SERVICE, not per date: two package services due the same day are
      // two visits. An unlinked legacy occurrence on the date still covers it.
      if (claimedServices.has(s.id) || identity.has(keyOf(s.id, s.start_date))) continue;
      if (unlinkedHolds(s.start_date)) continue;
      if (!hasBudget(s.id)) continue;
      out.push(base(s.start_date, s.start_date, s.id));
      claimedServices.add(s.id);
      spend(s.id);
    }
    return out;
  }

  if (job.job_type !== "recurring") return out;

  // ── recurring ─────────────────────────────────────────────────────────────
  const jobStart = job.recurrence_start ?? job.scheduled_date ?? job.start_date_window ?? null;
  const from = jobStart && jobStart > today ? jobStart : today;
  const to = job.recurrence_end && job.recurrence_end < horizonEnd ? job.recurrence_end : horizonEnd;
  if (to < from) return out;

  const rules = rulesForJob(job.schedule, job.schedule_days, schedulesByName);
  if (rules.length === 0) return out;
  const dates = occurrencesForRules(rules, from, to, { fallbackAnchor: jobStart });

  // Service rows exist but all are excluded: nothing billable to generate.
  // (Only a job with NO service rows gets unlinked whole-job visits.)
  if (services.length > 0 && services.every((s) => s.included === false)) return out;
  const activeServices = services
    .filter((s) => s.included !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const cap = job.package_total_steps;

  outer: for (const date of dates) {
    if (unlinkedHolds(date) || startedDates.has(date)) continue;
    if (activeServices.length === 0) {
      if (identity.has(keyOf(null, date)) || liveDates.has(date)) continue;
      if (cap != null && liveCount + out.length >= cap) break;
      out.push(base(date, date, null));
      if (out.length >= maxVisits) break;
      continue;
    }
    for (const s of activeServices) {
      if (s.start_recurring && date < s.start_recurring) continue;
      const key = keyOf(s.id, date);
      if (identity.has(key) || liveKeys.has(key)) continue;
      if (!hasBudget(s.id)) continue;
      if (cap != null && liveCount + out.length >= cap) break outer;
      out.push(base(date, date, s.id));
      identity.add(key);
      spend(s.id);
      if (out.length >= maxVisits) break outer;
    }
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Reads EVERY row of a query, page by page. PostgREST truncates a response at
 * its max-rows setting (1000 on Supabase) without an error, so a single
 * select silently drops rows. `build` must return a fresh filtered query each
 * call; pages are ordered by id for a stable split, and the loop stops on the
 * first empty page (robust to any server-side page cap).
 */
export async function selectAllRows<T>(
  build: () => AnyClient,
  pageSize = 1000
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await build().order("id").range(from, from + pageSize - 1);
    if (error) return { rows, error: (error as { message: string }).message };
    const page = (data ?? []) as T[];
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return { rows, error: null };
}

export interface GenerateOptions {
  /** Org-calendar today for a job's org ("YYYY-MM-DD"). */
  todayFor: (orgId: string | null) => Promise<string>;
  horizonDays: number;
  maxVisitsPerJob?: number;
  packageWindowOnly?: boolean;
  fallbackOrgId?: string | null;
}

export interface GenerateResult {
  planned: number;
  inserted: number;
  insertedByJob: Map<string, number>;
  errors: string[];
}

/** Loads everything the planner needs for `jobs`, plans, and inserts. */
export async function generateVisitsForJobs(
  supabase: AnyClient,
  jobs: GeneratorJob[],
  opts: GenerateOptions
): Promise<GenerateResult> {
  const result: GenerateResult = { planned: 0, inserted: 0, insertedByJob: new Map(), errors: [] };
  if (jobs.length === 0) return result;

  const todayByJob = new Map<string, string>();
  for (const j of jobs) todayByJob.set(j.id, await opts.todayFor(j.org_id ?? opts.fallbackOrgId ?? null));
  const minToday = [...todayByJob.values()].reduce((m, d) => (d < m ? d : m));

  const services: GeneratorService[] = [];
  const existing: ExistingVisit[] = [];
  const recurringIds = jobs.filter((j) => j.job_type !== "package").map((j) => j.id);
  const packageIds = jobs.filter((j) => j.job_type === "package").map((j) => j.id);

  for (const ids of chunk(jobs.map((j) => j.id), 100)) {
    const { rows, error } = await selectAllRows<GeneratorService>(() => supabase
      .from("crm_job_services")
      .select("id, job_id, included, start_recurring, start_date, sort_order, max_visits")
      .in("job_id", ids));
    if (error) { result.errors.push(error); return result; }
    services.push(...rows);
  }
  const visitCols = "job_id, job_service_id, scheduled_date, occurrence_date, deleted_at, clocked_in_at";
  for (const ids of chunk(recurringIds, 100)) {
    // Every row holding an occurrence on/after today (deleted rows included on
    // purpose — they still claim it), plus live rows scheduled on/after today.
    // Deleted rows a prune released (no occurrence_date) are irrelevant.
    const { rows, error } = await selectAllRows<ExistingVisit>(() => supabase
      .from("crm_job_visits")
      .select(visitCols)
      .in("job_id", ids)
      .or(`occurrence_date.gte.${minToday},and(deleted_at.is.null,scheduled_date.gte.${minToday})`));
    if (error) { result.errors.push(error); return result; }
    existing.push(...rows);
  }
  for (const ids of chunk(packageIds, 100)) {
    const { rows, error } = await selectAllRows<ExistingVisit>(() => supabase
      .from("crm_job_visits")
      .select(visitCols)
      .in("job_id", ids)
      .or("deleted_at.is.null,occurrence_date.not.is.null"));
    if (error) { result.errors.push(error); return result; }
    existing.push(...rows);
  }

  // All-time usage for services with a visit budget — the window-limited
  // `existing` fetch above can't see past visits, which still count. A row
  // counts while live, or soft-deleted but still holding its occurrence
  // (moved/deleted by a user); a system prune's released rows don't.
  const usedVisitsByService = new Map<string, number>();
  const cappedServices = services.filter((s) => s.max_visits != null);
  const countsFilter = "deleted_at.is.null,occurrence_date.not.is.null";
  for (const ids of chunk(cappedServices.map((s) => s.id), 100)) {
    const { rows, error } = await selectAllRows<{ job_service_id: string }>(() => supabase
      .from("crm_job_visits")
      .select("job_service_id")
      .in("job_service_id", ids)
      .or(countsFilter));
    if (error) { result.errors.push(error); return result; }
    for (const v of rows) {
      usedVisitsByService.set(v.job_service_id, (usedVisitsByService.get(v.job_service_id) ?? 0) + 1);
    }
  }
  // An unlinked visit bills every service of its job, so it spends one visit
  // of every capped service's budget.
  const cappedJobIds = [...new Set(cappedServices.map((s) => s.job_id))];
  const unlinkedByJob = new Map<string, number>();
  for (const ids of chunk(cappedJobIds, 100)) {
    const { rows, error } = await selectAllRows<{ job_id: string }>(() => supabase
      .from("crm_job_visits")
      .select("job_id")
      .in("job_id", ids)
      .is("job_service_id", null)
      .or(countsFilter));
    if (error) { result.errors.push(error); return result; }
    for (const v of rows) unlinkedByJob.set(v.job_id, (unlinkedByJob.get(v.job_id) ?? 0) + 1);
  }
  for (const s of cappedServices) {
    const extra = unlinkedByJob.get(s.job_id) ?? 0;
    if (extra > 0) usedVisitsByService.set(s.id, (usedVisitsByService.get(s.id) ?? 0) + extra);
  }

  // package_total_steps caps ALL-TIME live visits — an exact count per job.
  const liveCountByJob = new Map<string, number>();
  for (const j of jobs) {
    if (j.package_total_steps == null) continue;
    const { count, error } = await supabase
      .from("crm_job_visits")
      .select("id", { count: "exact", head: true })
      .eq("job_id", j.id)
      .is("deleted_at", null);
    if (error) { result.errors.push((error as { message: string }).message); return result; }
    liveCountByJob.set(j.id, count ?? 0);
  }

  const { rows: scheduleRows, error: schedErr } = await selectAllRows<ScheduleRow & { org_id: string | null }>(() => supabase
    .from("crm_schedules")
    .select("org_id, name, frequency, day_of_week, week_pattern, anchor_date, week_of_month, season_start, season_end")
    .is("deleted_at", null));
  if (schedErr) { result.errors.push(schedErr); return result; }
  const schedulesByOrg = new Map<string, Map<string, ScheduleRow>>();
  for (const r of scheduleRows) {
    const k = r.org_id ?? "";
    if (!schedulesByOrg.has(k)) schedulesByOrg.set(k, new Map());
    schedulesByOrg.get(k)!.set(r.name, r);
  }

  const servicesByJob = new Map<string, GeneratorService[]>();
  for (const s of services) {
    if (!servicesByJob.has(s.job_id)) servicesByJob.set(s.job_id, []);
    servicesByJob.get(s.job_id)!.push(s);
  }
  const existingByJob = new Map<string, ExistingVisit[]>();
  for (const v of existing) {
    if (!existingByJob.has(v.job_id)) existingByJob.set(v.job_id, []);
    existingByJob.get(v.job_id)!.push(v);
  }

  const toInsert: VisitInsert[] = [];
  for (const job of jobs) {
    const today = todayByJob.get(job.id)!;
    const orgKey = job.org_id ?? opts.fallbackOrgId ?? "";
    toInsert.push(...planVisitsForJob({
      job,
      services: servicesByJob.get(job.id) ?? [],
      existing: existingByJob.get(job.id) ?? [],
      schedulesByName: schedulesByOrg.get(orgKey) ?? new Map(),
      today,
      horizonEnd: addDaysYmd(today, opts.horizonDays),
      packageWindowOnly: opts.packageWindowOnly,
      maxVisits: opts.maxVisitsPerJob,
      fallbackOrgId: opts.fallbackOrgId,
      usedVisitsByService,
      liveVisitCount: liveCountByJob.get(job.id),
    }));
  }
  result.planned = toInsert.length;

  const count = (rows: VisitInsert[]) => {
    result.inserted += rows.length;
    for (const r of rows) result.insertedByJob.set(r.job_id, (result.insertedByJob.get(r.job_id) ?? 0) + 1);
  };
  for (const rows of chunk(toInsert, 100)) {
    const { error } = await supabase.from("crm_job_visits").insert(rows);
    if (!error) { count(rows); continue; }
    if ((error as { code?: string }).code !== "23505") { result.errors.push(error.message); continue; }
    // A concurrent run claimed some of these occurrences first
    // (crm_job_visits_occurrence_unique) — insert one by one, skipping those.
    for (const row of rows) {
      const { error: oneErr } = await supabase.from("crm_job_visits").insert(row);
      if (!oneErr) count([row]);
      else if ((oneErr as { code?: string }).code !== "23505") result.errors.push(oneErr.message);
    }
  }
  return result;
}
