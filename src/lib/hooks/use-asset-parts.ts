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
      return (data.map(mapAssetPart)) as AssetPart[];
    },
    enabled: !!assetId,
  });
}

/** Inserts a fresh asset_parts row, or restores a previously soft-deleted one for
 *  the same (asset_id, part_id) pair — the table has a UNIQUE(asset_id, part_id)
 *  constraint that doesn't exempt soft-deleted rows, so a plain insert() fails
 *  with a duplicate-key error the moment a part is unlinked and then relinked
 *  to the same asset. */
async function upsertAssetPart(
  supabase: ReturnType<typeof createClient>,
  input: { assetId: string; partId: string; partName: string; partNumber: string }
) {
  const { data: existing } = await supabase
    .from("asset_parts")
    .select("id")
    .eq("asset_id", input.assetId)
    .eq("part_id", input.partId)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("asset_parts")
      .update({ deleted_at: null, part_name: input.partName, part_number: input.partNumber })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return mapAssetPart(data);
  }

  const { data, error } = await supabase.from("asset_parts").insert({
    asset_id: input.assetId,
    part_id: input.partId,
    part_name: input.partName,
    part_number: input.partNumber,
  }).select().single();
  if (error) throw error;
  return mapAssetPart(data);
}

export function useAddAssetPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<AssetPart, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      return upsertAssetPart(supabase, input);
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
      // Sequential, not a single bulk insert — any pair re-linking a
      // previously soft-deleted (asset_id, part_id) row needs the same
      // restore-instead-of-insert handling as useAddAssetPart, and a bulk
      // insert() would fail the whole batch on the first duplicate key.
      const results: AssetPart[] = [];
      for (const input of inputs) {
        results.push(await upsertAssetPart(supabase, input));
      }
      return results;
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
      return (data.map(mapAssetPart)) as AssetPart[];
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
      return upsertAssetPart(supabase, input);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["part-asset-links", result.partId] });
      queryClient.invalidateQueries({ queryKey: ["asset-parts", result.assetId] });
    },
  });
}
