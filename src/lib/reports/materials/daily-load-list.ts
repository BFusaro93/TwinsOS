import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { calcChemicalAndSolution } from "@/lib/chemical-mix-calc";
import type { ChemicalApplicationRate, ChemicalLookupItem } from "@/types/chemical-tracking";

// ============================================================
// Daily Load List
//
// Answers "what does each crew need to load on the truck today" —
// grouped by crew (visit.crew_id, falling back to the job's default
// crm_jobs.crew_id, the same "effective crew" pattern DispatchBoard uses),
// covering:
//  - chemical products (track_chemicals=true): concentrate amount needed,
//    plus the finished spray-mix volume, both resolved per-visit via
//    calcChemicalAndSolution (chemical-mix-calc.ts) then summed — NOT summed
//    first and converted after, since which of the two is the rate's
//    "primary" number depends on the rate's own configured unit (see that
//    function's doc comment) and must be resolved before aggregating.
//    Prefers an already-entered crm_chemical_applications record for that
//    visit/product over the rate-based estimate (crm_service_chemicals +
//    crm_chemical_application_rates + property Area custom field) — same
//    math as the Materials Needed report's chemical branch, just scoped to
//    one day and grouped by crew instead of aggregated across all outstanding jobs.
//  - general (non-chemical) materials: explicit qty on crm_job_products,
//    same as Materials Needed's general branch.
// ============================================================

const OUTSTANDING_VISIT_STATUSES = ["scheduled", "dispatched", "in_progress"];
const TERMINAL_JOB_STATUSES = new Set(["cancelled", "completed", "hold"]);

export interface DailyLoadListJobRef {
  jobId: string;
  visitId: string | null;
  clientName: string;
  address: string | null;
  qty: number;
}

export interface DailyLoadListChemicalRow {
  productId: string;
  productName: string;
  concentrateQty: number;
  concentrateUnitName: string | null;
  mixVolumeQty: number | null;
  mixVolumeUnitName: string | null;
  visits: DailyLoadListJobRef[];
}

export interface DailyLoadListMaterialRow {
  productId: string;
  productName: string;
  qty: number;
  jobs: DailyLoadListJobRef[];
}

export interface DailyLoadListCrewGroup {
  crewId: string | null;
  crewName: string;
  crewColor: string | null;
  chemicals: DailyLoadListChemicalRow[];
  materials: DailyLoadListMaterialRow[];
}

