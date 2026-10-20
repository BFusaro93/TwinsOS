"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { loadServiceChemicalsForVisit } from "@/lib/chemical-preload";
import { effectivePropertyId, fetchPropertyAreaValues, fetchSinglePropertyByClient } from "@/lib/chemical-area";
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
    unitClass: row.unit_class ?? null,
    baseFactor: row.base_factor !== null && row.base_factor !== undefined ? Number(row.base_factor) : null,
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
    solutionUnitOfMeasureId: row.solution_unit_of_measure_id,
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
    preloaded: row.preloaded === true,
    confirmedAt: row.confirmed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
    productName: row.product?.name ?? null,
    solutionUnitOfMeasureName: row.solution_unit_of_measure?.name ?? null,
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
    mutationFn: async (input: {
      listType: ChemicalLookupType;
      name: string;
      unitClass?: ChemicalLookupItem["unitClass"];
      baseFactor?: number | null;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_chemical_lookup_items")
        .insert({
          list_type: input.listType,
          name: input.name,
          ...(input.unitClass !== undefined && { unit_class: input.unitClass }),
          ...(input.baseFactor !== undefined && { base_factor: input.baseFactor }),
        })
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
  autoCalcQuantity: true,
  areaCustomFieldId: null,
  confirmationMode: "crew_required",
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
        confirmationMode:
          (data as { confirmation_mode?: string }).confirmation_mode === "office_later" ? "office_later" : "crew_required",
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
          ...(values.confirmationMode !== undefined && { confirmation_mode: values.confirmationMode }),
          updated_at: new Date().toISOString(),
          // confirmation_mode is newer than the generated Supabase types.
        } as never,
        { onConflict: "org_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chemical-settings"] }),
  });
}

// ── pure helpers ──────────────────────────────────────────────────────────────
// calcAutoQuantity/calcChemicalAndSolution live in chemical-mix-calc.ts (no
// "use client", no react-query/browser-client deps) so server-side report
// code can reuse them too. Re-exported here for existing importers (e.g.
// ChemicalApplicationPanel).

export { calcAutoQuantity, calcChemicalAndSolution } from "@/lib/chemical-mix-calc";
export type { ChemicalCalcResult } from "@/lib/chemical-mix-calc";

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
        .select("*, product:product_id(name), solution_unit_of_measure:solution_unit_of_measure_id(name)")
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
    > & { id?: string; jobId: string; visitId: string; /** Saving counts as confirming what was actually used. */ confirm?: boolean }) => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const payload = {
        job_id: input.jobId,
        visit_id: input.visitId,
        ...(input.productId !== undefined && { product_id: input.productId }),
        ...(input.chemicalAmount !== undefined && { chemical_amount: input.chemicalAmount }),
        ...(input.solutionAmount !== undefined && { solution_amount: input.solutionAmount }),
        ...(input.unitOfMeasureId !== undefined && { unit_of_measure_id: input.unitOfMeasureId }),
        ...(input.solutionUnitOfMeasureId !== undefined && {
          solution_unit_of_measure_id: input.solutionUnitOfMeasureId,
        }),
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
        // confirmed_at/by are newer than the generated Supabase types.
        ...(input.confirm && { confirmed_at: new Date().toISOString(), confirmed_by: authUser?.id ?? null }),
      };

      if (id) {
        const { data, error } = await supabase
          .from("crm_chemical_applications")
          .update(payload as never)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return mapApplication(data);
      }

      const { data, error } = await supabase
        .from("crm_chemical_applications")
        .insert({ ...payload, created_by: authUser?.id ?? null } as never)
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

/** Whether an admin already waived chemical confirmation for this visit. */
export function useChemicalConfirmationWaived(visitId: string | undefined) {
  return useQuery({
    queryKey: ["chemical-confirmation-waived", visitId],
    queryFn: async (): Promise<boolean> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_job_visits")
        .select("*")
        .eq("id", visitId!)
        .maybeSingle();
      if (error) throw error;
      return !!(data as { chemical_confirmation_waived_at?: string | null } | null)?.chemical_confirmation_waived_at;
    },
    enabled: !!visitId,
  });
}

/** Admin override: let this visit be completed without the crew's chemical confirmation. */
export function useWaiveChemicalConfirmation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("waive_chemical_confirmation", { p_visit_id: visitId });
      if (error) throw error;
    },
    onSuccess: (_d, visitId) => qc.invalidateQueries({ queryKey: ["chemical-confirmation-waived", visitId] }),
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

/**
 * Treatable area for a job's property under the org's Area Custom Field — the
 * input to the auto-calculated chemical quantity. Resolves the same way the
 * load-list and materials-needed reports do (built-in takeoff columns, and the
 * client's only property when the job has none), so the panel and the reports
 * can't disagree about whether an estimate exists.
 */
export function useChemicalJobAreaValue(jobId: string, areaFieldId: string | null | undefined) {
  return useQuery({
    queryKey: ["chemical-job-area-value", jobId, areaFieldId],
    queryFn: async (): Promise<number | null> => {
      const supabase = createClient();
      const { data: job } = await supabase
        .from("crm_jobs")
        .select("client_id, property_id")
        .eq("id", jobId)
        .maybeSingle();
      if (!job) return null;
      const single = job.property_id ? new Map<string, string>() : await fetchSinglePropertyByClient(supabase, [job.client_id ?? ""]);
      const propertyId = effectivePropertyId(job, single);
      if (!propertyId) return null;
      const values = await fetchPropertyAreaValues(supabase, areaFieldId ?? null, [propertyId]);
      return values.get(propertyId) ?? null;
    },
    enabled: !!jobId && !!areaFieldId,
  });
}

/** Hook wrapper around loadServiceChemicalsForVisit (see src/lib/chemical-preload.ts). */
export function useLoadServiceChemicals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId }: { visitId: string }): Promise<number> =>
      loadServiceChemicalsForVisit(createClient(), visitId),
    onSuccess: (count, { visitId }) => {
      if (count > 0) {
        qc.invalidateQueries({ queryKey: ["chemical-applications", "visit", visitId] });
        qc.invalidateQueries({ queryKey: ["chemical-applications", "date"] });
        qc.invalidateQueries({ queryKey: ["crew-app-chemicals"] });
      }
    },
  });
}

/** Crew clock-in/out of a visit — used to pre-fill a chemical application's start/end time. */
export function useVisitClockTimes(visitId: string | undefined) {
  return useQuery({
    queryKey: ["chemical-visit-clock-times", visitId],
    queryFn: async (): Promise<{ clockedInAt: string | null; clockedOutAt: string | null }> => {
      const supabase = createClient();
      const { data } = await supabase
        .from("crm_job_visits")
        .select("clocked_in_at, clocked_out_at")
        .eq("id", visitId!)
        .maybeSingle();
      return { clockedInAt: data?.clocked_in_at ?? null, clockedOutAt: data?.clocked_out_at ?? null };
    },
    enabled: !!visitId,
  });
}
