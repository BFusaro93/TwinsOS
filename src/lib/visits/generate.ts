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
   *  cleared don't). Required for services with max_visits set. */
  usedVisitsByService?: Map<string, number>;
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
  const startedDates = new Set<string>();
  const claimedServices = new Set<string>();
  let liveCount = 0;
  for (const v of existing) {
    if (v.occurrence_date) identity.add(keyOf(v.job_service_id, v.occurrence_date));
    if (v.job_service_id && (!v.deleted_at || v.occurrence_date)) claimedServices.add(v.job_service_id);
    if (v.deleted_at) continue;
    liveCount++;
    if (!v.scheduled_date) continue;
    liveKeys.add(keyOf(v.job_service_id, v.scheduled_date));
    liveDates.add(v.scheduled_date);
    if (!v.job_service_id) liveUnlinkedDates.add(v.scheduled_date);
    if (v.clocked_in_at) startedDates.add(v.scheduled_date);
  }

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
      // two visits. A live unlinked legacy visit on the date still covers it.
      if (claimedServices.has(s.id) || identity.has(keyOf(s.id, s.start_date))) continue;
      if (liveUnlinkedDates.has(s.start_date)) continue;
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

  const activeServices = services
    .filter((s) => s.included !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const cap = job.package_total_steps;

  outer: for (const date of dates) {
    if (liveUnlinkedDates.has(date) || startedDates.has(date)) continue;
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
    const { data, error } = await supabase
      .from("crm_job_services")
      .select("id, job_id, included, start_recurring, start_date, sort_order, max_visits")
      .in("job_id", ids);
    if (error) { result.errors.push(error.message); return result; }
    services.push(...((data ?? []) as GeneratorService[]));
  }
  const visitCols = "job_id, job_service_id, scheduled_date, occurrence_date, deleted_at, clocked_in_at";
  for (const ids of chunk(recurringIds, 100)) {
    // Deleted rows included on purpose — they still claim their occurrence.
    const { data, error } = await supabase
      .from("crm_job_visits")
      .select(visitCols)
      .in("job_id", ids)
      .or(`occurrence_date.gte.${minToday},scheduled_date.gte.${minToday}`);
    if (error) { result.errors.push(error.message); return result; }
    existing.push(...((data ?? []) as ExistingVisit[]));
  }
  for (const ids of chunk(packageIds, 100)) {
    const { data, error } = await supabase.from("crm_job_visits").select(visitCols).in("job_id", ids);
    if (error) { result.errors.push(error.message); return result; }
    existing.push(...((data ?? []) as ExistingVisit[]));
  }

  // All-time usage for services with a visit budget — the window-limited
  // `existing` fetch above can't see past visits, which still count.
  const usedVisitsByService = new Map<string, number>();
  const cappedServiceIds = services.filter((s) => s.max_visits != null).map((s) => s.id);
  for (const ids of chunk(cappedServiceIds, 100)) {
    const { data, error } = await supabase
      .from("crm_job_visits")
      .select("job_service_id, deleted_at, occurrence_date")
      .in("job_service_id", ids);
    if (error) { result.errors.push(error.message); return result; }
    for (const v of (data ?? []) as { job_service_id: string; deleted_at: string | null; occurrence_date: string | null }[]) {
      if (v.deleted_at && !v.occurrence_date) continue; // released by a system prune
      usedVisitsByService.set(v.job_service_id, (usedVisitsByService.get(v.job_service_id) ?? 0) + 1);
    }
  }

  const { data: scheduleRows, error: schedErr } = await supabase
    .from("crm_schedules")
    .select("org_id, name, frequency, day_of_week, week_pattern, anchor_date, week_of_month, season_start, season_end")
    .is("deleted_at", null);
  if (schedErr) { result.errors.push(schedErr.message); return result; }
  const schedulesByOrg = new Map<string, Map<string, ScheduleRow>>();
  for (const r of (scheduleRows ?? []) as (ScheduleRow & { org_id: string | null })[]) {
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
