"use client";

import { useQuery } from "@/lib/hooks/use-query";

export interface JobVisitPhoto {
  id: string;
  visitId: string;
  visitDate: string | null;
  caption: string | null;
  createdAt: string;
  url: string | null;
}

/** Photos the crew took on this job's visits from the crew app (crm_visit_photos). */
export function useJobVisitPhotos(jobId: string) {
  return useQuery<JobVisitPhoto[]>({
    queryKey: ["job-visit-photos", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const res = await fetch(`/api/crm/jobs/${jobId}/visit-photos`);
      if (!res.ok) throw new Error("Could not load crew photos");
      const json = (await res.json()) as { photos: JobVisitPhoto[] };
      return json.photos;
    },
  });
}
