// ============================================================
// Visit-level job costing — shared by the standalone Landscapt
// "Job Costing" and "COGS by Service" reports.
//
// Unit of analysis is a COMPLETED VISIT whose `completed_at` falls inside
// the requested window. Everything is read through the RLS-scoped server
// client, so results are already limited to the caller's org.
//
// Per visit:
//   revenue    = rpt_job_visits.revenue_cents (authoritative per-visit revenue:
//                per-service visit → its own rate, else Σ included service
//                lines, else the job rate — see the view migration)
//   date       = rpt_job_visits.worked_date (completed_at in Eastern time,
//                else scheduled_date) — the same basis Job Cost Summary uses
//   man-hours  = rpt_job_visits.man_hours (already person × hours — never
//                multiply by men_count again)
//   labor      = rpt_job_visits.actual_labor_cost_cents, which the view already
//                resolves through the fallback chain: crew clock-out actual →
//                man_hours × the visit crew's average rate (member burden rate,
//                else employee hourly × org labor burden %) → man_hours × the
//                org-wide member average → 0. labor_cost_source says which
//                layer produced it: 'actual' | 'estimated' | 'none' ("no labor
//                rate configured" — surfaced in report footnotes, never a
//                silent $0).
//   materials  = crm_job_materials rows logged against this visit_id, plus
//                an even share of the job's visit-less (job-level) materials
//                spread across that job's completed visits (all time).
//   services   = rpt_job_services rows for the visit; each carries a `share`
//                (fraction of the visit's $/hours) weighted by the line's own
//                price (line_revenue_cents = qty × rate), then budgeted_hours
//                when every line is $0, then an even split.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type Client = SupabaseClient<Database>;

/**
 * The rpt_* views gained columns (worked_date, labor_cost_source,
 * line_revenue_cents) that the generated Database types don't know about yet;
 * read them through an untyped client so the select strings type-check
 * without regenerating src/types/supabase.ts.
 */
type UntypedClient = SupabaseClient;

export type LaborCostSource = "actual" | "estimated" | "none";

export interface VisitCostingWindow {
  /** "YYYY-MM-DD" inclusive lower bound on completed_at, or null for open. */
  from: string | null;
  /** "YYYY-MM-DD" inclusive upper bound on completed_at, or null for open. */
  to: string | null;
}

export interface VisitServiceShare {
  /** crm_services.id, or null for a job service with no catalog link. */
  serviceId: string | null;
  serviceName: string;
  /** Fraction (0..1) of the visit's revenue/labor/materials/hours attributed here. */
  share: number;
}

export interface CostedVisit {
  visitId: string;
  jobId: string | null;
  clientName: string;
  serviceNames: string;
  crewName: string | null;
  completedAt: string;
  /** "YYYY-MM-DD" the work is reported under: completed_at in Eastern time, else scheduled_date. */
  workedDate: string;
  menCount: number;
  /** Budgeted MAN-hours for the visit. */
  budgetedHours: number;
  /** Actual MAN-hours for the visit. */
  manHours: number;
  revenueCents: number;
  laborCostCents: number;
  /** True when laborCostCents was derived from hours × a labor rate, not clock-out. */
  laborEstimated: boolean;
  /** Which layer produced laborCostCents; 'none' = no labor rate configured anywhere. */
  laborSource: LaborCostSource;
  materialsCostCents: number;
  /** Empty for legacy visits with no crm_job_services rows. */
  services: VisitServiceShare[];
}

export interface ServiceTarget {
  id: string;
  name: string;
  targetRateCentsPerHr: number;
}

export interface VisitCostingData {
  visits: CostedVisit[];
  /** crm_services by id (non-deleted), for target rates and names. */
  services: Map<string, ServiceTarget>;
}

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 100;
const SENTINEL_TS = "23:59:59.999";

