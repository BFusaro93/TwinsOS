"use client";

import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

const CHUNK = 100;

/**
 * How many crew-app photos (crm_visit_photos) each visit has, for the dispatch board's
 * camera badge. Visits with none are absent from the map. Chunked so a long visit list
 * doesn't overflow the request URL.
 */
export function useVisitPhotoCounts(visitIds: string[]) {
  const key = [...visitIds].sort().join(",");
  const { data } = useQuery<Record<string, number>>({
    queryKey: ["visit-photo-counts", key],
    enabled: visitIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();
      const counts: Record<string, number> = {};
      for (let i = 0; i < visitIds.length; i += CHUNK) {
        const { data: rows, error } = await supabase
          .from("crm_visit_photos")
          .select("visit_id")
          .in("visit_id", visitIds.slice(i, i + CHUNK));
        if (error) throw new Error(error.message);
        for (const r of rows ?? []) counts[r.visit_id] = (counts[r.visit_id] ?? 0) + 1;
      }
      return counts;
    },
  });
  return data ?? {};
}
