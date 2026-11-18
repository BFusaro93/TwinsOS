import type { SupabaseClient } from "@supabase/supabase-js";
import { calcChemicalAndSolution, concentrateUnitId, formatApplicationRateLabel } from "@/lib/chemical-mix-calc";
import { buildChemicalAreaResolver, effectivePropertyId, fetchSinglePropertyByClient, type ChemicalArea } from "@/lib/chemical-area";
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
 *
 * Each row carries the visit's org_id explicitly: the crew clock-in path runs this
 * with the service role, where the column's my_org_id() default is NULL and every
 * insert failed (silently — callers treat preload as best-effort). Pass
 * `actingUserId` from a service-role caller so created_by still names the person.
 */
export async function loadServiceChemicalsForVisit(
  supabase: SupabaseClient,
  visitId: string,
  opts: { actingUserId?: string | null } = {}
): Promise<number> {
  const { data: visit } = await supabase
    .from("crm_job_visits")
    .select(
      "id, org_id, job_id, scheduled_date, status, job_service_id, crew_group_secondary, crm_jobs(client_id, property_id, crm_job_services(id, service_id, included, treated_area))"
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
    crm_job_services: { id: string; service_id: string | null; included: boolean | null; treated_area: number | null }[] | null;
  } | null;
  if (!job) return 0;

  const performed = (job.crm_job_services ?? []).filter((js) => js.included !== false && js.service_id);
  const scoped = visit.job_service_id ? performed.filter((js) => js.id === visit.job_service_id) : performed;
  const serviceIds = [...new Set(scoped.map((js) => js.service_id as string))];
  if (serviceIds.length === 0) return 0;

  const { data: attached } = await supabase
    .from("crm_service_chemicals")
    .select("service_id, product_id, start_date, end_date")
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
    supabase
      .from("crm_chemical_settings")
      .select("auto_calc_quantity, area_custom_field_id, default_unit_of_measure_id")
      .eq("org_id", visitOrgId)
      .maybeSingle(),
  ]);

  const unitsById = new Map((unitRows ?? []).map((r) => [r.id, mapLookupItem(r)]));
  const rateByProduct = new Map<string, ChemicalApplicationRate>();
  for (const row of rateRows ?? []) {
    const rate = mapRate(row);
    const current = rateByProduct.get(rate.productId);
    if (!current || (rate.isDefault && !current.isDefault)) rateByProduct.set(rate.productId, rate);
  }

  // Area is per product: the service that attaches it can size from its own
  // property measurement or carry a treated-area override (see chemical-area.ts).
  const areaByProduct = new Map<string, ChemicalArea>();
  if (settings?.auto_calc_quantity) {
    const single = job.property_id
      ? new Map<string, string>()
      : await fetchSinglePropertyByClient(supabase, [job.client_id ?? ""]);
    const propertyId = effectivePropertyId({ client_id: job.client_id, property_id: job.property_id }, single);
    const resolveArea = await buildChemicalAreaResolver(
      supabase,
      settings.area_custom_field_id ?? null,
      serviceIds,
      propertyId ? [propertyId] : [],
      job.client_id ? [job.client_id] : []
    );
    for (const c of attached ?? []) {
      if (areaByProduct.has(c.product_id)) continue;
      const js = scoped.find((x) => x.service_id === c.service_id);
      const area = resolveArea({ propertyId, clientId: job.client_id, serviceId: c.service_id, treatedArea: js?.treated_area ?? null });
      if (area != null) areaByProduct.set(c.product_id, area);
    }
  }

  // A service-role client has no session to read the user from.
  const createdBy =
    opts.actingUserId !== undefined ? opts.actingUserId : (await supabase.auth.getUser()).data.user?.id ?? null;
  const defaultUnitId = (settings as { default_unit_of_measure_id?: string | null } | null)?.default_unit_of_measure_id ?? null;
  const unitName = (id: string) => unitsById.get(id)?.name ?? null;
  const rows = (products ?? []).map((p) => {
    const rate = rateByProduct.get(p.id);
    const area = areaByProduct.get(p.id);
    const computed = rate && area ? calcChemicalAndSolution(rate, area.value, unitsById, area.kind) : null;
    return {
      org_id: visitOrgId,
      job_id: visit.job_id,
      visit_id: visitId,
      product_id: p.id,
      used: true,
      epa_number_snapshot: p.epa_registration_number ?? null,
      re_entry_interval_snapshot: p.re_entry_interval ?? null,
      restricted_product_snapshot: p.restricted_product ?? false,
      application_method_id: rate?.applicationMethodId ?? null,
      // The rate the plan was sized from, kept on the record (compliance reports print it).
      application_rate_label: rate ? formatApplicationRateLabel(rate, unitName) : null,
      // With no estimate the crew still enters an amount, so the row needs the unit
      // it's in: the product's own (concentrate) unit from its rate, else the org default.
      unit_of_measure_id: (rate ? concentrateUnitId(rate) : null) ?? defaultUnitId,
      created_by: createdBy,
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

/**
 * Batch form of loadServiceChemicalsForVisit for bulk actions (the board's bulk
 * Dispatch on up to 500 stops). Loading each visit in turn ran ~7 queries per visit
 * even when it had nothing to load; this reads the visits, their service lines, the
 * attached chemicals and what is already loaded in a few batched queries, and runs
 * the full per-visit load (rates, areas, inserts) only for visits that are actually
 * missing a product — a few at a time. Same rules as the single-visit form; returns
 * how many rows it added. Best-effort per visit: one failure doesn't stop the rest.
 */
export async function loadServiceChemicalsForVisits(
  supabase: SupabaseClient,
  visitIds: string[],
  opts: { actingUserId?: string | null; concurrency?: number } = {}
): Promise<number> {
  const ids = [...new Set(visitIds)];
  if (ids.length === 0) return 0;
  type VisitLite = { id: string; job_id: string; scheduled_date: string | null; status: string | null; job_service_id: string | null; crew_group_secondary: boolean | null };
  const visits: VisitLite[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("crm_job_visits")
      .select("id, job_id, scheduled_date, status, job_service_id, crew_group_secondary")
      .in("id", ids.slice(i, i + 100))
      .is("deleted_at", null);
    visits.push(...((data ?? []) as unknown as VisitLite[]));
  }
  const live = visits.filter((v) => ["scheduled", "dispatched", "in_progress"].includes(v.status ?? "") && !v.crew_group_secondary);
  if (live.length === 0) return 0;

  const jobIds = [...new Set(live.map((v) => v.job_id))];
  const lines: { id: string; job_id: string; service_id: string | null; included: boolean | null }[] = [];
  for (let i = 0; i < jobIds.length; i += 100) {
    const { data } = await supabase
      .from("crm_job_services")
      .select("id, job_id, service_id, included")
      .in("job_id", jobIds.slice(i, i + 100));
    lines.push(...((data ?? []) as typeof lines));
  }
  const servicesFor = (v: VisitLite) =>
    lines
      .filter((l) => l.job_id === v.job_id && l.included !== false && l.service_id && (!v.job_service_id || l.id === v.job_service_id))
      .map((l) => l.service_id as string);
  const allServiceIds = [...new Set(live.flatMap(servicesFor))];
  if (allServiceIds.length === 0) return 0;

  const attached: { service_id: string; product_id: string; start_date: string | null; end_date: string | null }[] = [];
  for (let i = 0; i < allServiceIds.length; i += 100) {
    const { data } = await supabase
      .from("crm_service_chemicals")
      .select("service_id, product_id, start_date, end_date")
      .in("service_id", allServiceIds.slice(i, i + 100));
    attached.push(...((data ?? []) as typeof attached));
  }
  if (attached.length === 0) return 0;

  const candidates = live.filter((v) => servicesFor(v).some((sid) => attached.some((c) => c.service_id === sid)));
  if (candidates.length === 0) return 0;
  const haveByVisit = new Map<string, Set<string>>();
  const candidateIds = candidates.map((v) => v.id);
  for (let i = 0; i < candidateIds.length; i += 100) {
    const { data } = await supabase
      .from("crm_chemical_applications")
      .select("visit_id, product_id")
      .in("visit_id", candidateIds.slice(i, i + 100))
      .is("deleted_at", null);
    for (const r of (data ?? []) as { visit_id: string; product_id: string }[]) {
      const set = haveByVisit.get(r.visit_id) ?? new Set<string>();
      set.add(r.product_id);
      haveByVisit.set(r.visit_id, set);
    }
  }
  const needsLoad = candidates.filter((v) => {
    const day = v.scheduled_date;
    const services = new Set(servicesFor(v));
    const have = haveByVisit.get(v.id) ?? new Set<string>();
    return attached.some(
      (c) =>
        services.has(c.service_id) &&
        !(day && c.start_date && day < c.start_date) &&
        !(day && c.end_date && day > c.end_date) &&
        !have.has(c.product_id)
    );
  });

  let inserted = 0;
  const queue = [...needsLoad];
  const worker = async () => {
    for (let v = queue.shift(); v; v = queue.shift()) {
      inserted += await loadServiceChemicalsForVisit(supabase, v.id, { actingUserId: opts.actingUserId }).catch(() => 0);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, queue.length)) }, worker));
  return inserted;
}
