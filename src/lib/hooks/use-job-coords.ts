"use client";

import { useQuery } from "@/lib/hooks/use-query";

export interface JobCoord {
  lat: number;
  lng: number;
}

interface GeocodeBody {
  results?: { id: string; lat: number; lng: number }[];
  googleError?: string | null;
  error?: string;
}

/**
 * Coordinates for a set of CRM jobs, resolved (and cached back onto crm_jobs) by
 * /api/crm/jobs/geocode — same address fallback chain the route optimizer uses. Jobs that already
 * carry cached lat/lng are passed in via `known` and never re-requested.
 */
export function useJobCoords(jobIds: string[], known: Map<string, JobCoord>, enabled = true) {
  const missing = Array.from(new Set(jobIds.filter((id) => !known.has(id)))).sort();
  return useQuery({
    queryKey: ["job-coords", missing],
    enabled: enabled && missing.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{ coords: Map<string, JobCoord>; googleError: string | null }> => {
      const coords = new Map<string, JobCoord>();
      let googleError: string | null = null;
      // The endpoint caps a request at 200 jobs.
      for (let i = 0; i < missing.length; i += 200) {
        const res = await fetch("/api/crm/jobs/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobIds: missing.slice(i, i + 200) }),
        });
        const body = (await res.json().catch(() => ({}))) as GeocodeBody;
        if (body.googleError) googleError = body.googleError;
        for (const r of body.results ?? []) coords.set(r.id, { lat: r.lat, lng: r.lng });
        if (!res.ok && !body.results?.length) throw new Error(body.error ?? "Failed to locate jobs");
      }
      return { coords, googleError };
    },
  });
}
