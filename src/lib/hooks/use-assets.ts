import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapAsset } from "@/lib/supabase/mappers";
import type { Asset, AssetStatus } from "@/types/cmms";

function patchAssetCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Asset>) {
  queryClient.setQueryData<Asset[]>(["assets"], (old) =>
    old?.map((a) => a.id === id ? { ...a, ...patch } : a)
  );
}

export function useAssets() {
  return useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("assets").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return (data.map(mapAsset)) as Asset[];
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
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("assets").insert({
        created_by: user?.id ?? null,
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
        parent_vehicle_id: input.parentVehicleId,
        purchase_vendor_id: input.purchaseVendorId,
        purchase_vendor_name: input.purchaseVendorName,
        purchase_date: input.purchaseDate,
        purchase_price: input.purchasePrice,
        payment_method: input.paymentMethod,
        finance_institution: input.financeInstitution,
        location: input.location,
        photo_url: input.photoUrl,
        notes: input.notes,
        license_plate: input.licensePlate,
        warranty_start_date: input.warrantyStartDate,
        warranty_term_months: input.warrantyTermMonths,
        warranty_end_date: input.warrantyEndDate,
        warranty_notes: input.warrantyNotes,
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
        ...(input.engineModel !== undefined && { engine_model: input.engineModel }),
        ...(input.engineSerialNumber !== undefined && { engine_serial_number: input.engineSerialNumber }),
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
        ...(input.parentAssetId !== undefined && { parent_asset_id: input.parentAssetId }),
        ...(input.parentVehicleId !== undefined && { parent_vehicle_id: input.parentVehicleId }),
        ...(input.licensePlate !== undefined && { license_plate: input.licensePlate }),
        ...(input.warrantyStartDate !== undefined && { warranty_start_date: input.warrantyStartDate }),
        ...(input.warrantyTermMonths !== undefined && { warranty_term_months: input.warrantyTermMonths }),
        ...(input.warrantyEndDate !== undefined && { warranty_end_date: input.warrantyEndDate }),
        ...(input.warrantyNotes !== undefined && { warranty_notes: input.warrantyNotes }),
      }).eq("id", id).select().single();
      if (error) throw error;
      return mapAsset(data);
    },
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: ["assets"] });
      const previous = queryClient.getQueryData<Asset[]>(["assets"]);
      const patch: Partial<Asset> = {};
      if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;
      if (input.name !== undefined) patch.name = input.name;
      if (input.status !== undefined) patch.status = input.status;
      if (Object.keys(patch).length > 0) patchAssetCache(queryClient, id, patch);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<Asset[]>(["assets"], context.previous);
    },
    onSettled: (_, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["assets", id] });
      // Status changes move uptime.
      queryClient.invalidateQueries({ queryKey: ["asset-metrics"] });
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
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["assets"] });
      const previous = queryClient.getQueryData<Asset[]>(["assets"]);
      patchAssetCache(queryClient, id, { status });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<Asset[]>(["assets"], context.previous);
    },
    onSettled: (_, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["assets", id] });
      // Status changes move uptime.
      queryClient.invalidateQueries({ queryKey: ["asset-metrics"] });
    },
  });
}

const VALID_ASSET_STATUSES = new Set(["active", "inactive", "in_shop", "out_of_service", "disposed"]);

