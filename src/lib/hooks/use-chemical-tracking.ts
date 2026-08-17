"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  ChemicalApplication,
  ChemicalApplicationRate,
  ChemicalLookupItem,
  ChemicalLookupType,
  ChemicalMixType,
  ChemicalSettings,
  ServiceChemical,
} from "@/types/chemical-tracking";

// ── mappers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLookupItem(row: any): ChemicalLookupItem {
  return {
    id: row.id,
    orgId: row.org_id,
    listType: row.list_type,
    name: row.name,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApplicationRate(row: any): ChemicalApplicationRate {
  return {
    id: row.id,
    orgId: row.org_id,
    productId: row.product_id,
    applicationMethodId: row.application_method_id,
    rateQty: row.rate_qty !== null ? Number(row.rate_qty) : null,
    unitOfMeasureId: row.unit_of_measure_id,
    areaQty: row.area_qty !== null ? Number(row.area_qty) : null,
    areaUnitId: row.area_unit_id,
    productCostCents: row.product_cost_cents ?? 0,
    isDefault: row.is_default ?? false,
    mixType: row.mix_type ?? "none",
    dilutionChemicalQty: row.dilution_chemical_qty !== null ? Number(row.dilution_chemical_qty) : null,
    dilutionChemicalUnitId: row.dilution_chemical_unit_id,
    dilutionWaterQty: row.dilution_water_qty !== null ? Number(row.dilution_water_qty) : null,
    dilutionWaterUnitId: row.dilution_water_unit_id,
    mixProductId: row.mix_product_id,
    mixProductAmountQty: row.mix_product_amount_qty !== null ? Number(row.mix_product_amount_qty) : null,
    mixProductAmountUnitId: row.mix_product_amount_unit_id,
    mixProductTotalQty: row.mix_product_total_qty !== null ? Number(row.mix_product_total_qty) : null,
    mixProductTotalUnitId: row.mix_product_total_unit_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    applicationMethodName: row.application_method?.name ?? null,
    unitOfMeasureName: row.unit_of_measure?.name ?? null,
    areaUnitName: row.area_unit?.name ?? null,
    dilutionChemicalUnitName: row.dilution_chemical_unit?.name ?? null,
    dilutionWaterUnitName: row.dilution_water_unit?.name ?? null,
    mixProductName: row.mix_product?.name ?? null,
    mixProductAmountUnitName: row.mix_product_amount_unit?.name ?? null,
    mixProductTotalUnitName: row.mix_product_total_unit?.name ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapServiceChemical(row: any): ServiceChemical {
  return {
    id: row.id,
    orgId: row.org_id,
    serviceId: row.service_id,
    productId: row.product_id,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    productName: row.product?.name,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApplication(row: any): ChemicalApplication {
  return {
    id: row.id,
    orgId: row.org_id,
    jobId: row.job_id,
    visitId: row.visit_id,
    productId: row.product_id,
    chemicalAmount: row.chemical_amount !== null ? Number(row.chemical_amount) : null,
    solutionAmount: row.solution_amount !== null ? Number(row.solution_amount) : null,
    unitOfMeasureId: row.unit_of_measure_id,
    targetIds: row.target_ids ?? [],
    areasTreatedIds: row.areas_treated_ids ?? [],
    applicationMethodId: row.application_method_id,
    applicationRateLabel: row.application_rate_label,
    used: row.used ?? true,
    applicatorEmployeeId: row.applicator_employee_id,
    applicatorLicenseNumber: row.applicator_license_number,
    epaNumberSnapshot: row.epa_number_snapshot,
    reEntryIntervalSnapshot: row.re_entry_interval_snapshot,
    restrictedProductSnapshot: row.restricted_product_snapshot,
    applicationStartTime: row.application_start_time,
    applicationEndTime: row.application_end_time,
    temperature: row.temperature !== null ? Number(row.temperature) : null,
    windSpeed: row.wind_speed !== null ? Number(row.wind_speed) : null,
    windDirection: row.wind_direction,
    phLevel: row.ph_level !== null ? Number(row.ph_level) : null,
    budgetedConcentrateAmount:
      row.budgeted_concentrate_amount !== null ? Number(row.budgeted_concentrate_amount) : null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
    productName: row.product?.name ?? null,
  };
}

// ── lookup lists (Application Methods, Targets, Volume/Area Units, Areas Treated) ──

export function useChemicalLookupItems(listType?: ChemicalLookupType) {
  return useQuery({
    queryKey: ["chemical-lookup-items", listType ?? "all"],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("crm_chemical_lookup_items")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order")
        .order("name");
      if (listType) query = query.eq("list_type", listType);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(mapLookupItem);
    },
  });
}

export function useCreateChemicalLookupItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { listType: ChemicalLookupType; name: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_chemical_lookup_items")
        .insert({ list_type: input.listType, name: input.name })
        .select()
        .single();
      if (error) throw error;
      return mapLookupItem(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chemical-lookup-items"] }),
  });
}

export function useUpdateChemicalLookupItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<Pick<ChemicalLookupItem, "name" | "isActive" | "sortOrder">> & { id: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("crm_chemical_lookup_items")
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.isActive !== undefined && { is_active: input.isActive }),
          ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chemical-lookup-items"] }),
  });
}

