import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { calcChemicalAndSolution, createQuantityAccumulator } from "@/lib/chemical-mix-calc";
import type { QuantityAccumulator } from "@/lib/chemical-mix-calc";
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
//    calcChemicalAndSolution (chemical-mix-calc.ts) then summed through a
//    unit-aware accumulator — NOT summed first and converted after, since
//    which of the two is the rate's "primary" number depends on the rate's
//    own configured unit (see that function's doc comment) and must be
//    resolved before aggregating, and the resolved unit is not the same on
//    every stop.
//    Prefers an already-entered crm_chemical_applications record for that
//    visit/product over the rate-based estimate (crm_service_chemicals +
//    crm_chemical_application_rates + property Area custom field) — same
//    math as the Materials Needed report's chemical branch, just scoped to
//    one day and grouped by crew instead of aggregated across all outstanding jobs.
//  - general (non-chemical) materials: explicit qty on crm_job_products,
//    same as Materials Needed's general branch.
//
// This report is read by a crew loading a sprayer, so every quantity it
// prints has to be trustworthy: anywhere the units involved can't be reduced
// to one number the row reports *why* instead of printing a plausible-looking
// figure (see DailyLoadListChemicalRow.unresolvedReason).
// ============================================================

const OUTSTANDING_VISIT_STATUSES = ["scheduled", "dispatched", "in_progress"];
const TERMINAL_JOB_STATUSES = new Set(["cancelled", "completed", "hold"]);

const MIXED_UNITS_REASON = "Stops use different units — record them in one unit to get a truck total";
const NO_UNIT_REASON = "No unit set on the application rate — set one under the product's Application Rates";

export interface DailyLoadListJobRef {
  jobId: string;
  visitId: string | null;
  clientName: string;
  address: string | null;
  /** null when this stop's own rows don't share a unit. */
  qty: number | null;
  /** Unit `qty` is in — null when the rate/application never named one. */
  unitName: string | null;
}

export interface DailyLoadListChemicalRow {
  productId: string;
  productName: string;
  /** null when the stops' amounts can't be reduced to a single unit. */
  concentrateQty: number | null;
  concentrateUnitName: string | null;
  mixVolumeQty: number | null;
  mixVolumeUnitName: string | null;
  /** Set when concentrateQty is null — what to show the crew instead of a number. */
  unresolvedReason: string | null;
  visits: DailyLoadListJobRef[];
}

export interface DailyLoadListMaterialRow {
  productId: string;
  productName: string;
  qty: number;
  /** Other crews this same job's materials also appear under (see below). */
  sharedWithCrews: string[];
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
  const unitName = (id: string | null | undefined): string | null =>
    id ? unitsById.get(id)?.name ?? null : null;

  // ── crews (names/colors for grouping) ───────────────────────────────────────
  const { data: crewRows } = await supabase.from("crm_crews").select("id, name, color").is("deleted_at", null);
  const crewById = new Map<string, { name: string; color: string | null }>();
  for (const c of crewRows ?? []) crewById.set(c.id, { name: c.name, color: c.color });

