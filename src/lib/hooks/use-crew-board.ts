"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

// ── per-job equipment ("what the crew needs to take") ──────────────────────────
// crm_job_assets rows reference the shared CMMS `assets` registry.

export interface JobAsset {
  id: string;
  jobId: string;
  assetId: string;
  notes: string | null;
  assetName: string;
  assetTag: string | null;
  assetType: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobAsset(row: any): JobAsset {
  return {
    id: row.id,
    jobId: row.job_id,
    assetId: row.asset_id,
    notes: row.notes ?? null,
    assetName: row.assets?.name ?? "Unknown asset",
    assetTag: row.assets?.asset_tag ?? null,
    assetType: row.assets?.asset_type ?? null,
  };
}

const JOB_ASSET_SELECT = "id, job_id, asset_id, notes, assets(name, asset_tag, asset_type)";

export function useJobAssets(jobId: string | undefined) {
  return useQuery({
    queryKey: ["crm-job-assets", "job", jobId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_assets")
        .select(JOB_ASSET_SELECT)
        .eq("job_id", jobId)
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapJobAsset) as JobAsset[];
    },
    enabled: !!jobId,
  });
}

/** Batched lookup for the Crew Board — one query for every job on the day. */
export function useJobAssetsForJobs(jobIds: string[]) {
  const key = [...jobIds].sort().join(",");
  return useQuery({
    queryKey: ["crm-job-assets", "jobs", key],
    queryFn: async () => {
      if (jobIds.length === 0) return [] as JobAsset[];
      const supabase = createClient();
      const out: JobAsset[] = [];
      // .in() puts every id in the URL, so chunk to stay under length limits.
      for (let i = 0; i < jobIds.length; i += 100) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("crm_job_assets")
          .select(JOB_ASSET_SELECT)
          .in("job_id", jobIds.slice(i, i + 100))
          .is("deleted_at", null);
        if (error) throw error;
        out.push(...(data ?? []).map(mapJobAsset));
      }
      return out;
    },
    enabled: jobIds.length > 0,
  });
}

export function useAddJobAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, assetId, notes }: { jobId: string; assetId: string; notes?: string | null }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_job_assets")
        .insert({ job_id: jobId, asset_id: assetId, notes: notes ?? null });
      // 23505 = already on the job (partial unique index) — idempotent add.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-job-assets"] }),
  });
}

export function useRemoveJobAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_job_assets")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-job-assets"] }),
  });
}

// ── per-day crew equipment (the truck / trailer / mowers loaded on a crew) ─────

export interface CrewDailyAsset {
  id: string;
  /** null = deliberately NOT on any crew that day (overrides the asset's default crew). */
  crewId: string | null;
  assetId: string;
  workDate: string;
}

export function useCrewDailyAssets(workDate: string) {
  return useQuery({
    queryKey: ["crm-crew-daily-assets", workDate],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_crew_daily_assets")
        .select("id, crew_id, asset_id, work_date")
        .eq("work_date", workDate);
      if (error) throw error;
      return (data ?? []).map((r: { id: string; crew_id: string | null; asset_id: string; work_date: string }) => ({
        id: r.id,
        crewId: r.crew_id,
        assetId: r.asset_id,
        workDate: r.work_date,
      })) as CrewDailyAsset[];
    },
    enabled: !!workDate,
  });
}

/** Put `assetId` on `crewId` for `workDate`, replacing wherever it was that day. `crewId: null` = off every crew that day. */
export function useSetCrewDailyAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, crewId, workDate }: { assetId: string; crewId: string | null; workDate: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_daily_assets")
        .upsert({ asset_id: assetId, crew_id: crewId, work_date: workDate }, { onConflict: "work_date,asset_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-daily-assets"] }),
  });
}

/** Take `assetId` off whichever crew holds it on `workDate`. */
export function useClearCrewDailyAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, workDate }: { assetId: string; workDate: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_daily_assets")
        .delete()
        .eq("asset_id", assetId)
        .eq("work_date", workDate);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-daily-assets"] }),
  });
}

// ── default equipment per crew ────────────────────────────────────────────────
// An asset has at most one default crew. A day's crm_crew_daily_assets row, if
// any, overrides it (see the migration for the resolution rule).

export interface CrewDefaultAsset {
  crewId: string;
  assetId: string;
}

export function useCrewDefaultAssets() {
  return useQuery({
    queryKey: ["crm-crew-default-assets"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("crm_crew_default_assets").select("crew_id, asset_id");
      if (error) throw error;
      return (data ?? []).map((r: { crew_id: string; asset_id: string }) => ({
        crewId: r.crew_id,
        assetId: r.asset_id,
      })) as CrewDefaultAsset[];
    },
  });
}

/** Make `crewId` the asset's default crew (moves it if another crew had it). */
export function useSetCrewDefaultAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, crewId }: { assetId: string; crewId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_default_assets")
        .upsert({ asset_id: assetId, crew_id: crewId }, { onConflict: "asset_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-default-assets"] }),
  });
}

export function useClearCrewDefaultAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId }: { assetId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_crew_default_assets").delete().eq("asset_id", assetId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-default-assets"] }),
  });
}
