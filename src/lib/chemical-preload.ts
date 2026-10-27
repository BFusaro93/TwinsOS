import type { SupabaseClient } from "@supabase/supabase-js";
import { calcChemicalAndSolution } from "@/lib/chemical-mix-calc";
import { effectivePropertyId, fetchPropertyAreaValues, fetchSinglePropertyByClient } from "@/lib/chemical-area";
import type { ChemicalApplicationRate, ChemicalLookupItem } from "@/types/chemical-tracking";

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
function mapRate(row: any): ChemicalApplicationRate {
  const num = (v: unknown) => (v !== null && v !== undefined ? Number(v) : null);
  return {
    id: row.id,
    orgId: row.org_id,
    productId: row.product_id,
    applicationMethodId: row.application_method_id,
    rateQty: num(row.rate_qty),
    unitOfMeasureId: row.unit_of_measure_id,
    areaQty: num(row.area_qty),
    areaUnitId: row.area_unit_id,
    productCostCents: row.product_cost_cents ?? 0,
    isDefault: row.is_default ?? false,
    mixType: row.mix_type ?? "none",
    dilutionChemicalQty: num(row.dilution_chemical_qty),
    dilutionChemicalUnitId: row.dilution_chemical_unit_id,
    dilutionWaterQty: num(row.dilution_water_qty),
    dilutionWaterUnitId: row.dilution_water_unit_id,
    mixProductId: row.mix_product_id,
    mixProductAmountQty: num(row.mix_product_amount_qty),
    mixProductAmountUnitId: row.mix_product_amount_unit_id,
    mixProductTotalQty: num(row.mix_product_total_qty),
    mixProductTotalUnitId: row.mix_product_total_unit_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Pre-loads a visit with the chemicals attached to its service(s), the way the
 * Services > Chemicals tab promises ("pre-loaded onto every visit for this
 * service"). Nothing did that before, so the crew app's Chemical Mix card —
 * which only shows logged applications — stayed empty until an office user
 * hand-added every product to every visit.
 *
 * Only touches a visit that is still ahead of or in the middle of the work
 * (scheduled / dispatched / in progress), never one already completed, cancelled or skipped:
 * back-filling rows onto finished visits would fabricate application records.
 * Skips products the visit already has, honours each attachment's seasonal
 * start/end window, and pre-fills the estimated amounts when the org turned on
 * Default Chemical Quantity and the property's area is known — the same math
 * the load list uses. Returns how many rows it added.
 */
export async function loadServiceChemicalsForVisit(supabase: SupabaseClient, visitId: string): Promise<number> {
  const { data: visit } = await supabase
    .from("crm_job_visits")
    .select(
      "id, org_id, job_id, scheduled_date, status, job_service_id, crew_group_secondary, crm_jobs(client_id, property_id, crm_job_services(id, service_id, included))"
    )
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!visit || !["scheduled", "dispatched", "in_progress"].includes(visit.status ?? "")) return 0;
  // A secondary crew on a multi-crew stop carries no chemical records: the mix
  // is logged and confirmed once, on the lead crew's visit, so estimated
  // amounts and inventory depletion aren't counted twice.
  if ((visit as { crew_group_secondary?: boolean | null }).crew_group_secondary) return 0;
  const visitOrgId = (visit as unknown as { org_id: string }).org_id;
  const job = visit.crm_jobs as unknown as {
    client_id: string | null;
    property_id: string | null;
    crm_job_services: { id: string; service_id: string | null; included: boolean | null }[] | null;
  } | null;
  if (!job) return 0;

  const performed = (job.crm_job_services ?? []).filter((js) => js.included !== false && js.service_id);
  const scoped = visit.job_service_id ? performed.filter((js) => js.id === visit.job_service_id) : performed;
  const serviceIds = [...new Set(scoped.map((js) => js.service_id as string))];
  if (serviceIds.length === 0) return 0;

  const { data: attached } = await supabase
    .from("crm_service_chemicals")
    .select("product_id, start_date, end_date")
    .in("service_id", serviceIds);
  const day = visit.scheduled_date;
  const productIds = [
    ...new Set(
      (attached ?? [])
        .filter((c) => !(day && c.start_date && day < c.start_date) && !(day && c.end_date && day > c.end_date))
        .map((c) => c.product_id)
    ),
  ];
  if (productIds.length === 0) return 0;

  const { data: existing } = await supabase
    .from("crm_chemical_applications")
    .select("product_id")
    .eq("visit_id", visitId)
    .is("deleted_at", null);
  const have = new Set((existing ?? []).map((a) => a.product_id));
  const missing = productIds.filter((id) => !have.has(id));
  if (missing.length === 0) return 0;

  const [{ data: products }, { data: rateRows }, { data: unitRows }, { data: settings }] = await Promise.all([
    supabase
      .from("product_items")
      .select("id, epa_registration_number, re_entry_interval, restricted_product")
      .in("id", missing)
      .eq("track_chemicals", true)
      .is("deleted_at", null),
    supabase.from("crm_chemical_application_rates").select("*").in("product_id", missing),
    // Scoped to the visit's org explicitly: callers using a user session were
    // narrowed by RLS, but the crew clock-in path runs this with the service
    // role, where an unscoped .maybeSingle() over every org's settings rows
    // errors out and silently dropped the estimated amounts.
    supabase.from("crm_chemical_lookup_items").select("*").eq("org_id", visitOrgId).is("deleted_at", null),
    supabase.from("crm_chemical_settings").select("auto_calc_quantity, area_custom_field_id").eq("org_id", visitOrgId).maybeSingle(),
  ]);

  const unitsById = new Map((unitRows ?? []).map((r) => [r.id, mapLookupItem(r)]));
  const rateByProduct = new Map<string, ChemicalApplicationRate>();
  for (const row of rateRows ?? []) {
    const rate = mapRate(row);
    const current = rateByProduct.get(rate.productId);
    if (!current || (rate.isDefault && !current.isDefault)) rateByProduct.set(rate.productId, rate);
  }

  let areaValue: number | null = null;
  if (settings?.auto_calc_quantity && settings.area_custom_field_id) {
    const single = job.property_id
      ? new Map<string, string>()
      : await fetchSinglePropertyByClient(supabase, [job.client_id ?? ""]);
    const propertyId = effectivePropertyId({ client_id: job.client_id, property_id: job.property_id }, single);
    if (propertyId) {
      const values = await fetchPropertyAreaValues(supabase, settings.area_custom_field_id, [propertyId]);
      areaValue = values.get(propertyId) ?? null;
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  const rows = (products ?? []).map((p) => {
    const rate = rateByProduct.get(p.id);
    const computed = rate && areaValue != null ? calcChemicalAndSolution(rate, areaValue, unitsById) : null;
    return {
      job_id: visit.job_id,
      visit_id: visitId,
      product_id: p.id,
      used: true,
      epa_number_snapshot: p.epa_registration_number ?? null,
      re_entry_interval_snapshot: p.re_entry_interval ?? null,
      restricted_product_snapshot: p.restricted_product ?? false,
      application_method_id: rate?.applicationMethodId ?? null,
      created_by: user?.id ?? null,
      ...(computed && {
        chemical_amount: Math.round(computed.chemicalAmount * 10000) / 10000,
        unit_of_measure_id: computed.chemicalUnitOfMeasureId,
        // The estimate at the moment of loading, kept so the variance
        // against what was really applied survives later edits.
        budgeted_concentrate_amount: Math.round(computed.chemicalAmount * 10000) / 10000,
        ...(computed.solutionAmount != null && {
          solution_amount: Math.round(computed.solutionAmount * 100) / 100,
          solution_unit_of_measure_id: computed.solutionUnitOfMeasureId,
        }),
      }),
    };
  });
  if (rows.length === 0) return 0;

  // One insert per row: the unique index on preloaded (visit, product) makes a
  // concurrent preload lose with 23505 instead of double-loading the product.
  let inserted = 0;
  for (const row of rows) {
    const { error } = await supabase
      .from("crm_chemical_applications")
      // `preloaded` is newer than the generated types.
      .insert({ ...row, preloaded: true } as never);
    if (error) {
      if (error.code === "23505") continue;
      throw error;
    }
    inserted += 1;
  }
  return inserted;
}
