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
      const data = await res.json() as { results?: GeocodeResult[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to geocode jobs");
        setMatches([]);
        return;
      }

      const coordsById = new Map((data.results ?? []).map((r) => [r.id, { lat: r.lat, lng: r.lng }]));
      const scheduledCoords = scheduledJobIds
        .map((id) => coordsById.get(id))
        .filter((c): c is { lat: number; lng: number } => !!c);

      if (scheduledCoords.length === 0) {
        setError("None of today's visits have a geocodable address.");
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
            address: [job.serviceAddress, job.serviceCity, job.serviceState].filter(Boolean).join(", "),
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
