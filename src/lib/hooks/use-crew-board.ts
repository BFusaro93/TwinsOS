"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { useAssets } from "@/lib/hooks/use-assets";
import { useVehicles } from "@/lib/hooks/use-vehicles";

// ── equipment = CMMS assets + CMMS vehicles ───────────────────────────────────
// Vehicles (trucks) live in their own table, so every equipment row points at
// exactly one of assets.id / vehicles.id.

export type EquipmentKind = "asset" | "vehicle";
export interface EquipmentRef {
  kind: EquipmentKind;
  id: string;
}

/** Stable map/Set key for an equipment ref. */
export function equipKey(ref: EquipmentRef): string {
  return `${ref.kind}:${ref.id}`;
}

export interface EquipmentItem {
  key: string;
  kind: EquipmentKind;
  id: string;
  name: string;
  tag: string | null;
  type: string | null;
  photoUrl: string | null;
  status: string;
  /** Truck/van/trailer — the "what pulls or carries the crew" group, listed first. */
  isVehicle: boolean;
  /** 0 trucks, 1 trailers, 2 everything else — display order. */
  rank: number;
}

function toItem(kind: EquipmentKind, row: { id: string; name: string; assetTag?: string | null; assetType?: string | null; photoUrl?: string | null; status: string }): EquipmentItem {
  const type = row.assetType ?? null;
  const trailer = /trailer/i.test(type ?? "");
  const truck = kind === "vehicle" || /truck|\bvan\b|pickup/i.test(type ?? "");
  return {
    key: equipKey({ kind, id: row.id }),
    kind,
    id: row.id,
    name: row.name,
    tag: row.assetTag || null,
    type,
    photoUrl: row.photoUrl ?? null,
    status: row.status,
    isVehicle: truck || trailer,
    rank: truck ? 0 : trailer ? 1 : 2,
  };
}

/** Every piece of equipment (assets and vehicles), sorted trucks → trailers → the rest. */
export function useEquipment() {
  const { data: assets = [] } = useAssets();
  const { data: vehicles = [] } = useVehicles();
  return useMemo(() => {
    const items = [...vehicles.map((v) => toItem("vehicle", v)), ...assets.map((a) => toItem("asset", a))];
    return items.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }, [assets, vehicles]);
}

/** Column/filter helpers so one code path serves both id columns. */
function refColumns(ref: EquipmentRef) {
  return ref.kind === "vehicle" ? { vehicle_id: ref.id, asset_id: null } : { asset_id: ref.id, vehicle_id: null };
}
function refColumnName(ref: EquipmentRef): "vehicle_id" | "asset_id" {
  return ref.kind === "vehicle" ? "vehicle_id" : "asset_id";
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refFromRow(row: any): EquipmentRef {
  return row.vehicle_id ? { kind: "vehicle", id: row.vehicle_id } : { kind: "asset", id: row.asset_id };
}

// ── per-job equipment ("what the crew needs to take") ──────────────────────────

export interface JobAsset {
  id: string;
  jobId: string;
  ref: EquipmentRef;
  key: string;
  notes: string | null;
  name: string;
  tag: string | null;
  type: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobAsset(row: any): JobAsset {
  const ref = refFromRow(row);
  const src = row.vehicles ?? row.assets;
  return {
    id: row.id,
    jobId: row.job_id,
    ref,
    key: equipKey(ref),
    notes: row.notes ?? null,
    name: src?.name ?? "Unknown equipment",
    tag: src?.asset_tag ?? null,
    type: src?.asset_type ?? null,
  };
}

const JOB_ASSET_SELECT =
  "id, job_id, asset_id, vehicle_id, notes, assets(name, asset_tag, asset_type), vehicles(name, asset_tag, asset_type)";

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
    mutationFn: async ({ jobId, ref, notes }: { jobId: string; ref: EquipmentRef; notes?: string | null }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_job_assets")
        .insert({ job_id: jobId, ...refColumns(ref), notes: notes ?? null });
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
  /** null = deliberately NOT on any crew that day (overrides the item's default crew). */
  crewId: string | null;
  ref: EquipmentRef;
  key: string;
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
        .select("id, crew_id, asset_id, vehicle_id, work_date")
        .eq("work_date", workDate);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const ref = refFromRow(r);
        return { id: r.id, crewId: r.crew_id, ref, key: equipKey(ref), workDate: r.work_date };
      }) as CrewDailyAsset[];
    },
    enabled: !!workDate,
  });
}

/** Put `ref` on `crewId` for `workDate`, replacing wherever it was that day. `crewId: null` = off every crew that day. */
export function useSetCrewDailyAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ref, crewId, workDate }: { ref: EquipmentRef; crewId: string | null; workDate: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_daily_assets")
        .upsert({ ...refColumns(ref), crew_id: crewId, work_date: workDate }, { onConflict: `work_date,${refColumnName(ref)}` });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-daily-assets"] }),
  });
}

/** Remove the day's override for `ref` — it falls back to its default crew (or the yard). */
export function useClearCrewDailyAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ref, workDate }: { ref: EquipmentRef; workDate: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_daily_assets")
        .delete()
        .eq(refColumnName(ref), ref.id)
        .eq("work_date", workDate);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-daily-assets"] }),
  });
}

// ── default equipment per crew ────────────────────────────────────────────────
// An item has at most one default crew. A day's crm_crew_daily_assets row, if
// any, overrides it (see the migration for the resolution rule).

export interface CrewDefaultAsset {
  crewId: string;
  ref: EquipmentRef;
  key: string;
}

export function useCrewDefaultAssets() {
  return useQuery({
    queryKey: ["crm-crew-default-assets"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("crm_crew_default_assets").select("crew_id, asset_id, vehicle_id");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const ref = refFromRow(r);
        return { crewId: r.crew_id, ref, key: equipKey(ref) };
      }) as CrewDefaultAsset[];
    },
  });
}

/** Make `crewId` the item's default crew (moves it if another crew had it). */
export function useSetCrewDefaultAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ref, crewId }: { ref: EquipmentRef; crewId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_crew_default_assets")
        .upsert({ ...refColumns(ref), crew_id: crewId }, { onConflict: refColumnName(ref) });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-default-assets"] }),
  });
}

export function useClearCrewDefaultAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ref }: { ref: EquipmentRef }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_crew_default_assets").delete().eq(refColumnName(ref), ref.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-crew-default-assets"] }),
  });
}