function normaliseAssetStatus(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return VALID_ASSET_STATUSES.has(s) ? s : "active";
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
          statusProvided: !!r.status?.trim(),
          name: r.name.trim(),
          asset_tag: r.assetTag.trim(),
          equipment_number: r.equipmentNumber?.trim() || null,
          asset_type: r.assetType?.trim() || "equipment",
          make: r.make?.trim() || null,
          model: r.model?.trim() || null,
          year: r.year ? parseInt(r.year) || null : null,
          serial_number: r.serialNumber?.trim() || null,
          license_plate: r.licensePlate?.trim() || null,
          location: r.location?.trim() || null,
          status: normaliseAssetStatus(r.status ?? ""),
          purchase_vendor_name: r.purchaseVendorName?.trim() || null,
          purchase_date: r.purchaseDate?.trim() || null,
          purchase_price: r.purchasePrice ? Math.round(parseFloat(r.purchasePrice) * 100) || null : null,
          payment_method: r.paymentMethod?.trim() || null,
          finance_institution: r.financeInstitution?.trim() || null,
        }));
      if (inserts.length === 0) return 0;

      // Insert one-by-one; on duplicate asset_tag, update the existing row
      let count = 0;
      for (const { statusProvided, ...row } of inserts) {
        const { error } = await supabase.from("assets").insert(row);
        if (error?.code === "23505") {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();
          const { error: updateErr } = await supabase.from("assets").update({
            name: row.name,
            equipment_number: row.equipment_number,
            asset_type: row.asset_type,
            make: row.make,
            model: row.model,
            year: row.year,
            serial_number: row.serial_number,
            license_plate: row.license_plate,
            location: row.location,
            // A blank status cell must not reset an in_shop/out_of_service
            // asset to "active" when a CSV is re-imported to update other fields.
            ...(statusProvided ? { status: row.status } : {}),
            purchase_vendor_name: row.purchase_vendor_name,
            purchase_date: row.purchase_date,
            purchase_price: row.purchase_price,
            // A blank financing cell must not wipe saved financing details when a
            // CSV is re-imported to update other fields (e.g. mileage/VIN).
            ...(row.payment_method ? { payment_method: row.payment_method } : {}),
            ...(row.finance_institution ? { finance_institution: row.finance_institution } : {}),
          }).eq("asset_tag", row.asset_tag).eq("org_id", profile!.org_id).is("deleted_at", null);
          if (updateErr) throw updateErr;
        } else if (error) {
          throw error;
        }
        count++;
      }
      return count;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const deletedAt = new Date().toISOString();

      // Block deletion while the asset still has open work orders — they would
      // otherwise be orphaned against a hidden asset.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: openWoCount, error: woErr } = await (supabase as any)
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("asset_id", id)
        .in("status", ["open", "on_hold", "in_progress"])
        .is("deleted_at", null);
      if (woErr) throw woErr;
      if ((openWoCount ?? 0) > 0) {
        throw new Error(
          `This asset has ${openWoCount} open work order${openWoCount === 1 ? "" : "s"}. Complete or cancel them before deleting the asset.`
        );
      }

      const { error } = await supabase.from("assets").update({ deleted_at: deletedAt }).eq("id", id);
      if (error) throw error;

      // Deactivate the asset's meters and any meter-threshold automations that
      // point at them, so readings/automations don't keep running for an asset
      // that no longer exists in the UI.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: assetMeters } = await (supabase as any)
        .from("meters")
        .update({ deleted_at: deletedAt })
        .eq("asset_id", id)
        .is("deleted_at", null)
        .select("id");
      const meterIds = new Set<string>(((assetMeters ?? []) as { id: string }[]).map((m) => m.id));
      if (meterIds.size > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: autos } = await (supabase as any)
          .from("automations")
          .select("id, trigger_config")
          .eq("trigger_type", "meter_threshold")
          .eq("enabled", true)
          .is("deleted_at", null);
        const toDisable = ((autos ?? []) as { id: string; trigger_config: Record<string, unknown> | null }[])
          .filter((a) => meterIds.has(String(a.trigger_config?.meter_id ?? "")))
          .map((a) => a.id);
        if (toDisable.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("automations").update({ enabled: false }).in("id", toDisable);
        }
      }

      // asset_parts rows cache the asset↔part link; without cleaning them up
      // here they go stale (and, since (asset_id, part_id) is UNIQUE, can
      // block re-linking the same part if the asset is ever restored/re-added).
      await supabase.from("asset_parts").update({ deleted_at: deletedAt }).eq("asset_id", id).is("deleted_at", null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-parts"] });
      queryClient.invalidateQueries({ queryKey: ["meters"] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
}
