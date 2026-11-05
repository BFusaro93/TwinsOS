"use client";

import { useCallback, useState } from "react";
import { useWaitingListJobs } from "@/lib/hooks/use-crm-jobs";
import { haversineMiles } from "@/lib/geo";
import { checkPackageMinDaysViolation } from "@/lib/package-visit-recalc";
import { createClient } from "@/lib/supabase/client";
import type { CRMJob, CRMJobService, CRMJobVisit } from "@/types/crm-jobs";

export interface NearbyWaitingListMatch {
  jobId: string;
  clientId: string;
  clientName: string | null;
  address: string;
  distanceMiles: number;
  /** Services still waiting for a visit when the job is dispatched one visit
   *  per service (more than one service, or already split). Empty means the
   *  job goes out as a single whole-job visit. */
  pendingServices: CRMJobService[];
  /** Package job: its next due step. Schedule Today MOVES this step's
   *  placeholder visit to the day (as the Waiting List's dispatch does) —
   *  it never creates a visit. */
  packageStep?: { visitId: string; serviceName: string; stepNumber: number };
}

/** A package job's next step still on the Waiting List, when it can go out on
 *  `targetDate`: the lowest-ordered step left on the list (the list has
 *  already dropped dispatched steps), whose window has opened and not passed
 *  (the same window the Waiting List rows use), and which still holds its
 *  placeholder visit somewhere other than that day. Min Days is checked later,
 *  only for jobs that turn out to be nearby. */
