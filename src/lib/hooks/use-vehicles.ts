import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapVehicle } from "@/lib/supabase/mappers";
import type { Vehicle, AssetStatus } from "@/types/cmms";

function patchVehicleCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Vehicle>) {
  queryClient.setQueryData<Vehicle[]>(["vehicles"], (old) =>
    old?.map((v) => v.id === id ? { ...v, ...patch } : v) ?? []
  );
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("vehicles").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return data.map(mapVehicle);
    },
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: ["vehicles", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("vehicles").select("*").eq("id", id).is("deleted_at", null).single();
      if (error) throw error;
      return mapVehicle(data);
    },
    enabled: !!id,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Vehicle, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("vehicles").insert({
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
        division: input.division,
        assigned_crew: input.assignedCrew,
        barcode: input.barcode,
        purchase_vendor_id: input.purchaseVendorId,
        purchase_vendor_name: input.purchaseVendorName,
        purchase_date: input.purchaseDate,
        purchase_price: input.purchasePrice,
        payment_method: input.paymentMethod,
        finance_institution: input.financeInstitution,
        engine_model: input.engineModel,
        air_filter_part_number: input.airFilterPartNumber,
        oil_filter_part_number: input.oilFilterPartNumber,
        spark_plug_part_number: input.sparkPlugPartNumber,
        location: input.location,
        photo_url: input.photoUrl,
        notes: input.notes,
        license_plate: input.licensePlate,
        vin: input.vin,
        fuel_type: input.fuelType,
        next_oil_change_due: input.nextOilChangeDue,
        next_oil_change_mileage: input.nextOilChangeMileage,
        next_inspection_sticker_due: input.nextInspectionStickerDue,
      }).select().single();
      if (error) throw error;
      return mapVehicle(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
    onError: (err) => console.error("[useCreateVehicle]", err),
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Vehicle> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("vehicles").update({
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
        ...(input.licensePlate !== undefined && { license_plate: input.licensePlate }),
        ...(input.vin !== undefined && { vin: input.vin }),
        ...(input.engineModel !== undefined && { engine_model: input.engineModel }),
        ...(input.financeInstitution !== undefined && { finance_institution: input.financeInstitution }),
        ...(input.airFilterPartNumber !== undefined && { air_filter_part_number: input.airFilterPartNumber }),
        ...(input.oilFilterPartNumber !== undefined && { oil_filter_part_number: input.oilFilterPartNumber }),
        ...(input.sparkPlugPartNumber !== undefined && { spark_plug_part_number: input.sparkPlugPartNumber }),
        ...(input.fuelType !== undefined && { fuel_type: input.fuelType }),
        ...(input.nextOilChangeDue !== undefined && { next_oil_change_due: input.nextOilChangeDue }),
        ...(input.nextOilChangeMileage !== undefined && { next_oil_change_mileage: input.nextOilChangeMileage }),
        ...(input.nextInspectionStickerDue !== undefined && { next_inspection_sticker_due: input.nextInspectionStickerDue }),
        ...(input.purchaseVendorId !== undefined && { purchase_vendor_id: input.purchaseVendorId }),
        ...(input.purchaseVendorName !== undefined && { purchase_vendor_name: input.purchaseVendorName }),
        ...(input.purchaseDate !== undefined && { purchase_date: input.purchaseDate }),
        ...(input.purchasePrice !== undefined && { purchase_price: input.purchasePrice }),
        ...(input.paymentMethod !== undefined && { payment_method: input.paymentMethod }),
        ...(input.photoUrl !== undefined && { photo_url: input.photoUrl }),
        ...(input.barcode !== undefined && { barcode: input.barcode }),
      }).eq("id", id).select().single();
      if (error) throw error;
      return mapVehicle(data);
    },
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: ["vehicles"] });
      const previous = queryClient.getQueryData<Vehicle[]>(["vehicles"]);
      // Optimistically apply only the fields being changed
      const patch: Partial<Vehicle> = {};
      if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;
      if (input.name !== undefined) patch.name = input.name;
      if (input.status !== undefined) patch.status = input.status;
      if (Object.keys(patch).length > 0) patchVehicleCache(queryClient, id, patch);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<Vehicle[]>(["vehicles"], context.previous);
    },
    onSettled: (_, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles", id] });
    },
  });
}

export function useUpdateVehicleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AssetStatus }) => {
      const supabase = createClient();
      const { error } = await supabase.from("vehicles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles", id] });
    },
  });
}

const VALID_VEHICLE_STATUSES = new Set(["in_service", "out_of_service", "under_maintenance", "retired"]);

function normaliseVehicleStatus(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return VALID_VEHICLE_STATUSES.has(s) ? s : "in_service";
}

/**
 * Bulk-inserts vehicles from a CSV import.
 * Rows missing `name` or `assetTag` are silently skipped.
 */
export function useBulkImportVehicles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const inserts = rows
        .filter((r) => r.name?.trim() && r.assetTag?.trim())
        .map((r) => ({
          name: r.name.trim(),
          asset_tag: r.assetTag.trim(),
          make: r.make?.trim() || null,
          model: r.model?.trim() || null,
          year: r.year ? parseInt(r.year) || null : null,
          license_plate: r.licensePlate?.trim() || null,
          vin: r.vin?.trim() || null,
          fuel_type: r.fuelType?.trim() || null,
          status: normaliseVehicleStatus(r.status ?? ""),
          assigned_crew: r.assignedCrew?.trim() || null,
          asset_type: "vehicle",
        }));
      if (inserts.length === 0) return 0;
      const { error } = await supabase.from("vehicles").upsert(inserts, { onConflict: "org_id,asset_tag" });
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("vehicles").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}