// ── generic fetch helpers ─────────────────────────────────────────────────────

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * PostgREST caps a single response at 1000 rows; a month of visits can exceed
 * that. `page` must build a FRESH query each call and apply `.range(from, to)`.
 */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await page(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run `load` per id-chunk and flatten, avoiding one enormous `in (...)`. */
async function fetchByIdChunks<T>(
  ids: string[],
  load: (idChunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const results = await Promise.all(chunk(ids, CHUNK_SIZE).map(load));
  return results.flat();
}

function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── raw loaders ───────────────────────────────────────────────────────────────

interface VisitViewRow {
  id: string | null;
  completed_at: string | null;
  worked_date: string | null;
  client_name: string | null;
  service_names: string | null;
  crew_name: string | null;
  men_count: number | null;
  budgeted_hours: number | null;
  man_hours: number | null;
  revenue_cents: number | null;
  actual_labor_cost_cents: number | null;
  labor_cost_source: string | null;
}

/** Completed visits in the window, from the reporting view. */
async function loadCompletedVisits(supabase: UntypedClient, window: VisitCostingWindow) {
  return fetchAllPages<VisitViewRow>((from, to) => {
    let q = supabase
      .from("rpt_job_visits")
      .select(
        "id, completed_at, worked_date, client_name, service_names, crew_name, men_count, budgeted_hours, man_hours, revenue_cents, actual_labor_cost_cents, labor_cost_source"
      )
      .eq("status", "completed")
      .not("completed_at", "is", null);
    if (window.from) q = q.gte("completed_at", window.from);
    // completed_at is timestamptz — a bare date casts to midnight, which
    // would drop almost all of the `to` day.
    if (window.to) q = q.lte("completed_at", `${window.to} ${SENTINEL_TS}`);
    return q.order("completed_at").order("id").range(from, to);
  });
}

interface VisitLinkRow {
  id: string;
  job_id: string;
  crew_id: string | null;
}

/**
 * rpt_job_visits exposes neither job_id nor crew_id, so read them from the
 * base table for the same window and join client-side by visit id.
 */
async function loadVisitLinks(supabase: Client, window: VisitCostingWindow) {
  return fetchAllPages<VisitLinkRow>((from, to) => {
    let q = supabase
      .from("crm_job_visits")
      .select("id, job_id, crew_id")
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .is("deleted_at", null);
    if (window.from) q = q.gte("completed_at", window.from);
    if (window.to) q = q.lte("completed_at", `${window.to} ${SENTINEL_TS}`);
    return q.order("id").range(from, to);
  });
}

interface MaterialRow {
  job_id: string;
  visit_id: string | null;
  total_cost_cents: number | null;
}

async function loadMaterials(supabase: Client, jobIds: string[]) {
  return fetchByIdChunks(jobIds, (idChunk) =>
    fetchAllPages<MaterialRow>((from, to) =>
      supabase
        .from("crm_job_materials")
        .select("job_id, visit_id, total_cost_cents")
        .in("job_id", idChunk)
        .is("deleted_at", null)
        .order("id")
        .range(from, to)
    )
  );
}

/** All-time completed-visit count per job (only for jobs that need pro-rating). */
async function loadCompletedVisitCounts(supabase: Client, jobIds: string[]) {
  const rows = await fetchByIdChunks(jobIds, (idChunk) =>
    fetchAllPages<{ id: string; job_id: string }>((from, to) =>
      supabase
        .from("crm_job_visits")
        .select("id, job_id")
        .in("job_id", idChunk)
        .eq("status", "completed")
        .is("deleted_at", null)
        .order("id")
        .range(from, to)
    )
  );
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.job_id, (counts.get(r.job_id) ?? 0) + 1);
  return counts;
}

interface ServiceShareRow {
  visit_id: string | null;
  service_id: string | null;
  service_name: string | null;
  budgeted_hours: number | null;
  /** qty × rate of the service line itself (0 for unpriced lines). */
  line_revenue_cents: number | null;
}

async function loadServiceRows(supabase: UntypedClient, visitIds: string[]) {
  return fetchByIdChunks(visitIds, (idChunk) =>
    fetchAllPages<ServiceShareRow>((from, to) =>
      supabase
        .from("rpt_job_services")
        .select("visit_id, service_id, service_name, budgeted_hours, line_revenue_cents")
        .in("visit_id", idChunk)
        .eq("visit_status", "completed")
        .order("id")
        .range(from, to)
    )
  );
}

async function loadServiceTargets(supabase: Client): Promise<Map<string, ServiceTarget>> {
  const rows = await fetchAllPages<{ id: string; name: string; target_rate_cents_per_hr: number | null }>(
    (from, to) =>
      supabase
        .from("crm_services")
        .select("id, name, target_rate_cents_per_hr")
        .is("deleted_at", null)
        .order("id")
        .range(from, to)
  );
  return new Map(
    rows.map((r) => [r.id, { id: r.id, name: r.name, targetRateCentsPerHr: num(r.target_rate_cents_per_hr) }])
  );
}

// ── pure attribution helpers ──────────────────────────────────────────────────

/** Normalize weights to fractions summing to 1; even split when all zero. */
export function normalizeShares(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return weights.map(() => 1 / weights.length);
  return weights.map((w) => Math.max(0, w) / total);
}

/**
 * Split an integer cent amount by fractional shares. Rounds each piece and
 * pushes the rounding drift onto the last piece so the parts always sum to
 * exactly `totalCents`.
 */
export function splitCents(totalCents: number, shares: number[]): number[] {
  if (shares.length === 0) return [];
  const parts = shares.map((s) => Math.round(totalCents * s));
  const drift = totalCents - parts.reduce((s, p) => s + p, 0);
  parts[parts.length - 1] += drift;
  return parts;
}

/**
 * Split a visit across its service lines by the lines' OWN prices (qty × rate),
 * so a $0 line never absorbs a priced visit; only when every line is unpriced
 * fall back to budgeted man-hours, then an even split. Mirrors
 * rpt_job_services.revenue_share.
 */
function buildServiceShares(rows: ServiceShareRow[]): VisitServiceShare[] {
  if (rows.length === 0) return [];
  let weights = rows.map((r) => num(r.line_revenue_cents));
  if (weights.every((w) => w <= 0)) weights = rows.map((r) => num(r.budgeted_hours));
  const shares = normalizeShares(weights);
  return rows.map((r, i) => ({
    serviceId: r.service_id,
    serviceName: r.service_name ?? "Unnamed service",
    share: shares[i],
  }));
}

function groupBy<T, K>(items: T[], key: (item: T) => K | null | undefined): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k == null) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

