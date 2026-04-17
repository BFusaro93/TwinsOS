import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPMScheduleAsset, mapPMScheduleAssetPart } from "@/lib/supabase/mappers";
import type { PMScheduleAsset, PMScheduleAssetPart } from "@/types/cmms";

// ── PM Schedule Assets ────────────────────────────────────────────────────────

export function usePMScheduleAssets(pmScheduleId: string) {
  return useQuery({
    queryKey: ["pm-schedule-assets", pmScheduleId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedule_assets")
        .select("*")
        .eq("pm_schedule_id", pmScheduleId)
        .is("deleted_at", null)
        .order("asset_name");
      if (error) throw error;
      return data.map(mapPMScheduleAsset);
    },
    enabled: !!pmScheduleId,
  });
}

export function useAddPMScheduleAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pmScheduleId: string;
      assetId: string;
      assetName: string;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedule_assets")
        .insert({
          pm_schedule_id: input.pmScheduleId,
          asset_id: input.assetId,
          asset_name: input.assetName,
        })
        .select()
        .single();
      if (error) throw error;
      return mapPMScheduleAsset(data);
    },
    onSuccess: (_, { pmScheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ["pm-schedule-assets", pmScheduleId] });
    },
    onError: (err) => console.error("[useAddPMScheduleAsset]", err),
  });
}

export function useRemovePMScheduleAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pmScheduleId }: { id: string; pmScheduleId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("pm_schedule_assets")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { pmScheduleId };
    },
    onSuccess: (_, { pmScheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ["pm-schedule-assets", pmScheduleId] });
    },
  });
}

// ── PM Schedule Asset Parts ───────────────────────────────────────────────────

export function usePMScheduleAssetParts(pmScheduleAssetId: string) {
  return useQuery({
    queryKey: ["pm-schedule-asset-parts", pmScheduleAssetId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedule_asset_parts")
        .select("*")
        .eq("pm_schedule_asset_id", pmScheduleAssetId)
        .is("deleted_at", null)
        .order("part_name");
      if (error) throw error;
      return data.map(mapPMScheduleAssetPart);
    },
    enabled: !!pmScheduleAssetId,
  });
}

export function useAddPMScheduleAssetPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pmScheduleAssetId: string;
      partId: string | null;
      partName: string;
      partNumber: string;
      quantity: number;
      unitCost: number;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedule_asset_parts")
        .insert({
          pm_schedule_asset_id: input.pmScheduleAssetId,
          part_id: input.partId,
          part_name: input.partName,
          part_number: input.partNumber,
          quantity: input.quantity,
          unit_cost: input.unitCost,
        })
        .select()
        .single();
      if (error) throw error;
      return mapPMScheduleAssetPart(data);
    },
    onSuccess: (_, { pmScheduleAssetId }) => {
      queryClient.invalidateQueries({ queryKey: ["pm-schedule-asset-parts", pmScheduleAssetId] });
    },
    onError: (err) => console.error("[useAddPMScheduleAssetPart]", err),
  });
}

export function useUpdatePMScheduleAssetPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      pmScheduleAssetId,
      quantity,
      unitCost,
    }: {
      id: string;
      pmScheduleAssetId: string;
      quantity?: number;
      unitCost?: number;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedule_asset_parts")
        .update({
          ...(quantity !== undefined && { quantity }),
          ...(unitCost !== undefined && { unit_cost: unitCost }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapPMScheduleAssetPart(data);
    },
    onSuccess: (_, { pmScheduleAssetId }) => {
      queryClient.invalidateQueries({ queryKey: ["pm-schedule-asset-parts", pmScheduleAssetId] });
    },
  });
}

export function useDeletePMScheduleAssetPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pmScheduleAssetId }: { id: string; pmScheduleAssetId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("pm_schedule_asset_parts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { pmScheduleAssetId };
    },
    onSuccess: (_, { pmScheduleAssetId }) => {
      queryClient.invalidateQueries({ queryKey: ["pm-schedule-asset-parts", pmScheduleAssetId] });
    },
  });
}

// Re-export types for convenience
export type { PMScheduleAsset, PMScheduleAssetPart };