export interface DailyLoadListResult {
  date: string;
  crews: DailyLoadListCrewGroup[];
  notes: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRateRow(row: any): ChemicalApplicationRate {
  return {
    id: row.id ?? "",
    orgId: "",
    productId: row.product_id,
    applicationMethodId: null,
    rateQty: row.rate_qty !== null ? Number(row.rate_qty) : null,
    unitOfMeasureId: row.unit_of_measure_id,
    areaQty: row.area_qty !== null ? Number(row.area_qty) : null,
    areaUnitId: row.area_unit_id,
    productCostCents: 0,
    isDefault: true,
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
    createdAt: "",
    updatedAt: "",
  };
}

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

export async function computeDailyLoadList(supabase: SupabaseClient, date: string): Promise<DailyLoadListResult> {
  const notes: string[] = [];

  // ── settings + chemical unit lookup (for mix-volume conversion) ────────────
  const { data: settings } = await supabase
    .from("crm_chemical_settings")
    .select("area_custom_field_id")
    .maybeSingle();
  const areaFieldId = settings?.area_custom_field_id ?? null;
  if (!areaFieldId) {
    notes.push(
      "Set an Area Custom Field under Settings > Chemical Tracking to estimate concentrate quantities for visits without an entered application record."
    );
  }

  const { data: unitRows } = await supabase.from("crm_chemical_lookup_items").select("*").is("deleted_at", null);
  const unitsById = new Map<string, ChemicalLookupItem>();
  for (const row of unitRows ?? []) unitsById.set(row.id, mapLookupItem(row));

  // ── crews (names/colors for grouping) ───────────────────────────────────────
  const { data: crewRows } = await supabase.from("crm_crews").select("id, name, color").is("deleted_at", null);
  const crewById = new Map<string, { name: string; color: string | null }>();
  for (const c of crewRows ?? []) crewById.set(c.id, { name: c.name, color: c.color });

  // ── visits scheduled for this date ──────────────────────────────────────────
  interface VisitRow {
    id: string;
    job_id: string;
    crew_id: string | null;
    crm_jobs: {
      id: string;
      crew_id: string | null;
      property_id: string | null;
      status: string | null;
      service_address: string | null;
      clients: { display_name: string | null } | null;
      crm_job_services:
        | { service_id: string | null; crm_services: { track_chemicals: boolean | null } | null }[]
        | null;
    } | null;
  }
  const visitsRaw = await fetchAllRows<VisitRow>(() =>
    supabase
      .from("crm_job_visits")
      .select(
        "id, job_id, crew_id, crm_jobs!inner(id, crew_id, property_id, status, service_address, clients:client_id(display_name), crm_job_services(service_id, crm_services:service_id(track_chemicals)))"
      )
      .eq("scheduled_date", date)
      .in("status", OUTSTANDING_VISIT_STATUSES)
      .is("deleted_at", null)
      .is("crm_jobs.deleted_at", null)
  );
  const liveVisits = visitsRaw.filter((v) => v.crm_jobs && !TERMINAL_JOB_STATUSES.has(v.crm_jobs.status ?? ""));

  function effectiveCrewId(v: VisitRow): string | null {
    return v.crew_id ?? v.crm_jobs?.crew_id ?? null;
  }

  // ── chemical product <-> service links + default rates ──────────────────────
  const { data: chemProductsRaw } = await supabase
    .from("product_items")
    .select("id, name")
    .eq("track_chemicals", true)
    .is("deleted_at", null);
  const chemicalProductIds = new Set((chemProductsRaw ?? []).map((p) => p.id));
  const chemProductName = new Map((chemProductsRaw ?? []).map((p) => [p.id, p.name] as const));

  const { data: serviceChemicals } = chemicalProductIds.size
    ? await supabase
        .from("crm_service_chemicals")
        .select("service_id, product_id")
        .in("product_id", [...chemicalProductIds])
    : { data: [] as { service_id: string; product_id: string }[] };
  const productIdsByService = new Map<string, string[]>();
  for (const sc of serviceChemicals ?? []) {
    const list = productIdsByService.get(sc.service_id) ?? [];
    list.push(sc.product_id);
    productIdsByService.set(sc.service_id, list);
  }

  const defaultRateByProduct = new Map<string, ChemicalApplicationRate>();
  if (chemicalProductIds.size > 0) {
    const { data: rates } = await supabase
      .from("crm_chemical_application_rates")
      .select(
        "product_id, rate_qty, unit_of_measure_id, area_qty, area_unit_id, mix_type, dilution_chemical_qty, dilution_chemical_unit_id, dilution_water_qty, dilution_water_unit_id, mix_product_id, mix_product_amount_qty, mix_product_amount_unit_id, mix_product_total_qty, mix_product_total_unit_id"
      )
      .in("product_id", [...chemicalProductIds])
      .eq("is_default", true);
    for (const r of rates ?? []) defaultRateByProduct.set(r.product_id, mapRateRow(r));
  }

  // ── property area values (fallback estimate when no application record yet) ─
  const propertyIds = [
    ...new Set(liveVisits.map((v) => v.crm_jobs?.property_id).filter(Boolean) as string[]),
  ];
  const areaValueByProperty = new Map<string, number>();
  if (areaFieldId && propertyIds.length > 0) {
    const { data: fieldValues } = await supabase
      .from("crm_property_custom_field_values")
      .select("property_id, value_number")
      .eq("field_def_id", areaFieldId)
      .in("property_id", propertyIds);
    for (const fv of fieldValues ?? []) {
      if (fv.value_number != null) areaValueByProperty.set(fv.property_id, Number(fv.value_number));
    }
  }

  // ── already-entered application records for these visits (preferred over estimate) ──
  const visitIds = liveVisits.map((v) => v.id);
  const enteredByVisitProduct = new Map<string, { chemicalAmount: number; solutionAmount: number | null }>();
  if (visitIds.length > 0) {
    const apps = await fetchAllRows<{
      visit_id: string | null;
      product_id: string | null;
      chemical_amount: number | null;
      solution_amount: number | null;
    }>(() =>
      supabase
        .from("crm_chemical_applications")
        .select("visit_id, product_id, chemical_amount, solution_amount")
        .in("visit_id", visitIds)
        .is("deleted_at", null)
    );
    for (const a of apps) {
      if (!a.visit_id || !a.product_id || a.chemical_amount == null) continue;
      enteredByVisitProduct.set(`${a.visit_id}:${a.product_id}`, {
        chemicalAmount: Number(a.chemical_amount),
        solutionAmount: a.solution_amount != null ? Number(a.solution_amount) : null,
      });
    }
  }

  // ── group by effective crew ──────────────────────────────────────────────────
  interface CrewAccum {
    crewId: string | null;
    crewName: string;
    crewColor: string | null;
    chemQtyByProduct: Map<string, number>;
    chemUnitIdByProduct: Map<string, string>;
    chemSolutionByProduct: Map<string, number>;
    chemSolutionUnitIdByProduct: Map<string, string>;
    chemVisitsByProduct: Map<string, DailyLoadListJobRef[]>;
    materialQtyByProduct: Map<string, number>;
    materialJobsByProduct: Map<string, DailyLoadListJobRef[]>;
  }
  const crewAccums = new Map<string, CrewAccum>();
  function getCrewAccum(crewId: string | null): CrewAccum {
    const key = crewId ?? "__unassigned__";
    let acc = crewAccums.get(key);
    if (!acc) {
      const crew = crewId ? crewById.get(crewId) : undefined;
      acc = {
        crewId,
        crewName: crew?.name ?? "Unassigned",
        crewColor: crew?.color ?? null,
        chemQtyByProduct: new Map(),
        chemUnitIdByProduct: new Map(),
        chemSolutionByProduct: new Map(),
        chemSolutionUnitIdByProduct: new Map(),
        chemVisitsByProduct: new Map(),
        materialQtyByProduct: new Map(),
        materialJobsByProduct: new Map(),
      };
      crewAccums.set(key, acc);
    }
    return acc;
  }

  const jobCrewMap = new Map<string, string | null>();
  const jobMetaMap = new Map<string, { clientName: string; address: string | null }>();

  for (const v of liveVisits) {
    const job = v.crm_jobs!;
    const crewId = effectiveCrewId(v);
    const acc = getCrewAccum(crewId);
    const clientName = job.clients?.display_name ?? "Job";
    const address = job.service_address ?? null;
    if (!jobCrewMap.has(job.id)) jobCrewMap.set(job.id, crewId);
    if (!jobMetaMap.has(job.id)) jobMetaMap.set(job.id, { clientName, address });

    const serviceIds = (job.crm_job_services ?? [])
      .filter((js) => js.crm_services?.track_chemicals)
      .map((js) => js.service_id)
      .filter(Boolean) as string[];
    const productIdsForVisit = new Set<string>();
    for (const sid of serviceIds) {
      for (const pid of productIdsByService.get(sid) ?? []) productIdsForVisit.add(pid);
    }

    for (const pid of productIdsForVisit) {
      const entered = enteredByVisitProduct.get(`${v.id}:${pid}`);
      const rate = defaultRateByProduct.get(pid);
      let chemicalAmount: number | null = null;
      let chemicalUnitId: string | null = rate?.unitOfMeasureId ?? null;
      let solutionAmount: number | null = null;
      let solutionUnitId: string | null = null;

      if (entered) {
        chemicalAmount = entered.chemicalAmount;
        solutionAmount = entered.solutionAmount;
      } else if (rate) {
        const areaValue = job.property_id ? areaValueByProperty.get(job.property_id) : undefined;
        if (areaValue != null) {
          // Resolved per-visit, not summed-then-converted — which of
          // chemical/solution is the rate's "primary" number depends on the
          // rate's own configured unit (see calcChemicalAndSolution).
          const computed = calcChemicalAndSolution(rate, areaValue, unitsById);
          if (computed) {
            chemicalAmount = computed.chemicalAmount;
            chemicalUnitId = computed.chemicalUnitOfMeasureId;
            solutionAmount = computed.solutionAmount;
            solutionUnitId = computed.solutionUnitOfMeasureId;
          }
        }
      }
      if (chemicalAmount == null || chemicalAmount <= 0) continue;

      acc.chemQtyByProduct.set(pid, (acc.chemQtyByProduct.get(pid) ?? 0) + chemicalAmount);
      if (chemicalUnitId && !acc.chemUnitIdByProduct.has(pid)) acc.chemUnitIdByProduct.set(pid, chemicalUnitId);
      if (solutionAmount != null) {
        acc.chemSolutionByProduct.set(pid, (acc.chemSolutionByProduct.get(pid) ?? 0) + solutionAmount);
        if (solutionUnitId && !acc.chemSolutionUnitIdByProduct.has(pid)) {
          acc.chemSolutionUnitIdByProduct.set(pid, solutionUnitId);
        }
      }
      const list = acc.chemVisitsByProduct.get(pid) ?? [];
      list.push({ jobId: job.id, visitId: v.id, clientName, address, qty: Math.round(chemicalAmount * 10000) / 10000 });
      acc.chemVisitsByProduct.set(pid, list);
    }
  }

  // ── general (non-chemical) materials, per job for the day ────────────────────
  const jobIds = [...jobCrewMap.keys()];
  const generalProductName = new Map<string, string>();
  if (jobIds.length > 0) {
    interface JobProductRow {
      product_id: string | null;
      qty: number;
      job_id: string;
      product_items: { name: string } | null;
    }
    const jobProducts = await fetchAllRows<JobProductRow>(() =>
      supabase
        .from("crm_job_products")
        .select("product_id, qty, job_id, product_items:product_id(name)")
        .in("job_id", jobIds)
        .eq("status", "pending")
        .is("deleted_at", null)
        .not("product_id", "is", null)
    );
    for (const row of jobProducts) {
      if (!row.product_id || chemicalProductIds.has(row.product_id)) continue;
      const crewId = jobCrewMap.get(row.job_id) ?? null;
      const acc = getCrewAccum(crewId);
      const meta = jobMetaMap.get(row.job_id);
      generalProductName.set(row.product_id, row.product_items?.name ?? "Material");
      acc.materialQtyByProduct.set(row.product_id, (acc.materialQtyByProduct.get(row.product_id) ?? 0) + Number(row.qty));
      const list = acc.materialJobsByProduct.get(row.product_id) ?? [];
      list.push({
        jobId: row.job_id,
        visitId: null,
        clientName: meta?.clientName ?? "Job",
        address: meta?.address ?? null,
        qty: Number(row.qty),
      });
      acc.materialJobsByProduct.set(row.product_id, list);
    }
  }

  // ── assemble ──────────────────────────────────────────────────────────────
  const crews: DailyLoadListCrewGroup[] = [...crewAccums.values()]
    .map((acc) => {
      const chemicals: DailyLoadListChemicalRow[] = [...acc.chemQtyByProduct.entries()].map(([pid, qty]) => {
        const concentrateUnitId = acc.chemUnitIdByProduct.get(pid);
        const concentrateUnitName = concentrateUnitId ? unitsById.get(concentrateUnitId)?.name ?? null : null;
        const solutionTotal = acc.chemSolutionByProduct.get(pid);
        const solutionUnitId = acc.chemSolutionUnitIdByProduct.get(pid);
        return {
          productId: pid,
          productName: chemProductName.get(pid) ?? "Chemical",
          concentrateQty: Math.round(qty * 10000) / 10000,
          concentrateUnitName,
          mixVolumeQty: solutionTotal != null ? Math.round(solutionTotal * 100) / 100 : null,
          mixVolumeUnitName: solutionUnitId ? unitsById.get(solutionUnitId)?.name ?? null : null,
          visits: (acc.chemVisitsByProduct.get(pid) ?? []).sort((a, b) => a.clientName.localeCompare(b.clientName)),
        };
      });
      chemicals.sort((a, b) => a.productName.localeCompare(b.productName));

      const materials: DailyLoadListMaterialRow[] = [...acc.materialQtyByProduct.entries()].map(([pid, qty]) => ({
        productId: pid,
        productName: generalProductName.get(pid) ?? "Material",
        qty: Math.round(qty * 10000) / 10000,
        jobs: (acc.materialJobsByProduct.get(pid) ?? []).sort((a, b) => a.clientName.localeCompare(b.clientName)),
      }));
      materials.sort((a, b) => a.productName.localeCompare(b.productName));

      return {
        crewId: acc.crewId,
        crewName: acc.crewName,
        crewColor: acc.crewColor,
        chemicals,
        materials,
      };
    })
    .filter((c) => c.chemicals.length > 0 || c.materials.length > 0)
    .sort((a, b) => a.crewName.localeCompare(b.crewName));

  if (crews.length === 0) {
    notes.push("No outstanding visits with chemical or material demand are scheduled for this date.");
  }

  return { date, crews, notes };
}