// ── org-level general chemical settings ─────────────────────────────────────

const DEFAULT_SETTINGS: Omit<ChemicalSettings, "id" | "orgId" | "updatedAt"> = {
  defaultUnitOfMeasureId: null,
  conditionsDisplay: "weather",
  autoCalcQuantity: false,
  areaCustomFieldId: null,
};

export function useChemicalSettings() {
  return useQuery({
    queryKey: ["chemical-settings"],
    queryFn: async (): Promise<ChemicalSettings> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_chemical_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return { id: "", orgId: "", updatedAt: "", ...DEFAULT_SETTINGS };
      }
      return {
        id: data.id,
        orgId: data.org_id,
        defaultUnitOfMeasureId: data.default_unit_of_measure_id,
        conditionsDisplay: data.conditions_display as ChemicalSettings["conditionsDisplay"],
        autoCalcQuantity: data.auto_calc_quantity,
        areaCustomFieldId: data.area_custom_field_id,
        updatedAt: data.updated_at,
      };
    },
  });
}

export function useUpdateChemicalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      values: Partial<Omit<ChemicalSettings, "id" | "orgId" | "updatedAt">>
    ) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;

      const { error } = await supabase.from("crm_chemical_settings").upsert(
        {
          org_id: profile.org_id,
          ...(values.defaultUnitOfMeasureId !== undefined && {
            default_unit_of_measure_id: values.defaultUnitOfMeasureId,
          }),
          ...(values.conditionsDisplay !== undefined && { conditions_display: values.conditionsDisplay }),
          ...(values.autoCalcQuantity !== undefined && { auto_calc_quantity: values.autoCalcQuantity }),
          ...(values.areaCustomFieldId !== undefined && { area_custom_field_id: values.areaCustomFieldId }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chemical-settings"] }),
  });
}

// ── pure helpers ──────────────────────────────────────────────────────────────

/**
 * Quantity to apply = (property's area value / rate's area basis) * rate's applied qty,
 * e.g. rate "1 oz per 1,000 sqft" against a 12,000 sqft property = 12 oz.
 * Not tiered like the Rate Matrix — chemical rates are a single ratio.
 */
export function calcAutoQuantity(rate: ChemicalApplicationRate, areaValue: number): number | null {
  if (!rate.areaQty || rate.rateQty == null) return null;
  return (areaValue / rate.areaQty) * rate.rateQty;
}

// ── application rates (per chemical product) ────────────────────────────────

export function useChemicalApplicationRates(productId: string | undefined) {
  return useQuery({
    queryKey: ["chemical-application-rates", productId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_chemical_application_rates")
        .select(
          "*, application_method:application_method_id(name), unit_of_measure:unit_of_measure_id(name), area_unit:area_unit_id(name), " +
          "dilution_chemical_unit:dilution_chemical_unit_id(name), dilution_water_unit:dilution_water_unit_id(name), " +
          "mix_product:mix_product_id(name), mix_product_amount_unit:mix_product_amount_unit_id(name), mix_product_total_unit:mix_product_total_unit_id(name)"
        )
        .eq("product_id", productId!)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data.map(mapApplicationRate);
    },
    enabled: !!productId,
  });
}