function nextDuePackageStep(job: CRMJob, targetDate: string): { service: CRMJobService; visitId: string } | null {
  const next = [...(job.services ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!next) return null;
  if (next.startDate && next.startDate > targetDate) return null;
  if (next.completeByDate && next.completeByDate < targetDate) return null;
  const placeholder = (job.visits ?? []).find((v) => v.jobServiceId === next.id && v.status === "scheduled");
  if (!placeholder || placeholder.scheduledDate === targetDate) return null;
  return { service: next, visitId: placeholder.id };
}

/** Jobs per /api/crm/jobs/geocode request (the endpoint's cap). */
const GEOCODE_BATCH = 200;

interface GeocodeResult {
  id: string;
  lat: number;
  lng: number;
  /** The address that was geocoded (job → property → client fallback chain). */
  address?: string;
}

interface GeocodeResponseBody {
  results?: GeocodeResult[];
  /** Per-job reasons for jobs that could not be placed on the map. */
  unresolved?: { id: string; reason: string }[];
  /** Google Geocoding API failure (invalid key, quota, ...) — shown verbatim to the user. */
  googleError?: string | null;
  error?: string;
}

/** Finds waiting-list jobs within `radiusMiles` of any of today's scheduled visits —
 *  a free local proximity check (see src/lib/geo.ts), distinct from the paid
 *  Distance Matrix route-optimize endpoint which sequences stops already on the board. */
export function useNearbyWaitingListJobs(radiusMiles = 3, targetDate?: string) {
  const { data: waitingListJobs } = useWaitingListJobs(targetDate, targetDate);
  const [matches, setMatches] = useState<NearbyWaitingListMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findNearby = useCallback(async (todaysVisits: CRMJobVisit[]) => {
    setLoading(true);
    setError(null);
    try {
      // Package jobs qualify only through their next due step (see
      // nextDuePackageStep); a package with nothing due that day is left out
      // before geocoding.
      const packageSteps = new Map<string, { service: CRMJobService; visitId: string }>();
      const wlJobs = (waitingListJobs ?? []).filter((j) => {
        if (j.jobType === "waiting_list") return true;
        if (j.jobType !== "package" || !targetDate) return false;
        const step = nextDuePackageStep(j, targetDate);
        if (step) packageSteps.set(j.id, step);
        return !!step;
      });
      const scheduledJobIds = Array.from(new Set(todaysVisits.map((v) => v.jobId)));
      const waitingJobIds = wlJobs.map((j) => j.id);

      if (scheduledJobIds.length === 0 || waitingJobIds.length === 0) {
        setMatches([]);
        return;
      }

      // The geocode endpoint takes at most 200 jobs per request; a large waiting list
      // got "Too many jobs" every time, so the ids go in batches and the answers merge.
      const allIds = Array.from(new Set([...scheduledJobIds, ...waitingJobIds]));
      const data: GeocodeResponseBody = { results: [], unresolved: [], googleError: null };
      for (let i = 0; i < allIds.length; i += GEOCODE_BATCH) {
        const res = await fetch("/api/crm/jobs/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: allIds.slice(i, i + GEOCODE_BATCH) }),
        });
        const part = (await res.json().catch(() => ({}))) as GeocodeResponseBody;
        if (!res.ok || part.error) {
          setError(part.error ?? "Failed to geocode jobs");
          setMatches([]);
          return;
        }
        data.results!.push(...(part.results ?? []));
        data.unresolved!.push(...(part.unresolved ?? []));
        if (part.googleError) data.googleError = part.googleError;
      }

      const coordsById = new Map((data.results ?? []).map((r) => [r.id, { lat: r.lat, lng: r.lng }]));
      const addressById = new Map((data.results ?? []).map((r) => [r.id, r.address ?? ""]));
      const scheduledCoords = scheduledJobIds
        .map((id) => coordsById.get(id))
        .filter((c): c is { lat: number; lng: number } => !!c);

      if (scheduledCoords.length === 0) {
        // Say WHY nothing could be placed — a Google-side failure (bad key,
        // quota) used to be swallowed into this generic message.
        if (data.googleError) {
          setError(`Google Maps could not geocode today's visits: ${data.googleError}`);
        } else {
          const reasons = (data.unresolved ?? []).filter((u) => scheduledJobIds.includes(u.id));
          const noAddress = reasons.filter((u) => u.reason === "no_address").length;
          setError(
            noAddress === reasons.length && noAddress > 0
              ? "None of today's visits have an address on file (job, property, or client billing address)."
              : "None of today's visits could be located on the map."
          );
        }
        setMatches([]);
        return;
      }
      if (data.googleError && wlJobs.every((j) => !coordsById.has(j.id))) {
        setError(`Google Maps could not geocode the waiting-list jobs: ${data.googleError}`);
        setMatches([]);
        return;
      }

      const found: NearbyWaitingListMatch[] = [];
      for (const job of wlJobs) {
        const coord = coordsById.get(job.id);
        if (!coord) continue;
        const minDist = Math.min(...scheduledCoords.map((sc) => haversineMiles(coord, sc)));
        if (minDist <= radiusMiles) {
          if (job.jobType === "package") {
            const step = packageSteps.get(job.id);
            if (!step) continue;
            found.push({
              jobId: job.id,
              clientId: job.clientId,
              clientName: job.clientName ?? null,
              address: [job.serviceAddress, job.serviceCity, job.serviceState].filter(Boolean).join(", ") || (addressById.get(job.id) ?? ""),
              distanceMiles: Math.round(minDist * 10) / 10,
              pendingServices: [],
              packageStep: { visitId: step.visitId, serviceName: step.service.serviceName, stepNumber: 0 },
            });
            continue;
          }
          found.push({
            jobId: job.id,
            clientId: job.clientId,
            clientName: job.clientName ?? null,
            address: [job.serviceAddress, job.serviceCity, job.serviceState].filter(Boolean).join(", ") || (addressById.get(job.id) ?? ""),
            distanceMiles: Math.round(minDist * 10) / 10,
            // Same rule as the Waiting List's own dispatch: a split job must get
            // one visit per remaining service — a whole-job visit would bill
            // every service again, or none if one was already invoiced.
            pendingServices:
              (job.services ?? []).length > 1 || (job.visits ?? []).some((v) => v.jobServiceId)
                ? job.services ?? []
                : [],
          });
        }
      }
      // Nearby package steps: number each step within its job and drop any whose
      // Min Days since the previous step isn't met yet on that day — the same
      // check the visit update makes, so Schedule Today never offers a move the
      // database would refuse.
      const packageMatches = found.filter((m) => m.packageStep);
      if (packageMatches.length > 0 && targetDate) {
        const supabase = createClient();
        const { data: stepRows } = await supabase
          .from("crm_job_services")
          .select("id, job_id, sort_order")
          .in("job_id", packageMatches.map((m) => m.jobId));
        const steps = (stepRows ?? []) as { id: string; job_id: string; sort_order: number }[];
        const blocked = new Set<string>();
        await Promise.all(
          packageMatches.map(async (m) => {
            const step = packageSteps.get(m.jobId);
            if (!step || !m.packageStep) return;
            const ordered = steps.filter((s) => s.job_id === m.jobId).sort((a, b) => a.sort_order - b.sort_order);
            m.packageStep.stepNumber = ordered.findIndex((s) => s.id === step.service.id) + 1;
            const violation = await checkPackageMinDaysViolation(supabase, step.visitId, targetDate);
            if (violation) blocked.add(m.jobId);
          })
        );
        found.splice(0, found.length, ...found.filter((m) => !blocked.has(m.jobId)));
      }
      found.sort((a, b) => a.distanceMiles - b.distanceMiles);
      setMatches(found);
    } catch {
      setError("Failed to find nearby jobs");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [waitingListJobs, radiusMiles, targetDate]);

  return { matches, loading, error, findNearby };
}
