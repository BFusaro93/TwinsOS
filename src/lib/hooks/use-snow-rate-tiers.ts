"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SnowRateTier {
  id: string;
  jobId: string;
  sortOrder: number;
  minInches: number;
  /** null = open-ended top tier, billed at ratePerInchCents * storm depth. */
  maxInches: number | null;
  rateCents: number | null;
  ratePerInchCents: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTier(row: any): SnowRateTier {
  return {
    id: row.id,
    jobId: row.job_id,
    sortOrder: row.sort_order,
    minInches: Number(row.min_inches),
    maxInches: row.max_inches != null ? Number(row.max_inches) : null,
    rateCents: row.rate_cents ?? null,
    ratePerInchCents: row.rate_per_inch_cents ?? null,
  };
}

/** Batch-loads tiers for many jobs at once (e.g. every "per_event_per_inch"
 *  job showing up in the Snow Invoicing queue) instead of one query per job. */
export function useSnowRateTiersForJobs(jobIds: string[]) {
  const key = [...new Set(jobIds)].sort().join(",");
  return useQuery({
    queryKey: ["snow-rate-tiers", "by-jobs", key],
    queryFn: async (): Promise<Map<string, SnowRateTier[]>> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_snow_rate_tiers")
        .select("*")
        .in("job_id", [...new Set(jobIds)])
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const byJob = new Map<string, SnowRateTier[]>();
      for (const row of (data as unknown[]).map(mapTier)) {
        if (!byJob.has(row.jobId)) byJob.set(row.jobId, []);
        byJob.get(row.jobId)!.push(row);
      }
      return byJob;
    },
    enabled: jobIds.length > 0,
  });
}

export function useSnowRateTiers(jobId: string) {
  return useQuery({
    queryKey: ["snow-rate-tiers", jobId],
    queryFn: async (): Promise<SnowRateTier[]> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_snow_rate_tiers")
        .select("*")
        .eq("job_id", jobId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as unknown[]).map(mapTier);
    },
    enabled: !!jobId,
  });
}

export interface TierInput {
  minInches: number;
  maxInches: number | null;
  rateCents: number | null;
  ratePerInchCents: number | null;
}

/** Replaces a job's entire tier set in one call — simplest consistent model
 *  for a short, fully-reordered list edited inline (add/remove/reorder all
 *  touch the whole set anyway). */
export function useSaveSnowRateTiers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, tiers }: { jobId: string; tiers: TierInput[] }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (supabase as any)
        .from("crm_snow_rate_tiers")
        .delete()
        .eq("job_id", jobId);
      if (delErr) throw delErr;

      if (tiers.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: job } = await (supabase as any)
        .from("crm_jobs")
        .select("org_id")
        .eq("id", jobId)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabase as any).from("crm_snow_rate_tiers").insert(
        tiers.map((t, i) => ({
          org_id: job?.org_id,
          job_id: jobId,
          sort_order: i,
          min_inches: t.minInches,
          max_inches: t.maxInches,
          rate_cents: t.rateCents,
          rate_per_inch_cents: t.ratePerInchCents,
        }))
      );
      if (insErr) throw insErr;
    },
    onSuccess: (_d, { jobId }) => {
      qc.invalidateQueries({ queryKey: ["snow-rate-tiers", jobId] });
    },
  });
}