/** Replaces all application rate rows for a product with the given set (delete-then-insert). */
export function useSaveChemicalApplicationRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      rates,
    }: {
      productId: string;
      rates: Array<{
        applicationMethodId: string | null;
        rateQty: number | null;
        unitOfMeasureId: string | null;
        areaQty: number | null;
        areaUnitId: string | null;
        productCostCents: number;
        isDefault: boolean;
        mixType: ChemicalMixType;
        dilutionChemicalQty: number | null;
        dilutionChemicalUnitId: string | null;
        dilutionWaterQty: number | null;
        dilutionWaterUnitId: string | null;
        mixProductId: string | null;
        mixProductAmountQty: number | null;
        mixProductAmountUnitId: string | null;
        mixProductTotalQty: number | null;
        mixProductTotalUnitId: string | null;
      }>;
    }) => {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("crm_chemical_application_rates")
        .delete()
        .eq("product_id", productId);
      if (deleteError) throw deleteError;

      if (rates.length === 0) return;

      const { error: insertError } = await supabase.from("crm_chemical_application_rates").insert(
        rates.map((r) => ({
          product_id: productId,
          application_method_id: r.applicationMethodId,
          rate_qty: r.rateQty,
          unit_of_measure_id: r.unitOfMeasureId,
          area_qty: r.areaQty,
          area_unit_id: r.areaUnitId,
          product_cost_cents: r.productCostCents,
          is_default: r.isDefault,
          mix_type: r.mixType,
          dilution_chemical_qty: r.dilutionChemicalQty,
          dilution_chemical_unit_id: r.dilutionChemicalUnitId,
          dilution_water_qty: r.dilutionWaterQty,
          dilution_water_unit_id: r.dilutionWaterUnitId,
          mix_product_id: r.mixProductId,
          mix_product_amount_qty: r.mixProductAmountQty,
          mix_product_amount_unit_id: r.mixProductAmountUnitId,
          mix_product_total_qty: r.mixProductTotalQty,
          mix_product_total_unit_id: r.mixProductTotalUnitId,
        }))
      );
      if (insertError) throw insertError;
    },
    onSuccess: (_, { productId }) =>
      qc.invalidateQueries({ queryKey: ["chemical-application-rates", productId] }),
  });
}

// ── service-level default chemicals ──────────────────────────────────────────

export function useServiceChemicals(serviceId: string | undefined) {
  return useQuery({
    queryKey: ["service-chemicals", serviceId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_service_chemicals")
        .select("*, product:product_id(name)")
        .eq("service_id", serviceId!)
        .order("created_at");
      if (error) throw error;
      return data.map(mapServiceChemical);
    },
    enabled: !!serviceId,
  });
}

/** Replaces all default-chemical rows for a service with the given set. */
export function useSaveServiceChemicals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serviceId,
      chemicals,
    }: {
      serviceId: string;
      chemicals: Array<{ productId: string; startDate: string | null; endDate: string | null }>;
    }) => {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("crm_service_chemicals")
        .delete()
        .eq("service_id", serviceId);
      if (deleteError) throw deleteError;

      if (chemicals.length === 0) return;

      const { error: insertError } = await supabase.from("crm_service_chemicals").insert(
        chemicals.map((c) => ({
          service_id: serviceId,
          product_id: c.productId,
          start_date: c.startDate,
          end_date: c.endDate,
        }))
      );
      if (insertError) throw insertError;
    },
    onSuccess: (_, { serviceId }) => qc.invalidateQueries({ queryKey: ["service-chemicals", serviceId] }),
  });
}

// ── per-visit chemical application records ───────────────────────────────────

export function useChemicalApplicationsForVisit(visitId: string | undefined) {
  return useQuery({
    queryKey: ["chemical-applications", "visit", visitId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_chemical_applications")
        .select("*, product:product_id(name)")
        .eq("visit_id", visitId!)
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      return data.map(mapApplication);
    },
    enabled: !!visitId,
  });
}

