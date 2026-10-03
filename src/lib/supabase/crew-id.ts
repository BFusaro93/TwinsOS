/**
 * Crew-login lookup shared by the server routes (via route-auth.ts) and the
 * browser crew hooks (use-crew-app.ts). Lives in its own module because
 * route-auth.ts imports next/headers, which a "use client" hook can't pull in.
 *
 * Resolves the crm_crews row the authenticated caller IS (crew accounts log
 * in as the crew itself), scoped to org so a cross-org id can never match.
 *
 * Two things this deliberately does NOT do:
 *  - it doesn't match soft-deleted crews (`deleted_at IS NULL`), which is
 *    both the repo-wide query rule and the reason a retired crew's account
 *    can't keep acting on visits;
 *  - it doesn't use .maybeSingle(), which THROWS when more than one row
 *    comes back. The same auth user being attached to two crm_crews rows is
 *    a data problem, but it used to turn into a blanket 403 on every crew
 *    route with nothing in the response explaining why. Ordering by
 *    created_at and taking the first keeps the caller working on their
 *    original crew — and keeps every surface agreeing on WHICH crew.
 */
export async function fetchCallerCrew<T extends { id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
  columns = "id"
): Promise<T | null> {
  const { data } = await supabase
    .from("crm_crews")
    .select(columns)
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const rows = (data ?? []) as T[];
  return rows[0] ?? null;
}

export async function resolveCallerCrewId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string
): Promise<string | null> {
  const crew = await fetchCallerCrew(supabase, userId, orgId);
  return crew?.id ?? null;
}

/**
 * The shape of a crm_job_visits row as the crew surfaces select it: the
 * visit's own crew_id plus the parent job's crew_id via a `crm_jobs(crew_id)`
 * embed (PostgREST returns a many-to-one embed as an object, but tolerate an
 * array too).
 */
export interface VisitCrewRow {
  crew_id?: string | null;
  /** Per-visit "no crew" override; wins over the job's crew. */
  crew_unassigned?: boolean | null;
  crm_jobs?: { crew_id?: string | null } | { crew_id?: string | null }[] | null;
}

/**
 * The crew a visit ACTUALLY belongs to: null when crew_unassigned (a
 * per-visit override that pins it to no crew), else its own crew_id, else the
 * job's.
 * visit.crew_id is usually NULL — assigning a crew on the job is how most
 * recurring work is set up, and nothing writes it down onto each generated
 * visit. Row-shaped (snake_case) twin of DispatchBoard's effectiveCrewId();
 * same rule as the RLS policies and set_job_product_status
 * (coalesce(v.crew_id, j.crew_id)).
 */
export function effectiveVisitCrewId(row: VisitCrewRow | null | undefined): string | null {
  if (!row) return null;
  const job = Array.isArray(row.crm_jobs) ? row.crm_jobs[0] : row.crm_jobs;
  if (row.crew_unassigned) return null;
  return row.crew_id ?? job?.crew_id ?? null;
}

/**
 * Loads crm_job_visits rows belonging to `crewId` by EFFECTIVE crew:
 * `crew_id = crewId` OR (`crew_id IS NULL` AND NOT `crew_unassigned` AND the
 * job's crew_id = crewId).
 *
 * PostgREST can't OR a base-table column with an embedded one in a single
 * request, so this runs the two halves separately and merges them (deduped by
 * id). The second half needs the crm_jobs embed as !inner to filter on it, so
 * `select` MUST contain a top-level `crm_jobs(` embed — it's rewritten to
 * `crm_jobs!inner(` for that half only. The first half keeps the plain embed,
 * so a directly-assigned visit whose job row is hidden still shows.
 *
 * `filter` applies the caller's other conditions (date, client, deleted_at…)
 * to both halves. Ordering is NOT preserved across the merge — sort after.
 */