interface MaterialsByVisit {
  /** visit_id → cents logged directly against that visit. */
  direct: Map<string, number>;
  /** job_id → cents with no visit_id (to be pro-rated). */
  jobLevel: Map<string, number>;
}

function bucketMaterials(rows: MaterialRow[]): MaterialsByVisit {
  const direct = new Map<string, number>();
  const jobLevel = new Map<string, number>();
  for (const r of rows) {
    const cents = Math.round(num(r.total_cost_cents));
    if (r.visit_id) direct.set(r.visit_id, (direct.get(r.visit_id) ?? 0) + cents);
    else jobLevel.set(r.job_id, (jobLevel.get(r.job_id) ?? 0) + cents);
  }
  return { direct, jobLevel };
}

// ── orchestrator ──────────────────────────────────────────────────────────────

export async function loadVisitCosting(
  supabase: Client,
  window: VisitCostingWindow
): Promise<VisitCostingData> {
  // Views with columns newer than the generated types — see UntypedClient.
  const views = supabase as unknown as UntypedClient;

  const [visitRows, linkRows, services] = await Promise.all([
    loadCompletedVisits(views, window),
    loadVisitLinks(supabase, window),
    loadServiceTargets(supabase),
  ]);

  const links = new Map(linkRows.map((l) => [l.id, l]));
  const visitIds = visitRows.map((v) => v.id).filter((id): id is string => !!id);
  const jobIds = Array.from(new Set(linkRows.map((l) => l.job_id)));

  const [materialRows, serviceRows] = await Promise.all([
    loadMaterials(supabase, jobIds),
    loadServiceRows(views, visitIds),
  ]);

  const materials = bucketMaterials(materialRows);
  const completedCounts = await loadCompletedVisitCounts(
    supabase,
    Array.from(materials.jobLevel.keys())
  );
  const servicesByVisit = groupBy(serviceRows, (r) => r.visit_id);

  const visits: CostedVisit[] = [];
  for (const row of visitRows) {
    if (!row.id || !row.completed_at) continue;
    const link = links.get(row.id);
    const jobId = link?.job_id ?? null;
    const manHours = num(row.man_hours);

    const labor = resolveLabor(row.actual_labor_cost_cents, row.labor_cost_source);
    const materialsCents = resolveMaterials(row.id, jobId, materials, completedCounts);

    visits.push({
      visitId: row.id,
      jobId,
      clientName: row.client_name ?? "—",
      serviceNames: row.service_names ?? "—",
      crewName: row.crew_name,
      completedAt: row.completed_at,
      workedDate: row.worked_date ?? row.completed_at.slice(0, 10),
      menCount: Math.max(1, Math.round(num(row.men_count) || 1)),
      budgetedHours: round2(num(row.budgeted_hours)),
      manHours: round2(manHours),
      revenueCents: Math.round(num(row.revenue_cents)),
      laborCostCents: labor.cents,
      laborEstimated: labor.source === "estimated",
      laborSource: labor.source,
      materialsCostCents: materialsCents,
      services: buildServiceShares(servicesByVisit.get(row.id) ?? []),
    });
  }

  return { visits, services };
}