/** Every chemical-tracking visit scheduled on a given date, with their application rows. */
export function useChemicalApplicationsForDate(date: string | undefined) {
  return useQuery({
    queryKey: ["chemical-applications", "date", date],
    queryFn: async () => {
      const supabase = createClient();
      const { data: visits, error: visitsError } = await supabase
        .from("crm_job_visits")
        .select(
          "id, job_id, scheduled_date, status, client_id, clients:client_id(display_name), crm_jobs:job_id(service_address, service_city, service_zip, crm_job_services(service_id, service_name, crm_services:service_id(track_chemicals)))"
        )
        .eq("scheduled_date", date!)
        .is("deleted_at", null)
        .order("priority");
      if (visitsError) throw visitsError;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chemicalVisits = (visits ?? []).filter((v: any) =>
        v.crm_jobs?.crm_job_services?.some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (js: any) => js.crm_services?.track_chemicals
        )
      );

      return chemicalVisits;
    },
    enabled: !!date,
  });
}

export function useSaveChemicalApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<
      Omit<ChemicalApplication, "id" | "orgId" | "createdAt" | "updatedAt" | "createdBy" | "deletedAt">
    > & { id?: string; jobId: string; visitId: string }) => {
      const supabase = createClient();
      const payload = {
        job_id: input.jobId,
        visit_id: input.visitId,
        ...(input.productId !== undefined && { product_id: input.productId }),
        ...(input.chemicalAmount !== undefined && { chemical_amount: input.chemicalAmount }),
        ...(input.solutionAmount !== undefined && { solution_amount: input.solutionAmount }),
        ...(input.unitOfMeasureId !== undefined && { unit_of_measure_id: input.unitOfMeasureId }),
        ...(input.targetIds !== undefined && { target_ids: input.targetIds }),
        ...(input.areasTreatedIds !== undefined && { areas_treated_ids: input.areasTreatedIds }),
        ...(input.applicationMethodId !== undefined && { application_method_id: input.applicationMethodId }),
        ...(input.applicationRateLabel !== undefined && { application_rate_label: input.applicationRateLabel }),
        ...(input.used !== undefined && { used: input.used }),
        ...(input.applicatorEmployeeId !== undefined && { applicator_employee_id: input.applicatorEmployeeId }),
        ...(input.applicatorLicenseNumber !== undefined && {
          applicator_license_number: input.applicatorLicenseNumber,
        }),
        ...(input.epaNumberSnapshot !== undefined && { epa_number_snapshot: input.epaNumberSnapshot }),
        ...(input.reEntryIntervalSnapshot !== undefined && { re_entry_interval_snapshot: input.reEntryIntervalSnapshot }),
        ...(input.restrictedProductSnapshot !== undefined && { restricted_product_snapshot: input.restrictedProductSnapshot }),
        ...(input.applicationStartTime !== undefined && { application_start_time: input.applicationStartTime }),
        ...(input.applicationEndTime !== undefined && { application_end_time: input.applicationEndTime }),
        ...(input.temperature !== undefined && { temperature: input.temperature }),
        ...(input.windSpeed !== undefined && { wind_speed: input.windSpeed }),
        ...(input.windDirection !== undefined && { wind_direction: input.windDirection }),
        ...(input.phLevel !== undefined && { ph_level: input.phLevel }),
        ...(input.budgetedConcentrateAmount !== undefined && {
          budgeted_concentrate_amount: input.budgetedConcentrateAmount,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
      };

      if (id) {
        const { data, error } = await supabase
          .from("crm_chemical_applications")
          .update(payload)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return mapApplication(data);
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("crm_chemical_applications")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return mapApplication(data);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["chemical-applications", "visit", data.visitId] });
      qc.invalidateQueries({ queryKey: ["chemical-applications", "date"] });
    },
  });
}

export function useDeleteChemicalApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; visitId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("crm_chemical_applications")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { visitId }) => {
      qc.invalidateQueries({ queryKey: ["chemical-applications", "visit", visitId] });
      qc.invalidateQueries({ queryKey: ["chemical-applications", "date"] });
    },
  });
}