export async function selectEffectiveCrewVisits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  select: string,
  crewId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: (q: any) => any
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
  if (!/(^|[\s,(])crm_jobs\(/.test(select)) {
    throw new Error("selectEffectiveCrewVisits: select must embed crm_jobs(...)");
  }
  const innerSelect = select.replace(/(^|[\s,(])crm_jobs\(/, "$1crm_jobs!inner(");

  const [direct, inherited] = await Promise.all([
    filter(supabase.from("crm_job_visits").select(select)).eq("crew_id", crewId),
    filter(supabase.from("crm_job_visits").select(innerSelect))
      .is("crew_id", null)
      .eq("crew_unassigned", false)
      .eq("crm_jobs.crew_id", crewId),
  ]);
  const error = direct.error ?? inherited.error ?? null;
  if (error) return { data: [], error };

  const seen = new Set<string>();
  const data: Record<string, unknown>[] = [];
  for (const row of [...(direct.data ?? []), ...(inherited.data ?? [])] as Record<string, unknown>[]) {
    const id = row.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    data.push(row);
  }
  return { data, error: null };
}

/**
 * The order every crew list has always used: priority ASC, then start_time
 * ASC with NULLs last. Re-applied after selectEffectiveCrewVisits' merge.
 */
export function compareCrewVisitRows(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const pa = (a.priority as number | null) ?? Number.POSITIVE_INFINITY;
  const pb = (b.priority as number | null) ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  const sa = (a.start_time as string | null) ?? null;
  const sb = (b.start_time as string | null) ?? null;
  if (sa === sb) return 0;
  if (sa === null) return 1;
  if (sb === null) return -1;
  return sa < sb ? -1 : 1;
}

/**
 * Visits the crew is STILL clocked into from an earlier day — a stop clocked in
 * before org-midnight (snow runs, late jobs) must stay on the crew's list so
 * they can clock out, instead of vanishing when the date rolls over. Same
 * effective-crew rule as the day's list; `filter` supplies org/deleted_at.
 * Visits already completed/cancelled/skipped (e.g. closed by the office
 * without a clock-out) are excluded so they don't linger forever.
 */
export async function selectCarriedOverClockedInVisits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  select: string,
  crewId: string,
  beforeDate: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: (q: any) => any = (q) => q
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
  return selectEffectiveCrewVisits(supabase, select, crewId, (q) =>
    filter(q)
      .is("deleted_at", null)
      .lt("scheduled_date", beforeDate)
      .not("clocked_in_at", "is", null)
      .is("clocked_out_at", null)
      .not("status", "in", "(completed,cancelled,skipped)")
  );
}

/** `${dayOfWeek}:${jobId}` → remembered position; see fetchRememberedRouteOrder(). */
export type CrewRouteOrder = Map<string, number>;

function weekdayOfYmd(ymd: string): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The crew's remembered stop order (crm_crew_route_order, per crew + weekday +
 * job — the same table the dispatch board's tiebreaker reads). Best-effort: an
 * error (RLS for a crew login, drift) just yields an empty map, i.e. the
 * pre-existing priority/start_time order.
 */
export async function fetchRememberedRouteOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  crewId: string,
  scheduledDates: string[]
): Promise<CrewRouteOrder> {
  const days = [...new Set(scheduledDates.map(weekdayOfYmd).filter((d): d is number => d != null))];
  const map: CrewRouteOrder = new Map();
  if (days.length === 0) return map;
  try {
    const { data, error } = await supabase
      .from("crm_crew_route_order")
      .select("day_of_week, job_id, position")
      .eq("crew_id", crewId)
      .in("day_of_week", days);
    if (error) return map;
    for (const r of (data ?? []) as { day_of_week: number; job_id: string; position: number }[]) {
      map.set(`${r.day_of_week}:${r.job_id}`, r.position);
    }
  } catch {
    // fall through to the unordered default
  }
  return map;
}

/**
 * compareCrewVisitRows with the remembered route position as a tiebreaker
 * AFTER priority (priority defaults to 1 on every visit, so it is a tiebreaker
 * not a fallback — same rule as the dispatch board) and BEFORE start_time.
 * Visits with nothing remembered sort after those with a position.
 */
export function crewVisitComparator(order: CrewRouteOrder) {
  const pos = (row: Record<string, unknown>) => {
    const dow = weekdayOfYmd(String(row.scheduled_date ?? ""));
    const jobId = row.job_id as string | undefined;
    if (dow == null || !jobId) return Number.MAX_SAFE_INTEGER;
    return order.get(`${dow}:${jobId}`) ?? Number.MAX_SAFE_INTEGER;
  };
  return (a: Record<string, unknown>, b: Record<string, unknown>): number => {
    const pa = (a.priority as number | null) ?? Number.POSITIVE_INFINITY;
    const pb = (b.priority as number | null) ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    const ra = pos(a);
    const rb = pos(b);
    if (ra !== rb) return ra - rb;
    return compareCrewVisitRows(a, b);
  };
}
