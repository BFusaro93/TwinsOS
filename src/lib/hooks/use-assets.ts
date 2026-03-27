import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapAsset } from "@/lib/supabase/mappers";
import type { Asset, AssetStatus } from "@/types/cmms";

export function useAssets() {
  return useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("assets").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return data.map(mapAsset);
    },
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ["assets", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("assets").select("*").eq("id", id).is("deleted_at", null).single();
      if (error) throw error;
      return mapAsset(data);
    },
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Asset, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("assets").insert({
        name: input.name,
        asset_tag: input.assetTag,
        equipment_number: input.equipmentNumber,
        asset_type: input.assetType,
        status: input.status,
        make: input.make,
        model: input.model,
        year: input.year,
        serial_number: input.serialNumber,
        engine_serial_number: input.engineSerialNumber,
        air_filter_part_number: input.airFilterPartNumber,
        oil_filter_part_number: input.oilFilterPartNumber,
        spark_plug_part_number: input.sparkPlugPartNumber,
        division: input.division,
        engine_model: input.engineModel,
        manufacturer: input.manufacturer,
        assigned_crew: input.assignedCrew,
        barcode: input.barcode,
        parent_asset_id: input.parentAssetId,
        purchase_vendor_id: input.purchaseVendorId,
        purchase_vendor_name: input.purchaseVendorName,
        purchase_date: input.purchaseDate,
        purchase_price: input.purchasePrice,
        payment_method: input.paymentMethod,
        finance_institution: input.financeInstitution,
        location: input.location,
        photo_url: input.photoUrl,
        notes: input.notes,
      }).select().single();
      if (error) throw error;
      return mapAsset(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Asset> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("assets").update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.assetTag !== undefined && { asset_tag: input.assetTag }),
        ...(input.equipmentNumber !== undefined && { equipment_number: input.equipmentNumber }),
        ...(input.assetType !== undefined && { asset_type: input.assetType }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.make !== undefined && { make: input.make }),
        ...(input.model !== undefined && { model: input.model }),
        ...(input.year !== undefined && { year: input.year }),
        ...(input.serialNumber !== undefined && { serial_number: input.serialNumber }),
        ...(input.division !== undefined && { division: input.division }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.assignedCrew !== undefined && { assigned_crew: input.assignedCrew }),
        ...(input.purchaseVendorId !== undefined && { purchase_vendor_id: input.purchaseVendorId }),
        ...(input.purchaseVendorName !== undefined && { purchase_vendor_name: input.purchaseVendorName }),
        ...(input.purchaseDate !== undefined && { purchase_date: input.purchaseDate }),
        ...(input.purchasePrice !== undefined && { purchase_price: input.purchasePrice }),
        ...(input.paymentMethod !== undefined && { payment_method: input.paymentMethod }),
        ...(input.financeInstitution !== undefined && { finance_institution: input.financeInstitution }),
        ...(input.photoUrl !== undefined && { photo_url: input.photoUrl }),
        ...(input.barcode !== undefined && { barcode: input.barcode }),
      }).eq("id", id).select().single();
      if (error) throw error;
      return mapAsset(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["assets", id] });
    },
  });
}

export function useUpdateAssetStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AssetStatus }) => {
      const supabase = createClient();
      const { error } = await supabase.from("assets").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["assets", id] });
    },
  });
}

const VALID_ASSET_STATUSES = new Set(["in_service", "out_of_service", "under_maintenance", "retired"]);

function normaliseAssetStatus(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return VALID_ASSET_STATUSES.has(s) ? s : "in_service";
}

/**
 * Bulk-inserts assets from a CSV import.
 * Rows missing `name` or `assetTag` are silently skipped.
 */
export function useBulkImportAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const inserts = rows
        .filter((r) => r.name?.trim() && r.assetTag?.trim())
        .map((r) => ({
          name: r.name.trim(),
          asset_tag: r.assetTag.trim(),
          equipment_number: r.equipmentNumber?.trim() || null,
          asset_type: r.assetType?.trim() || "equipment",
          make: r.make?.trim() || null,
          model: r.model?.trim() || null,
          year: r.year ? parseInt(r.year) || null : null,
          serial_number: r.serialNumber?.trim() || null,
          location: r.location?.trim() || null,
          status: normaliseAssetStatus(r.status ?? ""),
        }));
      if (inserts.length === 0) return 0;
      const { error } = await supabase.from("assets").upsert(inserts, { onConflict: "org_id,asset_tag" });
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}