  // ── visits scheduled for this date ──────────────────────────────────────────
  interface VisitRow {
    id: string;
    job_id: string;
    crew_id: string | null;
    job_service_id: string | null;
    crm_jobs: {
      id: string;
      crew_id: string | null;
      property_id: string | null;
      status: string | null;
      service_address: string | null;
      clients: { display_name: string | null } | null;
      crm_job_services:
        | {
            id: string;
            service_id: string | null;
            included: boolean | null;
            crm_services: { track_chemicals: boolean | null } | null;
          }[]
        | null;
    } | null;
  }
  const visitsRaw = await fetchAllRows<VisitRow>(() =>
    supabase
      .from("crm_job_visits")
      .select(
        "id, job_id, crew_id, job_service_id, crm_jobs!inner(id, crew_id, property_id, status, service_address, clients:client_id(display_name), crm_job_services(id, service_id, included, crm_services:service_id(track_chemicals)))"
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

  /**
   * Services a visit actually covers. A visit scoped to one job service
   * (job_service_id) covers only that service — reading the job's whole
   * service list per visit is what made a Mow + Spray day count the spray's
   * chemical twice. Same rule as fetchVisitServiceIds() in use-crm-jobs.ts
   * and /api/crm/visits/[visitId]/complete. Services excluded from the job
   * (included = false) aren't being performed and need nothing loaded.
   */
  function chemicalServiceIdsForVisit(v: VisitRow): string[] {
    const jobServices = (v.crm_jobs?.crm_job_services ?? []).filter(
      (js) => js.included !== false && js.crm_services?.track_chemicals && js.service_id
    );
    const scoped = v.job_service_id ? jobServices.filter((js) => js.id === v.job_service_id) : jobServices;
    return scoped.map((js) => js.service_id as string);
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
  //
  // An entered record stores its own unit_of_measure_id / solution_unit_of_measure_id,
  // which is frequently NOT the rate's unit: the rate can be "1 Gallon per
  // 1,000 sq ft" (finished mix) while the saved concentrate figure is in fluid
  // ounces. Labelling the saved number with the rate's unit overstated it 128x.
  // A visit can also hold more than one row for the same product (a second
  // spot application), so these accumulate rather than overwrite.
  interface EnteredEntry {
    chemical: { amount: number; unitId: string | null }[];
    solution: { amount: number; unitId: string | null }[];
  }
  const visitIds = liveVisits.map((v) => v.id);
  const enteredByVisitProduct = new Map<string, EnteredEntry>();
  if (visitIds.length > 0) {
    const apps = await fetchAllRows<{
      visit_id: string | null;
      product_id: string | null;
      chemical_amount: number | null;
      solution_amount: number | null;
      unit_of_measure_id: string | null;
      solution_unit_of_measure_id: string | null;
    }>(() =>
      supabase
        .from("crm_chemical_applications")
        .select(
          "visit_id, product_id, chemical_amount, solution_amount, unit_of_measure_id, solution_unit_of_measure_id"
        )
        .in("visit_id", visitIds)
        .is("deleted_at", null)
    );
    for (const a of apps) {
      if (!a.visit_id || !a.product_id || a.chemical_amount == null) continue;
      const key = `${a.visit_id}:${a.product_id}`;
      const entry = enteredByVisitProduct.get(key) ?? { chemical: [], solution: [] };
      entry.chemical.push({ amount: Number(a.chemical_amount), unitId: a.unit_of_measure_id });
      if (a.solution_amount != null) {
        entry.solution.push({ amount: Number(a.solution_amount), unitId: a.solution_unit_of_measure_id });
      }
      enteredByVisitProduct.set(key, entry);
    }
  }

  // ── resolve demand per (crew, job, service, product) ─────────────────────────
  //
  // Keyed by service rather than by visit so a job whose services are split
  // across several same-day visits isn't loaded twice for the same spray; kept
  // per crew so a job split BETWEEN crews still puts the product on both
  // trucks. An entered record always beats the rate estimate for the same key.
  interface ChemDemand {
    crewId: string | null;
    jobId: string;
    visitId: string;
    clientName: string;
    address: string | null;
    productId: string;
    chemical: { amount: number; unitId: string | null }[];
    solution: { amount: number; unitId: string | null }[];
    entered: boolean;
  }
  const demandByKey = new Map<string, ChemDemand>();

  const jobCrewIds = new Map<string, Set<string | null>>();
  const jobMetaMap = new Map<string, { clientName: string; address: string | null }>();

  for (const v of liveVisits) {
    const job = v.crm_jobs!;
    const crewId = effectiveCrewId(v);
    const clientName = job.clients?.display_name ?? "Job";
    const address = job.service_address ?? null;
    const crewSet = jobCrewIds.get(job.id) ?? new Set<string | null>();
    crewSet.add(crewId);
    jobCrewIds.set(job.id, crewSet);
    if (!jobMetaMap.has(job.id)) jobMetaMap.set(job.id, { clientName, address });

    for (const sid of chemicalServiceIdsForVisit(v)) {
      for (const pid of productIdsByService.get(sid) ?? []) {
        const key = `${crewId ?? "__unassigned__"}:${job.id}:${sid}:${pid}`;
        const entered = enteredByVisitProduct.get(`${v.id}:${pid}`);
        const existing = demandByKey.get(key);
        // An entered record always wins; otherwise the first visit to resolve
        // this service's product for this crew is the one that counts.
        if (existing && (existing.entered || !entered)) continue;

        if (entered) {
          demandByKey.set(key, {
            crewId,
            jobId: job.id,
            visitId: v.id,
            clientName,
            address,
            productId: pid,
            chemical: entered.chemical,
            solution: entered.solution,
            entered: true,
          });
          continue;
        }

        const rate = defaultRateByProduct.get(pid);
        const areaValue = job.property_id ? areaValueByProperty.get(job.property_id) : undefined;
        if (!rate || areaValue == null) continue;
        // Resolved per-visit, not summed-then-converted — which of
        // chemical/solution is the rate's "primary" number depends on the
        // rate's own configured unit (see calcChemicalAndSolution).
        const computed = calcChemicalAndSolution(rate, areaValue, unitsById);
        if (!computed) continue;
        demandByKey.set(key, {
          crewId,
          jobId: job.id,
          visitId: v.id,
          clientName,
          address,
          productId: pid,
          chemical: [{ amount: computed.chemicalAmount, unitId: computed.chemicalUnitOfMeasureId }],
          solution:
            computed.solutionAmount != null
              ? [{ amount: computed.solutionAmount, unitId: computed.solutionUnitOfMeasureId }]
              : [],
          entered: false,
        });
      }
    }
  }

  // ── group by effective crew ──────────────────────────────────────────────────
  interface CrewAccum {
    crewId: string | null;
    crewName: string;
    crewColor: string | null;
    chemByProduct: Map<string, QuantityAccumulator>;
    solutionByProduct: Map<string, QuantityAccumulator>;
    chemVisitsByProduct: Map<string, DailyLoadListJobRef[]>;
    materialQtyByProduct: Map<string, number>;
    materialJobsByProduct: Map<string, DailyLoadListJobRef[]>;
    materialSharedCrews: Map<string, Set<string>>;
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
        chemByProduct: new Map(),
        solutionByProduct: new Map(),
        chemVisitsByProduct: new Map(),
        materialQtyByProduct: new Map(),
        materialJobsByProduct: new Map(),
        materialSharedCrews: new Map(),
      };
      crewAccums.set(key, acc);
    }
    return acc;
  }

  for (const d of demandByKey.values()) {
    if (!d.chemical.some((c) => c.amount > 0)) continue;
    const acc = getCrewAccum(d.crewId);

    // Every row feeds the crew total directly — a stop whose own rows disagree
    // on a unit must still land in the total (as an unresolved one), never be
    // dropped, or the truck is loaded short with no warning.
    let chemAcc = acc.chemByProduct.get(d.productId);
    if (!chemAcc) {
      chemAcc = createQuantityAccumulator(unitsById);
      acc.chemByProduct.set(d.productId, chemAcc);
    }
    for (const c of d.chemical) chemAcc.add(c.amount, c.unitId);

    // Per-stop figure for the "which stops drive this" list — only meaningful
    // as one number when that stop's own rows agree on a unit.
    const stopTotal = createQuantityAccumulator(unitsById);
    for (const c of d.chemical) stopTotal.add(c.amount, c.unitId);
    const stop = stopTotal.total();

    if (d.solution.length > 0) {
      let solAcc = acc.solutionByProduct.get(d.productId);
      if (!solAcc) {
        solAcc = createQuantityAccumulator(unitsById);
        acc.solutionByProduct.set(d.productId, solAcc);
      }
      for (const s of d.solution) solAcc.add(s.amount, s.unitId);
    }

    const list = acc.chemVisitsByProduct.get(d.productId) ?? [];
    list.push({
      jobId: d.jobId,
      visitId: d.visitId,
      clientName: d.clientName,
      address: d.address,
      qty: stop.amount != null ? Math.round(stop.amount * 10000) / 10000 : null,
      unitName: unitName(stop.unitId),
    });
    acc.chemVisitsByProduct.set(d.productId, list);
  }

  // ── general (non-chemical) materials, per job for the day ────────────────────
  //
  // crm_job_products hangs off the JOB, not the visit, so a job worked by two
  // crews on the same day has no way to say whose truck the mulch goes on.
  // Putting it on whichever visit happened to be iterated first left the other
  // crew on site without it, so the row is listed for every crew serving the
  // job and flags the other crews it is shared with.
  const jobIds = [...jobCrewIds.keys()];
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
      const crewIds = [...(jobCrewIds.get(row.job_id) ?? new Set<string | null>([null]))];
      const meta = jobMetaMap.get(row.job_id);
      generalProductName.set(row.product_id, row.product_items?.name ?? "Material");
      for (const crewId of crewIds) {
        const acc = getCrewAccum(crewId);
        acc.materialQtyByProduct.set(
          row.product_id,
          (acc.materialQtyByProduct.get(row.product_id) ?? 0) + Number(row.qty)
        );
        const list = acc.materialJobsByProduct.get(row.product_id) ?? [];
        list.push({
          jobId: row.job_id,
          visitId: null,
          clientName: meta?.clientName ?? "Job",
          address: meta?.address ?? null,
          qty: Number(row.qty),
          unitName: null,
        });
        acc.materialJobsByProduct.set(row.product_id, list);

        const others = crewIds
          .filter((c) => c !== crewId)
          .map((c) => (c ? crewById.get(c)?.name ?? "Unassigned" : "Unassigned"));
        if (others.length > 0) {
          const shared = acc.materialSharedCrews.get(row.product_id) ?? new Set<string>();
          for (const name of others) shared.add(name);
          acc.materialSharedCrews.set(row.product_id, shared);
        }
      }
    }
  }

  // ── assemble ──────────────────────────────────────────────────────────────
  let anyUnresolved = false;
  const crews: DailyLoadListCrewGroup[] = [...crewAccums.values()]
    .map((acc) => {
      const chemicals: DailyLoadListChemicalRow[] = [...acc.chemByProduct.entries()].map(([pid, chemAcc]) => {
        const concentrate = chemAcc.total();
        const solution = acc.solutionByProduct.get(pid)?.total();
        const unresolvedReason =
          concentrate.amount == null
            ? MIXED_UNITS_REASON
            : concentrate.unitId == null
              ? NO_UNIT_REASON
              : null;
        if (unresolvedReason) anyUnresolved = true;
        return {
          productId: pid,
          productName: chemProductName.get(pid) ?? "Chemical",
          concentrateQty:
            concentrate.amount != null && concentrate.unitId != null
              ? Math.round(concentrate.amount * 10000) / 10000
              : null,
          concentrateUnitName: unitName(concentrate.unitId),
          // A mix volume that can't be expressed in one unit is simply not
          // shown — it's an aid, and a wrong tank size is worse than none.
          mixVolumeQty:
            solution?.amount != null && solution.unitId != null
              ? Math.round(solution.amount * 100) / 100
              : null,
          mixVolumeUnitName: unitName(solution?.unitId ?? null),
          unresolvedReason,
          visits: (acc.chemVisitsByProduct.get(pid) ?? []).sort((a, b) => a.clientName.localeCompare(b.clientName)),
        };
      });
      chemicals.sort((a, b) => a.productName.localeCompare(b.productName));

      const materials: DailyLoadListMaterialRow[] = [...acc.materialQtyByProduct.entries()].map(([pid, qty]) => ({
        productId: pid,
        productName: generalProductName.get(pid) ?? "Material",
        qty: Math.round(qty * 10000) / 10000,
        sharedWithCrews: [...(acc.materialSharedCrews.get(pid) ?? [])].sort(),
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

  if (anyUnresolved) {
    notes.push(
      "Some chemicals couldn't be totalled because their stops don't share a unit — those rows show the reason instead of a quantity."
    );
  }
  if (crews.length === 0) {
    notes.push("No outstanding visits with chemical or material demand are scheduled for this date.");
  }

  return { date, crews, notes };
}
