import { haversineMiles, type LatLng } from "@/lib/geo";
import type { CRMJob } from "@/types/crm-jobs";

/** Filters for the Master Route builder's "find jobs for this route" search. */
export interface RouteJobFilters {
  /** Free text: client name, address, city, zip. */
  query: string;
  /** Exact service name, or "" for any. */
  service: string;
  /** Zip / postal code prefix ("48" matches 48104). Several can be comma-separated. */
  zip: string;
  /** Only jobs that are not a stop on any route. */
  notOnRoute: boolean;
  /** Proximity: centre and radius in miles. Both must be set to apply. */
  center: LatLng | null;
  radiusMiles: number | null;
}

export const EMPTY_ROUTE_JOB_FILTERS: RouteJobFilters = {
  query: "",
  service: "",
  zip: "",
  notOnRoute: true,
  center: null,
  radiusMiles: null,
};

export interface RouteJobMatch {
  job: CRMJob;
  /** Straight-line miles from the proximity centre (null when no centre or no coords). */
  miles: number | null;
}

export function jobServiceNames(job: CRMJob): string[] {
  return (job.services ?? []).map((s) => s.serviceName).filter(Boolean);
}

/**
 * Applies the builder's filters. `routeJobIds` is every job that is already a
 * stop on any route (a job is on at most one route). `coordOf` supplies
 * coordinates for the proximity filter; a job with none can't be placed, so a
 * proximity search leaves it out rather than guessing.
 */
export function filterRouteJobs(
  jobs: CRMJob[],
  f: RouteJobFilters,
  routeJobIds: Set<string>,
  coordOf: (job: CRMJob) => LatLng | null
): RouteJobMatch[] {
  const q = f.query.trim().toLowerCase();
  const zips = f.zip.split(/[,\s]+/).map((z) => z.trim()).filter(Boolean);
  const out: RouteJobMatch[] = [];
  for (const job of jobs) {
    if (f.notOnRoute && routeJobIds.has(job.id)) continue;
    if (f.service && !jobServiceNames(job).includes(f.service)) continue;
    if (zips.length > 0) {
      const z = (job.serviceZip ?? "").trim();
      if (!zips.some((p) => z.startsWith(p))) continue;
    }
    if (q) {
      const hay = [job.clientName, job.serviceAddress, job.serviceCity, job.serviceZip].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) continue;
    }
    let miles: number | null = null;
    if (f.center && f.radiusMiles != null) {
      const c = coordOf(job);
      if (!c) continue;
      miles = haversineMiles(f.center, c);
      if (miles > f.radiusMiles) continue;
    }
    out.push({ job, miles });
  }
  // Nearest first when searching by proximity, otherwise by client name.
  out.sort((a, b) =>
    a.miles != null && b.miles != null
      ? a.miles - b.miles
      : (a.job.clientName ?? "").localeCompare(b.job.clientName ?? "")
  );
  return out;
}

/** Moves the id at `from` so it ends up at 1-based position `toPosition` (clamped). */
export function moveToPosition<T>(items: T[], from: number, toPosition: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const to = Math.min(Math.max(Math.round(toPosition) - 1, 0), items.length - 1);
  if (to === from) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
