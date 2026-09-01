import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Materials Needed for Upcoming Jobs
//
// Generalizes the chemical-only Material Resource Planning calc
// (originally in reports/definitions/chemical-reports.ts) to cover every
// product category, and to include waiting_list jobs (which have no
// crm_job_visits rows until dispatched, so the old visit-only query never
// saw them).
//
// Two demand branches feed one shortfall table:
//  - chemical products (track_chemicals=true): rate-based estimate, driven by
//    crm_service_chemicals + crm_chemical_application_rates + a property Area
//    custom field — unchanged math, just extended to also see waiting_list jobs.
//  - everything else: an explicit SUM(qty) from crm_job_products, which is
//    where job-level "what materials does this job need" actually lives
//    (populated either by hand on the job, or copied over from an estimate's
//    linked direct-cost lines when the job is created).
// ============================================================

export interface MaterialsNeededJobRef {
  jobId: string;
  jobName: string;
  qty: number;
  neededBy: string | null;
}

export interface MaterialsNeededRow {
  productId: string;
  productName: string;
  category: string;
  isChemical: boolean;
  neededQty: number;
  onHand: number;
  onOrder: number;
  shortfall: number;
  unitCostCents: number;
  nextNeededBy: string | null;
  jobsAffected: MaterialsNeededJobRef[];
}

export interface MaterialsNeededResult {
  rows: MaterialsNeededRow[];
  notes: string[];
}

