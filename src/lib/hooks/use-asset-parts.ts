import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapAssetPart } from "@/lib/supabase/mappers";
import type { AssetPart } from "@/types/cmms";

export function useAssetParts(assetId: string | null) {
  return useQuery({
    queryKey: ["asset-parts", assetId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("asset_parts")
        .select("*")
        .eq("asset_id", assetId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data.map(mapAssetPart);
    },
    enabled: !!assetId,
  });
}

export function useAddAssetPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<AssetPart, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("asset_parts").insert({
        asset_id: input.assetId,
        part_id: input.partId,
        part_name: input.partName,
        part_number: input.partNumber,
      }).select().single();
      if (error) throw error;
      return mapAssetPart(data);
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["asset-parts", input.assetId] });
    },
  });
}

/** Inserts multiple asset_parts rows in one DB call.  Used when linking a
 *  part that has interchangeable alternates so all are added together. */
export function useBulkAddAssetParts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      inputs: Array<Omit<AssetPart, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">>
    ) => {
      if (inputs.length === 0) return [] as AssetPart[];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("asset_parts")
        .insert(
          inputs.map((input) => ({
            asset_id: input.assetId,
            part_id: input.partId,
            part_name: input.partName,
            part_number: input.partNumber,
          }))
        )
        .select();
      if (error) throw error;
      return data.map(mapAssetPart);
    },
    onSuccess: (results) => {
      const assetIds = new Set(results.map((r) => r.assetId));
      assetIds.forEach((id) =>
        queryClient.invalidateQueries({ queryKey: ["asset-parts", id] })
      );
    },
  });
}

export function useRemoveAssetPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assetId }: { id: string; assetId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("asset_parts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return assetId;
    },
    onSuccess: (assetId) => {
      queryClient.invalidateQueries({ queryKey: ["asset-parts", assetId] });
    },
  });
}

// ── Part-centric queries (for PartAssetsTab) ──────────────────────────────────

/** Returns all asset_parts rows where part_id === partId. */
export function usePartAssetLinks(partId: string) {
  return useQuery({
    queryKey: ["part-asset-links", partId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("asset_parts")
        .select("*")
        .eq("part_id", partId)
        .is("deleted_at", null);
      if (error) throw error;
      return data.map(mapAssetPart);
    },
    enabled: !!partId,
  });
}

/** Links an asset/vehicle to a part. Invalidates both the part-centric and asset-centric caches. */
export function useAddPartAssetLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<AssetPart, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("asset_parts")
        .insert({
          asset_id: input.assetId,
          part_id: input.partId,
          part_name: input.partName,
          part_number: input.partNumber,
        })
        .select()
        .single();
      if (error) throw error;
      return mapAssetPart(data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["part-asset-links", result.partId] });
      queryClient.invalidateQueries({ queryKey: ["asset-parts", result.assetId] });
    },
  });
}
