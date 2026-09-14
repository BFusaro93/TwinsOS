import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";

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
/** Visit statuses whose materials have not been consumed yet: scheduled,
 *  dispatched (on the crew's board, not started) and in_progress (crew is on
 *  site — product for that visit still has to be on the truck). */
const OUTSTANDING_VISIT_STATUSES = ["scheduled", "dispatched", "in_progress"];
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
    const visitsRaw = await fetchAllRows<VisitRow>(() =>
      supabase
        .from("crm_job_visits")
        .select(
          "scheduled_date, crm_jobs!inner(id, property_id, status, scheduled_date, clients:client_id(display_name), crm_job_services(service_id))"
        )
        .in("status", OUTSTANDING_VISIT_STATUSES)
        .is("deleted_at", null)
        .is("crm_jobs.deleted_at", null)
    );
    for (const v of visitsRaw) {
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

    // Waiting-list jobs: no visit rows exist until the job is dispatched, so
    // query crm_jobs directly — but once a waiting-list job HAS live visits,
    // the visit branch above already counted it, so skip it here.
    interface WaitingJobRow {
      id: string;
      property_id: string | null;
      waiting_list_start: string | null;
      clients: { display_name: string | null } | null;
      crm_job_services: { service_id: string | null }[] | null;
      crm_job_visits: { id: string }[] | null;
    }
    const waitingRaw = await fetchAllRows<WaitingJobRow>(() =>
      supabase
        .from("crm_jobs")
        .select(
          "id, property_id, waiting_list_start, clients:client_id(display_name), crm_job_services(service_id), crm_job_visits(id)"
        )
        .eq("job_type", "waiting_list")
        .not("status", "in", '("cancelled","completed","hold")')
        .is("deleted_at", null)
        // Filters the embedded visits (not the jobs): only live visits count
        // as "already dispatched".
        .is("crm_job_visits.deleted_at", null)
        .limit(1, { referencedTable: "crm_job_visits" })
    );
    for (const job of waitingRaw) {
      if ((job.crm_job_visits ?? []).length > 0) continue;
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
  // Only 'pending' rows are outstanding demand. crm_job_products.status
  // (20260808153157): 'invoiced' and 'used_no_invoice' have already run
  // adjust_product_item_quantity(-qty) against quantity_on_hand, so counting
  // them again here would subtract the same product twice (once from on-hand,
  // once as demand); 'not_used' is cancelled and needs nothing.
  const jobProductsRaw = await fetchAllRows<JobProductRow>(() =>
    supabase
      .from("crm_job_products")
      .select(
        "product_id, qty, crm_jobs!inner(id, status, scheduled_date, waiting_list_start, clients:client_id(display_name))"
      )
      .not("product_id", "is", null)
      .eq("status", "pending")
      .is("deleted_at", null)
      .is("crm_jobs.deleted_at", null)
  );

  interface GeneralDemandEntry {
    jobId: string;
    jobName: string;
    qty: number;
    neededBy: string | null;
  }
  const generalDemandByProduct = new Map<string, GeneralDemandEntry[]>();
  for (const row of jobProductsRaw) {
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
    interface ReqLine {
      product_item_id: string | null;
      quantity: number;
      requisitions: { status: string } | null;
    }
    interface PoLine {
      id: string;
      product_item_id: string | null;
      quantity: number;
      purchase_orders: { status: string } | null;
    }
    const reqLines: ReqLine[] = [];
    const poLines: PoLine[] = [];
    // .in() goes on the URL — chunk so a large catalog doesn't blow the length cap.
    for (let i = 0; i < allProductIds.length; i += 200) {
      const chunk = allProductIds.slice(i, i + 200);
      reqLines.push(
        ...(await fetchAllRows<ReqLine>(() =>
          supabase
            .from("requisition_line_items")
            .select("product_item_id, quantity, requisitions!inner(status)")
            .in("product_item_id", chunk)
            .in("requisitions.status", [...ACTIVE_REQ_STATUSES])
        ))
      );
      poLines.push(
        ...(await fetchAllRows<PoLine>(() =>
          supabase
            .from("po_line_items")
            .select("id, product_item_id, quantity, purchase_orders!inner(status)")
            .in("product_item_id", chunk)
            .in("purchase_orders.status", [...ACTIVE_PO_STATUSES])
        ))
      );
    }
    for (const rl of reqLines) {
      if (!rl.product_item_id || !rl.requisitions || !ACTIVE_REQ_STATUSES.has(rl.requisitions.status)) continue;
      onOrderByProduct.set(rl.product_item_id, (onOrderByProduct.get(rl.product_item_id) ?? 0) + Number(rl.quantity));
    }

    // A partially received PO stays in 'partially_fulfilled' (or 'ordered')
    // with its full line quantity, but the received portion is already in
    // quantity_on_hand — so on-order is ordered minus received. There is no
    // running quantity_received on po_line_items; receipts live in
    // goods_receipt_lines (po_line_item_id, quantity_received), which is also
    // what the receiving RPCs' over-receipt guard sums.
    const activePoLines = poLines.filter(
      (pl) => pl.product_item_id && pl.purchase_orders && ACTIVE_PO_STATUSES.has(pl.purchase_orders.status)
    );
    const receivedByPoLine = new Map<string, number>();
    const poLineIds = activePoLines.map((pl) => pl.id);
    for (let i = 0; i < poLineIds.length; i += 200) {
      const chunk = poLineIds.slice(i, i + 200);
      const receiptLines = await fetchAllRows<{ po_line_item_id: string | null; quantity_received: number }>(() =>
        supabase
          .from("goods_receipt_lines")
          .select("po_line_item_id, quantity_received")
          .in("po_line_item_id", chunk)
      );
      for (const gr of receiptLines) {
        if (!gr.po_line_item_id) continue;
        receivedByPoLine.set(
          gr.po_line_item_id,
          (receivedByPoLine.get(gr.po_line_item_id) ?? 0) + Number(gr.quantity_received)
        );
      }
    }
    for (const pl of activePoLines) {
      const productId = pl.product_item_id as string;
      const outstanding = Math.max(Number(pl.quantity) - (receivedByPoLine.get(pl.id) ?? 0), 0);
      onOrderByProduct.set(productId, (onOrderByProduct.get(productId) ?? 0) + outstanding);
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
