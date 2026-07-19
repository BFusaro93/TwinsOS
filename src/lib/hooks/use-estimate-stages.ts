"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface EstimateStage {
  id: string;
  orgId: string;
  name: string;
  stageKey: string;
  probabilityBps: number;
  sortOrder: number;
  isDefault: boolean;
  isSystem: boolean;
  active: boolean;
}

const QUERY_KEY = ["estimate-stages"];

const DEFAULT_STAGES: Omit<EstimateStage, "id" | "orgId" | "active">[] = [
  { name: "Draft",      stageKey: "draft",    probabilityBps: 1000,  sortOrder: 0, isDefault: true,  isSystem: true },
  { name: "Quote Ready",stageKey: "quote",    probabilityBps: 3000,  sortOrder: 1, isDefault: false, isSystem: true },
  { name: "Sent",       stageKey: "sent",     probabilityBps: 5000,  sortOrder: 2, isDefault: false, isSystem: true },
  { name: "Accepted",   stageKey: "accepted", probabilityBps: 7000,  sortOrder: 3, isDefault: false, isSystem: true },
  { name: "Won",        stageKey: "won",      probabilityBps: 10000, sortOrder: 4, isDefault: false, isSystem: true },
  { name: "Lost",       stageKey: "lost",     probabilityBps: 0,     sortOrder: 5, isDefault: false, isSystem: true },
  { name: "Invoiced",   stageKey: "invoiced", probabilityBps: 10000, sortOrder: 6, isDefault: false, isSystem: true },
];

function toStage(row: Record<string, unknown>): EstimateStage {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    stageKey: row.stage_key as string,
    probabilityBps: row.probability_bps as number,
    sortOrder: row.sort_order as number,
    isDefault: row.is_default as boolean,
    isSystem: row.is_system as boolean,
    active: row.active as boolean,
  };
}

export function useEstimateStages() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("crm_estimate_stages")
        .select("*")
        .is("deleted_at", null)
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as Record<string, unknown>[]).map(toStage);
    },
  });
}

export function useUpsertEstimateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stage: Partial<EstimateStage> & { id?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const row: Record<string, unknown> = {};
      if (stage.name !== undefined) row.name = stage.name;
      if (stage.stageKey !== undefined) row.stage_key = stage.stageKey;
      if (stage.probabilityBps !== undefined) row.probability_bps = stage.probabilityBps;
      if (stage.sortOrder !== undefined) row.sort_order = stage.sortOrder;
      if (stage.isDefault !== undefined) row.is_default = stage.isDefault;
      if (stage.isSystem !== undefined) row.is_system = stage.isSystem;
      if (stage.active !== undefined) row.active = stage.active;

      if (stage.id) {
        const { data, error } = await supabase
          .from("crm_estimate_stages")
          .update(row)
          .eq("id", stage.id)
          .select()
          .single();
        if (error) throw error;
        return toStage(data as Record<string, unknown>);
      } else {
        const { data, error } = await supabase
          .from("crm_estimate_stages")
          .insert(row)
          .select()
          .single();
        if (error) throw error;
        return toStage(data as Record<string, unknown>);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteEstimateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("crm_estimate_stages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useSeedDefaultStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const rows = DEFAULT_STAGES.map((s) => ({
        name: s.name,
        stage_key: s.stageKey,
        probability_bps: s.probabilityBps,
        sort_order: s.sortOrder,
        is_default: s.isDefault,
        is_system: s.isSystem,
        active: true,
      }));
      const { error } = await supabase.from("crm_estimate_stages").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
