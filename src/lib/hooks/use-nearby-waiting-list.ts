"use client";

import { useCallback, useState } from "react";
import { useWaitingListJobs } from "@/lib/hooks/use-crm-jobs";
import { haversineMiles } from "@/lib/geo";
import type { CRMJobVisit } from "@/types/crm-jobs";

export interface NearbyWaitingListMatch {
  jobId: string;
  clientId: string;
  clientName: string | null;
  address: string;
  distanceMiles: number;
}

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
      const wlJobs = (waitingListJobs ?? []).filter((j) => j.jobType === "waiting_list");
      const scheduledJobIds = Array.from(new Set(todaysVisits.map((v) => v.jobId)));
      const waitingJobIds = wlJobs.map((j) => j.id);

      if (scheduledJobIds.length === 0 || waitingJobIds.length === 0) {
        setMatches([]);
        return;
      }

      const res = await fetch("/api/crm/jobs/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: [...scheduledJobIds, ...waitingJobIds] }),
      });
      const data = await res.json() as GeocodeResponseBody;
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to geocode jobs");
        setMatches([]);
        return;
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
          found.push({
            jobId: job.id,
            clientId: job.clientId,
            clientName: job.clientName ?? null,
            address: [job.serviceAddress, job.serviceCity, job.serviceState].filter(Boolean).join(", ") || (addressById.get(job.id) ?? ""),
            distanceMiles: Math.round(minDist * 10) / 10,
          });
        }
      }
      found.sort((a, b) => a.distanceMiles - b.distanceMiles);
      setMatches(found);
    } catch {
      setError("Failed to find nearby jobs");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [waitingListJobs, radiusMiles]);

  return { matches, loading, error, findNearby };
}