/**
 * rpt_job_visits already applies the labor fallback chain (clock-out actual →
 * crew rate → org rate → 0) and reports which layer won in labor_cost_source;
 * here we only normalise the flag. A missing/unknown flag with a positive
 * amount is treated as an actual (the pre-migration view had no flag).
 */
function resolveLabor(
  cents: number | null,
  source: string | null
): { cents: number; source: LaborCostSource } {
  const amount = Math.round(num(cents));
  if (source === "actual" || source === "estimated" || source === "none") {
    return { cents: amount, source };
  }
  return { cents: amount, source: amount > 0 ? "actual" : "none" };
}

function resolveMaterials(
  visitId: string,
  jobId: string | null,
  materials: MaterialsByVisit,
  completedCounts: Map<string, number>
): number {
  const direct = materials.direct.get(visitId) ?? 0;
  if (!jobId) return direct;
  const jobLevel = materials.jobLevel.get(jobId) ?? 0;
  if (jobLevel === 0) return direct;
  // This visit is itself completed, so the count is at least 1.
  const visitsCount = Math.max(1, completedCounts.get(jobId) ?? 1);
  return direct + Math.round(jobLevel / visitsCount);
}

/**
 * Man-hour-weighted target $/man-hr across a visit's services. Services with
 * no target (or no catalog link) contribute nothing and are excluded from the
 * weight so they don't drag the target toward zero. Returns 0 when nothing
 * has a target.
 */
export function weightedTargetRate(
  shares: VisitServiceShare[],
  services: Map<string, ServiceTarget>
): number {
  let weighted = 0;
  let weight = 0;
  for (const s of shares) {
    const target = s.serviceId ? services.get(s.serviceId)?.targetRateCentsPerHr ?? 0 : 0;
    if (target <= 0) continue;
    weighted += target * s.share;
    weight += s.share;
  }
  return weight > 0 ? Math.round(weighted / weight) : 0;
}

/** Percent 0–100 to one decimal; 0 when the denominator is not positive. */
export function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

/** Integer ratio (e.g. cents per hour); 0 when the denominator is not positive. */
export function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round(numerator / denominator) : 0;
}