const TERMINAL_JOB_STATUSES = new Set(["cancelled", "completed", "hold"]);
const ACTIVE_REQ_STATUSES = new Set(["pending_approval", "approved"]);
const ACTIVE_PO_STATUSES = new Set(["requested", "pending", "approved", "ordered", "partially_fulfilled"]);

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeMaterialsNeeded(supabase: SupabaseClient): Promise<MaterialsNeededResult> {
  const notes: string[] = [];

  // ── chemical products + their service links + application rates ────────────
  const { data: chemProducts, error: chemProductsErr } = await supabase
    .from("product_items")
    .select("id, name, category, quantity_on_hand, unit_cost")
    .eq("track_chemicals", true)
    .is("deleted_at", null);
  if (chemProductsErr) throw new Error(chemProductsErr.message);
  const chemicalProductIds = new Set((chemProducts ?? []).map((p) => p.id));

  const { data: settings } = await supabase
    .from("crm_chemical_settings")
    .select("area_custom_field_id")
    .maybeSingle();
  const areaFieldId = settings?.area_custom_field_id ?? null;
  if (!areaFieldId) {
    notes.push("Set an Area Custom Field under Settings > Chemical Tracking to estimate chemical quantities needed.");
  }

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

  interface ChemDemandEntry {
    jobId: string;
    jobName: string;
    propertyId: string | null;
    neededBy: string | null;
  }
  const chemDemandByProduct = new Map<string, ChemDemandEntry[]>();

  function addChemDemand(productId: string, entry: ChemDemandEntry) {
    const list = chemDemandByProduct.get(productId) ?? [];
    list.push(entry);
    chemDemandByProduct.set(productId, list);
  }

  if (chemicalProductIds.size > 0) {
    // Dispatched jobs: demand comes from outstanding scheduled visits.
    interface VisitRow {
      scheduled_date: string | null;
      crm_jobs: {
        id: string;
        property_id: string | null;
        status: string | null;
        scheduled_date: string | null;
        clients: { display_name: string | null } | null;
        crm_job_services: { service_id: string | null }[] | null;
      } | null;
    }
    const { data: visitsRaw, error: visitsErr } = await supabase
      .from("crm_job_visits")
      .select(
        "scheduled_date, crm_jobs!inner(id, property_id, status, scheduled_date, clients:client_id(display_name), crm_job_services(service_id))"
      )
      .eq("status", "scheduled")
      .is("deleted_at", null)
      .limit(5000);
    if (visitsErr) throw new Error(visitsErr.message);
    for (const v of (visitsRaw ?? []) as unknown as VisitRow[]) {
      const job = v.crm_jobs;
      if (!job || TERMINAL_JOB_STATUSES.has(job.status ?? "")) continue;
      const serviceIds = (job.crm_job_services ?? []).map((js) => js.service_id).filter(Boolean) as string[];
      const productIdsForVisit = new Set<string>();
      for (const sid of serviceIds) {
        for (const pid of productIdsByService.get(sid) ?? []) productIdsForVisit.add(pid);
      }
      for (const pid of productIdsForVisit) {
        addChemDemand(pid, {
          jobId: job.id,
          jobName: job.clients?.display_name ?? "Job",
          propertyId: job.property_id,
          neededBy: v.scheduled_date ?? job.scheduled_date,
        });
      }
    }

    // Waiting-list jobs: no visit rows exist yet, so query crm_jobs directly.
    interface WaitingJobRow {
      id: string;
      property_id: string | null;
      waiting_list_start: string | null;
      clients: { display_name: string | null } | null;
      crm_job_services: { service_id: string | null }[] | null;
    }
    const { data: waitingRaw, error: waitingErr } = await supabase
      .from("crm_jobs")
      .select("id, property_id, waiting_list_start, clients:client_id(display_name), crm_job_services(service_id)")
      .eq("job_type", "waiting_list")
      .not("status", "in", '("cancelled","completed","hold")')
      .is("deleted_at", null)
      .limit(5000);
    if (waitingErr) throw new Error(waitingErr.message);
    for (const job of (waitingRaw ?? []) as unknown as WaitingJobRow[]) {
      const serviceIds = (job.crm_job_services ?? []).map((js) => js.service_id).filter(Boolean) as string[];
      const productIdsForJob = new Set<string>();
      for (const sid of serviceIds) {
        for (const pid of productIdsByService.get(sid) ?? []) productIdsForJob.add(pid);
      }
      for (const pid of productIdsForJob) {
        addChemDemand(pid, {
          jobId: job.id,
          jobName: job.clients?.display_name ?? "Job",
          propertyId: job.property_id,
          neededBy: job.waiting_list_start,
        });
      }
    }
  }

  const distinctPropertyIds = [
    ...new Set([...chemDemandByProduct.values()].flat().map((d) => d.propertyId).filter(Boolean) as string[]),
  ];
  const areaValueByProperty = new Map<string, number>();
  if (areaFieldId && distinctPropertyIds.length > 0) {
    const { data: fieldValues } = await supabase
      .from("crm_property_custom_field_values")
      .select("property_id, value_number")
      .eq("field_def_id", areaFieldId)
      .in("property_id", distinctPropertyIds);
    for (const fv of fieldValues ?? []) {
      if (fv.value_number != null) areaValueByProperty.set(fv.property_id, Number(fv.value_number));
    }
  }

  const defaultRateByProduct = new Map<string, { rateQty: number | null; areaQty: number | null }>();
  if (chemicalProductIds.size > 0) {
    const { data: rates } = await supabase
      .from("crm_chemical_application_rates")
      .select("product_id, rate_qty, area_qty, is_default")
      .in("product_id", [...chemicalProductIds])
      .eq("is_default", true);
    for (const r of rates ?? []) {
      defaultRateByProduct.set(r.product_id, { rateQty: r.rate_qty, areaQty: r.area_qty });
    }
  }

  // ── general (non-chemical) material demand: explicit qty on crm_job_products ─
  interface JobProductRow {
    product_id: string | null;
    qty: number;
    crm_jobs: {
      id: string;
      status: string | null;
      scheduled_date: string | null;
      waiting_list_start: string | null;
      clients: { display_name: string | null } | null;
    } | null;
  }
  const { data: jobProductsRaw, error: jobProductsErr } = await supabase
    .from("crm_job_products")
    .select(
      "product_id, qty, crm_jobs!inner(id, status, scheduled_date, waiting_list_start, clients:client_id(display_name))"
    )
    .not("product_id", "is", null)
    .is("deleted_at", null)
    .limit(5000);
  if (jobProductsErr) throw new Error(jobProductsErr.message);

  interface GeneralDemandEntry {
    jobId: string;
    jobName: string;
    qty: number;
    neededBy: string | null;
  }
  const generalDemandByProduct = new Map<string, GeneralDemandEntry[]>();
  for (const row of (jobProductsRaw ?? []) as unknown as JobProductRow[]) {
    const job = row.crm_jobs;
    const productId = row.product_id;
    if (!job || !productId) continue;
    if (TERMINAL_JOB_STATUSES.has(job.status ?? "")) continue;
    if (chemicalProductIds.has(productId)) continue; // chemical branch already covers this product
    const list = generalDemandByProduct.get(productId) ?? [];
    list.push({
      jobId: job.id,
      jobName: job.clients?.display_name ?? "Job",
      qty: Number(row.qty),
      neededBy: job.scheduled_date ?? job.waiting_list_start,
    });
    generalDemandByProduct.set(productId, list);
  }

  const generalProductIds = [...generalDemandByProduct.keys()];
  const { data: generalProducts, error: generalProductsErr } = generalProductIds.length
    ? await supabase
        .from("product_items")
        .select("id, name, category, quantity_on_hand, unit_cost")
        .in("id", generalProductIds)
        .is("deleted_at", null)
    : { data: [] as { id: string; name: string; category: string; quantity_on_hand: number | null; unit_cost: number | null }[], error: null };
  if (generalProductsErr) throw new Error(generalProductsErr.message);

  // ── on-hand / on-order, shared across both branches ─────────────────────────
  const allProductIds = [...new Set([...chemicalProductIds, ...generalProductIds])];
  const onOrderByProduct = new Map<string, number>();
  if (allProductIds.length > 0) {
    const { data: reqLines } = await supabase
      .from("requisition_line_items")
      .select("product_item_id, quantity, requisitions!inner(status)")
      .in("product_item_id", allProductIds);
    for (const rl of (reqLines ?? []) as unknown as {
      product_item_id: string | null;
      quantity: number;
      requisitions: { status: string } | null;
    }[]) {
      if (!rl.product_item_id || !rl.requisitions || !ACTIVE_REQ_STATUSES.has(rl.requisitions.status)) continue;
      onOrderByProduct.set(rl.product_item_id, (onOrderByProduct.get(rl.product_item_id) ?? 0) + rl.quantity);
    }

    const { data: poLines } = await supabase
      .from("po_line_items")
      .select("product_item_id, quantity, purchase_orders!inner(status)")
      .in("product_item_id", allProductIds);
    for (const pl of (poLines ?? []) as unknown as {
      product_item_id: string | null;
      quantity: number;
      purchase_orders: { status: string } | null;
    }[]) {
      if (!pl.product_item_id || !pl.purchase_orders || !ACTIVE_PO_STATUSES.has(pl.purchase_orders.status)) continue;
      onOrderByProduct.set(pl.product_item_id, (onOrderByProduct.get(pl.product_item_id) ?? 0) + pl.quantity);
    }
  }

  // ── assemble rows ────────────────────────────────────────────────────────────
  const rows: MaterialsNeededRow[] = [];

  for (const p of chemProducts ?? []) {
    const demand = chemDemandByProduct.get(p.id) ?? [];
    if (demand.length === 0) continue;
    const rate = defaultRateByProduct.get(p.id);

    const perJobQty = new Map<string, number>();
    const perJobMeta = new Map<string, { jobName: string; neededBy: string | null }>();
    let neededQty = 0;
    let nextNeededBy: string | null = null;
    for (const d of demand) {
      const areaValue = d.propertyId ? areaValueByProperty.get(d.propertyId) : undefined;
      const portion = rate?.areaQty && rate.rateQty != null && areaValue != null
        ? (areaValue / rate.areaQty) * rate.rateQty
        : 0;
      neededQty += portion;
      perJobQty.set(d.jobId, (perJobQty.get(d.jobId) ?? 0) + portion);
      perJobMeta.set(d.jobId, { jobName: d.jobName, neededBy: d.neededBy });
      nextNeededBy = earliest(nextNeededBy, d.neededBy);
    }

    const onHand = p.quantity_on_hand ?? 0;
    const onOrder = onOrderByProduct.get(p.id) ?? 0;
    rows.push({
      productId: p.id,
      productName: p.name,
      category: p.category,
      isChemical: true,
      neededQty: Math.round(neededQty * 10000) / 10000,
      onHand,
      onOrder,
      shortfall: Math.round((onHand + onOrder - neededQty) * 10000) / 10000,
      unitCostCents: p.unit_cost ?? 0,
      nextNeededBy,
      jobsAffected: [...perJobQty.entries()].map(([jobId, qty]) => ({
        jobId,
        jobName: perJobMeta.get(jobId)?.jobName ?? "Job",
        qty: Math.round(qty * 10000) / 10000,
        neededBy: perJobMeta.get(jobId)?.neededBy ?? null,
      })),
    });
  }

  for (const p of generalProducts ?? []) {
    const demand = generalDemandByProduct.get(p.id) ?? [];
    if (demand.length === 0) continue;

    const perJobQty = new Map<string, number>();
    const perJobMeta = new Map<string, { jobName: string; neededBy: string | null }>();
    let neededQty = 0;
    let nextNeededBy: string | null = null;
    for (const d of demand) {
      neededQty += d.qty;
      perJobQty.set(d.jobId, (perJobQty.get(d.jobId) ?? 0) + d.qty);
      perJobMeta.set(d.jobId, { jobName: d.jobName, neededBy: d.neededBy });
      nextNeededBy = earliest(nextNeededBy, d.neededBy);
    }

    const onHand = p.quantity_on_hand ?? 0;
    const onOrder = onOrderByProduct.get(p.id) ?? 0;
    rows.push({
      productId: p.id,
      productName: p.name,
      category: p.category,
      isChemical: false,
      neededQty: Math.round(neededQty * 10000) / 10000,
      onHand,
      onOrder,
      shortfall: Math.round((onHand + onOrder - neededQty) * 10000) / 10000,
      unitCostCents: p.unit_cost ?? 0,
      nextNeededBy,
      jobsAffected: [...perJobQty.entries()].map(([jobId, qty]) => ({
        jobId,
        jobName: perJobMeta.get(jobId)?.jobName ?? "Job",
        qty,
        neededBy: perJobMeta.get(jobId)?.neededBy ?? null,
      })),
    });
  }

  rows.sort((a, b) => a.shortfall - b.shortfall);

  return { rows, notes };
}
