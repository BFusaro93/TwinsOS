import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapVehicle } from "@/lib/supabase/mappers";
import { parseCsvDollarsToCents, type BulkImportResult } from "@/lib/csv";
import { normalizeCsvDate } from "@/lib/hooks/use-invoices";
import type { Vehicle, AssetStatus } from "@/types/cmms";

function patchVehicleCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Vehicle>) {
  queryClient.setQueryData<Vehicle[]>(["vehicles"], (old) =>
    old?.map((v) => v.id === id ? { ...v, ...patch } : v)
  );
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vehicles").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return (data.map(mapVehicle)) as Vehicle[];
    },
  });
}

export function useVehicle(id: string) {
  return useQuery({
    queryKey: ["vehicles", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("vehicles").insert({
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
        samsara_vehicle_id: input.samsaraVehicleId,
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
        warranty_start_date: input.warrantyStartDate,
        warranty_term_months: input.warrantyTermMonths,
        warranty_end_date: input.warrantyEndDate,
        warranty_notes: input.warrantyNotes,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("vehicles").update({
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
        ...(input.samsaraVehicleId !== undefined && { samsara_vehicle_id: input.samsaraVehicleId }),
        ...(input.warrantyStartDate !== undefined && { warranty_start_date: input.warrantyStartDate }),
        ...(input.warrantyTermMonths !== undefined && { warranty_term_months: input.warrantyTermMonths }),
        ...(input.warrantyEndDate !== undefined && { warranty_end_date: input.warrantyEndDate }),
        ...(input.warrantyNotes !== undefined && { warranty_notes: input.warrantyNotes }),
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
      // Status changes move uptime.
      queryClient.invalidateQueries({ queryKey: ["asset-metrics"] });
    },
  });
}

export function useUpdateVehicleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AssetStatus }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("vehicles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["vehicles"] });
      const previous = queryClient.getQueryData<Vehicle[]>(["vehicles"]);
      patchVehicleCache(queryClient, id, { status });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<Vehicle[]>(["vehicles"], context.previous);
    },
    onSettled: (_, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles", id] });
      // Status changes move uptime.
      queryClient.invalidateQueries({ queryKey: ["asset-metrics"] });
    },
  });
}

const VALID_VEHICLE_STATUSES = new Set(["active", "inactive", "in_shop", "out_of_service", "disposed", "sold"]);

function normaliseVehicleStatus(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return VALID_VEHICLE_STATUSES.has(s) ? s : "active";
}

/**
 * Bulk-inserts vehicles from a CSV import.
 * Rows missing `name` or `assetTag` are silently skipped.
 */
export function useBulkImportVehicles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]): Promise<BulkImportResult> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();

      let succeeded = 0;
      const failed: BulkImportResult["failed"] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 1;
        try {
          const name = r.name?.trim();
          const assetTag = r.assetTag?.trim();
          if (!name || !assetTag) {
            failed.push({ row: rowNum, error: "Missing required field: Name / Asset Tag" });
            continue;
          }

          // "$25,000.00" parsed as 25 (and "$25000" as NaN -> silently null);
          // an unreadable date made Postgres reject the row.
          const priceCents = parseCsvDollarsToCents(r.purchasePrice);
          if (priceCents !== null && Number.isNaN(priceCents)) {
            failed.push({ row: rowNum, error: `"${name}": invalid purchase price ("${r.purchasePrice}")` });
            continue;
          }
          const purchaseDate = r.purchaseDate?.trim() ? normalizeCsvDate(r.purchaseDate) : null;
          if (r.purchaseDate?.trim() && !purchaseDate) {
            failed.push({ row: rowNum, error: `"${name}": invalid purchase date ("${r.purchaseDate}")` });
            continue;
          }
          const statusProvided = !!r.status?.trim();
          const row = {
            name,
            asset_tag: assetTag,
            make: r.make?.trim() || null,
            model: r.model?.trim() || null,
            year: r.year ? parseInt(r.year) || null : null,
            license_plate: r.licensePlate?.trim() || null,
            vin: r.vin?.trim() || null,
            fuel_type: r.fuelType?.trim() || null,
            status: normaliseVehicleStatus(r.status ?? ""),
            assigned_crew: r.assignedCrew?.trim() || null,
            purchase_vendor_name: r.purchaseVendorName?.trim() || null,
            purchase_date: purchaseDate,
            purchase_price: priceCents || null,
            payment_method: r.paymentMethod?.trim() || null,
            finance_institution: r.financeInstitution?.trim() || null,
            asset_type: "vehicle",
          };

          // vehicles has no unique index on asset_tag (only on VIN), so a
          // duplicate tag never raised 23505 — re-importing a CSV created a
          // second copy of every vehicle without a VIN. Look the tag up first
          // and update in place.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existingVehicle, error: lookupErr } = await (supabase as any)
            .from("vehicles")
            .select("id")
            .eq("org_id", profile!.org_id)
            .eq("asset_tag", row.asset_tag)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle();
          if (lookupErr) {
            failed.push({ row: rowNum, error: `"${name}": ${lookupErr.message}` });
            continue;
          }

          if (existingVehicle) {
            // Only the cells the CSV filled in are written. Re-importing a CSV
            // to update mileage/VIN/etc must not blank every other field, nor
            // reset an in_shop/out_of_service vehicle to "active"
            // (normaliseVehicleStatus() defaults a blank cell to "active", so
            // status is only included when the cell had content).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: updateErr } = await (supabase as any).from("vehicles").update({
              name: row.name,
              ...(row.make ? { make: row.make } : {}),
              ...(row.model ? { model: row.model } : {}),
              ...(row.year ? { year: row.year } : {}),
              ...(row.license_plate ? { license_plate: row.license_plate } : {}),
              ...(row.vin ? { vin: row.vin } : {}),
              ...(row.fuel_type ? { fuel_type: row.fuel_type } : {}),
              ...(statusProvided ? { status: row.status } : {}),
              ...(row.assigned_crew ? { assigned_crew: row.assigned_crew } : {}),
              ...(row.purchase_vendor_name ? { purchase_vendor_name: row.purchase_vendor_name } : {}),
              ...(row.purchase_date ? { purchase_date: row.purchase_date } : {}),
              ...(row.purchase_price ? { purchase_price: row.purchase_price } : {}),
              // A blank financing cell must not wipe saved financing details.
              ...(row.payment_method ? { payment_method: row.payment_method } : {}),
              ...(row.finance_institution ? { finance_institution: row.finance_institution } : {}),
            }).eq("id", existingVehicle.id);
            if (updateErr) {
              failed.push({ row: rowNum, error: updateErr.code === "23505" ? `"${name}": that VIN belongs to another vehicle` : `"${name}": ${updateErr.message}` });
              continue;
            }
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from("vehicles").insert(row);
            if (error) {
              failed.push({ row: rowNum, error: error.code === "23505" ? `"${name}": that VIN belongs to another vehicle` : `"${name}": ${error.message}` });
              continue;
            }
          }

          succeeded++;
        } catch (err) {
          failed.push({ row: rowNum, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }
      return { succeeded, failed };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("vehicles").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}
