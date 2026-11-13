"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapVisit } from "./use-crm-jobs";
import type { CRMJobVisit } from "@/types/crm-jobs";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { computeDueDate, resolveInvoiceTerms } from "@/lib/invoices/due-date";
import { invalidateClientBalances } from "@/lib/hooks/client-balance-invalidation";
import { contractCoversServiceDay } from "@/lib/contract-billing";
import { hourlyStopShares, productLineTotalCents, type SnowBillableVisit, type SnowVisitProduct } from "@/lib/snow-billing";

/** `.in()` list size per request — keeps the query string well under URL limits. */
const IN_CHUNK = 200;

function chunkIds<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// "per_event"/"per_event_per_inch" bill the whole STORM, not each dispatch
// within it — a job with 2 visits during one storm (e.g. morning + afternoon
// push) is one event, not two. Unlike "per_push_per_inch" (deliberately
// per-visit) and "hourly" (naturally per-visit), these two must be billed
// once per (job, storm event), or a multi-visit storm gets charged twice.
export function isPerEventBilling(invoiceType: string): boolean {
  return invoiceType === "per_event" || invoiceType === "per_event_per_inch";
}

/** Group key for visits that must collapse to a single charge. Falls back to
 *  the visit's own id (i.e. no grouping) for per-visit billing types. */
export function billingGroupKey(visit: CRMJobVisit): string {
  const invoiceType = visit.job?.invoiceType ?? "per_event";
  if (!isPerEventBilling(invoiceType)) return visit.id;
  // stormEventId is only set by the dispatch board's storm flow — a visit
  // created directly (crew app, manual entry) leaves it null. Falling back
  // to a constant would collapse every storm-less visit of a job, across
  // every date, into one billed event — fall back to the visit's own date
  // instead so separate storms still separate into separate events.
  return `${visit.jobId}::${visit.stormEventId ?? `date:${visit.scheduledDate}`}`;
}

export interface SnowContractRow {
  id: string;
  status: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
  start_date: string | null;
  end_date: string | null;
  /** Storms before start_date / after end_date: 'dont_service', 'included' or 'bill_per_event' (default). */
  snow_outside_dates: string | null;
  /** bill_per_event: a Monthly Flat Rate job's price per storm outside the dates. */
  snow_outside_event_price_cents?: number | null;
  // What the contract has billed — a cancelled/expired/paused contract still
  // covers storms inside a cycle it already invoiced (contractCoversServiceDay).
  last_billed_date?: string | null;
  billing_anchor_date?: string | null;
  first_period_prorated_at?: string | null;
  billing_frequency?: string | null;
  billing_day_of_month?: number | null;
  bill_month_in_advance?: boolean | null;
  signed_at?: string | null;
  created_at?: string | null;
}

/** Missing, deleted, switched inactive, cancelled or expired — covers nothing. */
function isSnowContractDead(c: SnowContractRow | undefined): boolean {
  return !c || c.deleted_at != null || c.is_active === false || c.status === "cancelled" || c.status === "expired";
}

function stormsOutsideDatesIncluded(c: SnowContractRow): boolean {
  return c.snow_outside_dates === "included";
}

/** Billing: the contract does NOT cover a storm visit on `day` (so Snow
 *  Invoicing bills it per event). A live contract covers visits inside its
 *  start–end dates (and past the end through the last cycle it billed in
 *  full), and visits outside them only when the contract's "Storms outside the
 *  contract dates" is set to included. A cancelled / expired / switched-off
 *  contract covers only storms inside a cycle it already billed — anything
 *  later bills per event, anything earlier must not be billed twice. A
 *  missing or deleted contract covers nothing. Draft/sent contracts are NOT
 *  ended. Same rule as the per-visit auto-invoice (contractCoversServiceDay). */
export function isSnowContractEnded(c: SnowContractRow | undefined, day: string | null | undefined): boolean {
  if (!c || c.deleted_at != null) return true;
  if (!day) return isSnowContractDead(c);
  return !contractCoversServiceDay(c, day, { outsideDatesIncluded: stormsOutsideDatesIncluded(c) });
}

/** Dispatch: the contract's job is not served on `day` (the STORM's dispatch
 *  date, not today) — the contract is dead, or the day is before its start
 *  date or after its end date and the contract is set to "Don't service"
 *  storms outside its dates. "Included" and "Bill per event" storms are
 *  dispatched (covered by the price, or billed in Snow Invoicing). */
export function isSnowContractClosedForDispatch(c: SnowContractRow | undefined, day: string): boolean {
  if (isSnowContractDead(c)) return true;
  const contract = c as SnowContractRow;
  if (contract.snow_outside_dates !== "dont_service") return false;
  return (contract.start_date != null && day < contract.start_date)
    || (contract.end_date != null && day > contract.end_date);
}

/** Snow Invoicing, Monthly Flat Rate job on a storm its contract doesn't
 *  cover: the contract's price per storm, or why there is none. */
function flatRateOutsidePricing(c: SnowContractRow | undefined): { priceCents: number | null; warning: string | null } {
  if (!c) return { priceCents: null, warning: "Monthly Flat Rate job without a contract — nothing to bill it at." };
  const price = c.snow_outside_event_price_cents ?? null;
  if (c.snow_outside_dates === "bill_per_event" && price != null && price > 0) return { priceCents: price, warning: null };
  if (c.snow_outside_dates === "dont_service") {
    return { priceCents: null, warning: "The contract is set to not service storms outside its dates — set a price per storm on the contract to bill this one." };
  }
  return { priceCents: null, warning: "No price per storm is set on the contract for storms outside its dates — set one on the contract to bill this storm." };
}

export async function loadContractsById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  contractIds: string[]
): Promise<Map<string, SnowContractRow>> {
  const out = new Map<string, SnowContractRow>();
  for (const ids of chunkIds(contractIds)) {
    const rows = await fetchAllRows<SnowContractRow>(() =>
      supabase
        .from("crm_contracts")
        .select("id, status, is_active, deleted_at, start_date, end_date, snow_outside_dates, snow_outside_event_price_cents, last_billed_date, billing_anchor_date, first_period_prorated_at, billing_frequency, billing_day_of_month, bill_month_in_advance, signed_at, created_at")
        .in("id", ids)
        .order("id", { ascending: true })
    );
    for (const c of rows) out.set(c.id, c);
  }
  return out;
}

// ── uninvoiced snow visits ────────────────────────────────────────────────────

/** A queued visit, flagged when its job already has an unlinked invoice line
 *  for the same date (`null` = that invoice has no number yet). */
export type UninvoicedSnowVisit = SnowBillableVisit & { possibleDuplicateInvoiceNumber?: number | null };

export function useUninvoicedSnowVisits(filters: {
  stormEventId?: string;
  clientId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  return useQuery({
    queryKey: ["snow-invoicing", "uninvoiced-visits", filters],
    queryFn: async () => {
      const supabase = createClient();

      // Paged: every completed snow visit ever stays in this result (invoiced
      // ones included — the per-event group check below needs them), so a
      // single select hit PostgREST's 1000-row cap and, oldest first, the
      // newest storms were the ones silently cut off the queue. id is the
      // tiebreaker that keeps the page boundaries stable.
      const buildVisitsQuery = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any)
          .from("crm_job_visits")
          .select(`
            *,
            clients(display_name, primary_phone),
            crm_crews!crm_job_visits_crew_id_fkey(name),
            crm_jobs!inner(*, crm_crews(name), crm_job_services(*))
          `)
          .eq("status", "completed")
          .eq("crm_jobs.job_type", "snow")
          .is("deleted_at", null);

        if (filters.stormEventId) q = q.eq("storm_event_id", filters.stormEventId);
        if (filters.clientId) q = q.eq("client_id", filters.clientId);
        if (filters.fromDate) q = q.gte("scheduled_date", filters.fromDate);
        if (filters.toDate) q = q.lte("scheduled_date", filters.toDate);
        return q.order("scheduled_date", { ascending: true }).order("id", { ascending: true });
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await fetchAllRows<any>(buildVisitsQuery);
      // contract_id is filtered at the DB level, but invoice_type is filtered
      // here client-side (a plain .neq() would silently drop jobs where
      // invoice_type is NULL, per SQL's three-valued NULL comparison logic —
      // those should default to per-event billing, not be excluded).
      // Contract-linked snow jobs are billed on the contract's cycle only while
      // that contract is in force and the storm falls inside its dates (or the
      // contract includes storms outside them). Once it is cancelled / expired /
      // inactive / deleted / outside its dates nothing else bills the visit (the auto-invoice
      // path skips snow jobs, the contract cron has stopped) — it used to vanish
      // from this queue too, so those storms were never invoiced. Mirrors the
      // "ended" test in complete-visit-side-effects.
      const contractIds = [...new Set(
        ((data.map(mapVisit)) as CRMJobVisit[]).map((v) => v.job?.contractId).filter((c): c is string => !!c)
      )];
      const contractById = await loadContractsById(supabase, contractIds);
      const contractEnded = (v: CRMJobVisit): boolean =>
        isSnowContractEnded(v.job?.contractId ? contractById.get(v.job.contractId) : undefined, v.scheduledDate);
      // A Monthly Flat Rate job bills only through its contract, so it reaches
      // this queue only for a storm the contract doesn't cover (outside its
      // dates, or after it ended) — priced at the contract's price per storm.
      const visits = ((data.map(mapVisit)) as CRMJobVisit[])
        .filter((v) => v.job?.invoiceType !== "monthly_flat_rate" || !!v.job?.contractId)
        .filter((v) => !v.job?.contractId || contractEnded(v));

      if (visits.length === 0) return [];

      // Exclude visits that already have a line item on a live (non-deleted,
      // non-void) invoice (visit_id), so generating invoices is idempotent. Line
      // items have no deleted_at of their own — deletion happens via the parent
      // invoice.
      // Chunked — one .in() over thousands of visit ids overflows the URL.
      const invoicedVisitIds = new Set<string>();
      for (const ids of chunkIds(visits.map((v) => v.id))) {
        const lines = await fetchAllRows<{ visit_id: string | null }>(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("crm_invoice_line_items")
            .select("id, visit_id, crm_invoices!inner(deleted_at)")
            .in("visit_id", ids)
            .is("crm_invoices.deleted_at", null)
            // A voided invoice is a correction, not a decision that the work is
            // unbillable — its visits go back in the queue (and the DB trigger
            // frees their visit_id tag so the new invoice line can take it).
            .neq("crm_invoices.status", "void")
            .order("id", { ascending: true })
        );
        for (const l of lines) if (l.visit_id) invoicedVisitIds.add(l.visit_id);
      }

      // Per-event billing groups (one charge per job+storm) must not be
      // partially re-billed: if a storm's morning push was already invoiced
      // and the afternoon push completes later, the afternoon push would
      // otherwise appear ALONE in the queue and get priced as a brand new
      // group — charging the full event price a second time. Once any
      // member of a group has been invoiced, exclude the whole group rather
      // than just the already-invoiced visit. (Per-visit billing types are
      // unaffected — their group key is just their own visit id.)
      const groupsWithExistingInvoice = new Set(
        visits.filter((v) => invoicedVisitIds.has(v.id)).map((v) => billingGroupKey(v))
      );

      // With a date range set, the group's other members can sit OUTSIDE it (a
      // per-event storm spanning midnight: yesterday's push already invoiced, today's
      // push in range), so the check above can't see them and the storm would be
      // priced twice. Re-run the "already invoiced" group check without the date
      // filter for the jobs in play.
      if (filters.fromDate || filters.toDate) {
        const perEventJobIds = [...new Set(visits.filter((v) => isPerEventBilling(v.job?.invoiceType ?? "per_event")).map((v) => v.jobId))];
        for (const jobIds of chunkIds(perEventJobIds)) {
          const allVisits = await fetchAllRows<{ id: string }>(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from("crm_job_visits")
              .select("*, crm_jobs!inner(job_type, invoice_type)")
              .eq("status", "completed")
              .eq("crm_jobs.job_type", "snow")
              .in("job_id", jobIds)
              .is("deleted_at", null)
              .order("id", { ascending: true })
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped = (allVisits as any[]).map((r) => ({ ...mapVisit({ ...r, crm_jobs: { ...r.crm_jobs } }) }));
          const wantedKeys = new Set(visits.map((v) => billingGroupKey(v)));
          const checkIds = mapped.filter((v) => wantedKeys.has(billingGroupKey(v)) && !invoicedVisitIds.has(v.id)).map((v) => v.id);
          for (const ids of chunkIds(checkIds)) {
            const lines = await fetchAllRows<{ visit_id: string | null }>(() =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (supabase as any)
                .from("crm_invoice_line_items")
                .select("id, visit_id, crm_invoices!inner(deleted_at)")
                .in("visit_id", ids)
                .is("crm_invoices.deleted_at", null)
                .neq("crm_invoices.status", "void")
                .order("id", { ascending: true })
            );
            const hit = new Set(lines.map((l) => l.visit_id).filter((x): x is string => !!x));
            for (const v of mapped) if (hit.has(v.id)) groupsWithExistingInvoice.add(billingGroupKey(v));
          }
        }
      }

      const queue = visits.filter(
        (v) => !invoicedVisitIds.has(v.id) && !groupsWithExistingInvoice.has(billingGroupKey(v))
      );
      if (queue.length === 0) return [];

      // An invoice made by hand (or via the API) for a snow push has no
      // visit_id on its line, so the check above can't see it and the visit
      // stayed in this queue — generating would bill the client a second
      // time. Flag any queued visit whose job already has a non-void invoice
      // line for the same service date so the user can decide.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobLines: any[] = [];
      for (const jobIds of chunkIds([...new Set(queue.map((v) => v.jobId))])) {
        jobLines.push(...await fetchAllRows(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("crm_invoice_line_items")
            .select("id, service_date, visit_id, crm_invoices!inner(invoice_number, crm_job_id, status, deleted_at)")
            .in("crm_invoices.crm_job_id", jobIds)
            .is("crm_invoices.deleted_at", null)
            .neq("crm_invoices.status", "void")
            .is("visit_id", null)
            .order("id", { ascending: true })
        ));
      }
      const invoiceByJobDate = new Map<string, number | null>();
      for (const l of jobLines) {
        if (!l.service_date || !l.crm_invoices?.crm_job_id) continue;
        invoiceByJobDate.set(`${l.crm_invoices.crm_job_id}|${l.service_date}`, l.crm_invoices.invoice_number ?? null);
      }
      const hourlyShares = await loadHourlyStopShares(supabase, queue);
      const productsByVisit = await loadStormProducts(supabase, queue.map((v) => v.id));

      return queue.map((v): UninvoicedSnowVisit => {
        const key = `${v.jobId}|${v.scheduledDate}`;
        const out: UninvoicedSnowVisit = invoiceByJobDate.has(key)
          ? { ...v, possibleDuplicateInvoiceNumber: invoiceByJobDate.get(key) ?? null }
          : { ...v };
        if (v.job?.invoiceType === "monthly_flat_rate") {
          const pricing = flatRateOutsidePricing(v.job.contractId ? contractById.get(v.job.contractId) : undefined);
          out.contractOutsidePriceCents = pricing.priceCents;
          out.billingWarning = pricing.warning;
        }
        if (hourlyShares.has(v.id)) out.hourlyStopShare = hourlyShares.get(v.id) ?? null;
        const products = productsByVisit.get(v.id);
        if (products?.length) out.stormProducts = products;
        return out;
      });
    },
  });
}

/** Hourly shares for the queue's hourly visits whose stop held another hourly
 *  job — read from every visit of those stops, not just the queued ones. */
async function loadHourlyStopShares(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  queue: CRMJobVisit[]
): Promise<Map<string, number>> {
  const hourly = queue.filter((v) => v.job?.invoiceType === "hourly" && v.clockedInAt);
  if (hourly.length === 0) return new Map();
  const clientIds = [...new Set(hourly.map((v) => v.clientId).filter(Boolean))];
  const dates = [...new Set(hourly.map((v) => v.scheduledDate))];
  const wantedStops = new Set(hourly.map((v) => `${v.clientId}|${v.scheduledDate}|${v.clockedInAt}`));
  const rows: { id: string; client_id: string; scheduled_date: string; clocked_in_at: string | null; actual_hours: number | null; status: string; crm_jobs: { invoice_type: string | null } | null }[] = [];
  for (const ids of chunkIds(clientIds)) {
    rows.push(...await fetchAllRows<(typeof rows)[number]>(() =>
      supabase
        .from("crm_job_visits")
        .select("id, client_id, scheduled_date, clocked_in_at, actual_hours, status, crm_jobs(invoice_type)")
        .in("client_id", ids)
        .in("scheduled_date", dates)
        .not("clocked_in_at", "is", null)
        .is("deleted_at", null)
        .order("id", { ascending: true })
    ));
  }
  const stopVisits = rows
    .filter((r) => wantedStops.has(`${r.client_id}|${r.scheduled_date}|${r.clocked_in_at}`))
    .map((r) => ({
      id: r.id,
      clientId: r.client_id,
      scheduledDate: r.scheduled_date,
      // Compared as the same string the queue's visits carry (both from PostgREST).
      clockedInAt: r.clocked_in_at,
      actualHours: r.actual_hours != null ? Number(r.actual_hours) : null,
      status: r.status,
      job: { invoiceType: r.crm_jobs?.invoice_type ?? null },
    }));
  return hourlyStopShares(stopVisits);
}

/** Materials the crew recorded as used on each storm visit and not yet on a
 *  live invoice: 'used' rows, plus rows still linked to a line on a voided /
 *  deleted invoice (the void freed the storm, so it frees its materials too). */
async function loadStormProducts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  visitIds: string[]
): Promise<Map<string, SnowVisitProduct[]>> {
  const out = new Map<string, SnowVisitProduct[]>();
  if (visitIds.length === 0) return out;
  type Row = {
    id: string;
    visit_id: string;
    product_id: string | null;
    product_name: string;
    qty: number | string;
    invoice_qty: number | string | null;
    unit_price_cents: number | null;
    status: string;
    invoice_line_item_id: string | null;
    crm_invoice_line_items: { crm_invoices: { status: string | null; deleted_at: string | null } | null } | null;
  };
  const rows: Row[] = [];
  for (const ids of chunkIds(visitIds)) {
    rows.push(...await fetchAllRows<Row>(() =>
      supabase
        .from("crm_job_products")
        .select("id, visit_id, product_id, product_name, qty, invoice_qty, unit_price_cents, status, invoice_line_item_id, crm_invoice_line_items(crm_invoices(status, deleted_at))")
        .in("visit_id", ids)
        .not("template_job_product_id", "is", null)
        .in("status", ["used", "invoiced"])
        .is("deleted_at", null)
        .order("id", { ascending: true })
    ));
  }
  const billable = rows.filter((r) => {
    if (r.invoice_line_item_id == null) return r.status === "used";
    const inv = r.crm_invoice_line_items?.crm_invoices;
    return !!inv && (inv.deleted_at != null || inv.status === "void");
  });
  const productIds = [...new Set(billable.map((r) => r.product_id).filter((id): id is string => !!id))];
  const taxable = new Map<string, boolean>();
  for (const ids of chunkIds(productIds)) {
    const { data, error } = await supabase.from("product_items").select("id, is_taxable").in("id", ids);
    if (error) throw error;
    for (const t of (data ?? []) as { id: string; is_taxable: boolean | null }[]) taxable.set(t.id, t.is_taxable ?? false);
  }
  for (const r of billable) {
    const qty = Number(r.invoice_qty ?? r.qty);
    const unit = r.unit_price_cents ?? 0;
    const list = out.get(r.visit_id) ?? [];
    list.push({
      id: r.id,
      productId: r.product_id,
      name: r.product_name,
      qty,
      unitPriceCents: unit,
      totalCents: productLineTotalCents(unit, qty),
      // Selling tax lives on the catalog product, as on every job → invoice path.
      isTaxable: r.product_id ? (taxable.get(r.product_id) ?? false) : false,
      status: r.status,
      staleLineItemId: r.invoice_line_item_id,
    });
    out.set(r.visit_id, list);
  }
  return out;
}

// ── generate invoices ─────────────────────────────────────────────────────────

export interface SnowInvoiceVisitInput {
  visitId: string;
  jobId: string;
  description: string;
  amountCents: number;
  serviceDate: string | null;
  /** Materials the crew used on this storm visit — billed on the same invoice, only with the visit. */
  products?: SnowVisitProduct[];
}

interface SnowTaxContext {
  /** Jobs with at least one taxable service. */
  taxableJobIds: Set<string>;
  /** Accepted-estimate tax rate per job (only jobs converted from an estimate with a rate). */
  estimateRateByJobId: Map<string, number>;
  clientDefaultRateById: Map<string, number>;
  /** Tax-exempt clients (is_taxable = false): never taxed, whatever an estimate or default says. */
  exemptClientIds: Set<string>;
}

async function loadSnowTaxContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobIds: string[],
  clientIds: string[]
): Promise<SnowTaxContext> {
  const ctx: SnowTaxContext = {
    taxableJobIds: new Set(),
    estimateRateByJobId: new Map(),
    clientDefaultRateById: new Map(),
    exemptClientIds: new Set(),
  };
  if (jobIds.length > 0) {
    const { data: jobs, error } = await supabase
      .from("crm_jobs")
      .select("id, estimate_id, crm_job_services(is_taxable, crm_services(is_taxable))")
      .in("id", jobIds);
    if (error) throw error;
    const estimateIdByJob = new Map<string, string>();
    for (const j of (jobs ?? []) as {
      id: string;
      estimate_id: string | null;
      crm_job_services: { is_taxable: boolean | null; crm_services: { is_taxable: boolean | null } | null }[] | null;
    }[]) {
      // Snapshot flag first, catalog flag for rows predating it — same
      // precedence as complete-visit-side-effects.
      if ((j.crm_job_services ?? []).some((s) => s.is_taxable ?? s.crm_services?.is_taxable ?? false)) {
        ctx.taxableJobIds.add(j.id);
      }
      if (j.estimate_id) estimateIdByJob.set(j.id, j.estimate_id);
    }
    const estimateIds = [...new Set(estimateIdByJob.values())];
    if (estimateIds.length > 0) {
      const { data: ests, error: estErr } = await supabase
        .from("estimates")
        .select("id, tax_rate_bps")
        .in("id", estimateIds);
      if (estErr) throw estErr;
      const rateByEstimate = new Map(
        ((ests ?? []) as { id: string; tax_rate_bps: number | null }[]).map((e) => [e.id, e.tax_rate_bps ?? 0])
      );
      for (const [jobId, estimateId] of estimateIdByJob) {
        const rate = rateByEstimate.get(estimateId) ?? 0;
        if (rate > 0) ctx.estimateRateByJobId.set(jobId, rate);
      }
    }
  }
  if (clientIds.length > 0) {
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, default_tax_rate_bps, is_taxable")
      .in("id", clientIds);
    if (error) throw error;
    for (const c of (clients ?? []) as { id: string; default_tax_rate_bps: number | null; is_taxable: boolean | null }[]) {
      // A tax-exempt client (is_taxable = false) is never taxed, whatever default rate is stored.
      ctx.clientDefaultRateById.set(c.id, c.is_taxable === false ? 0 : (c.default_tax_rate_bps ?? 0));
      if (c.is_taxable === false) ctx.exemptClientIds.add(c.id);
    }
  }
  return ctx;
}

/** One rate per invoice: the first of its jobs' accepted-estimate rates, else
 *  the client's default rate. */
function snowTaxRateBps(ctx: SnowTaxContext, jobIds: string[], clientId: string): number {
  if (ctx.exemptClientIds.has(clientId)) return 0;
  for (const jobId of jobIds) {
    const rate = ctx.estimateRateByJobId.get(jobId);
    if (rate && rate > 0) return rate;
  }
  return ctx.clientDefaultRateById.get(clientId) ?? 0;
}

export function useGenerateSnowInvoices() {
  // Invoices are dated the org's today (as Create Invoice does), not the storm.
  const orgTimeZone = useOrgTimeZone();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      groups: { clientId: string; description: string; visits: SnowInvoiceVisitInput[] }[]
    ) => {
      const supabase = createClient();
      let invoicesCreated = 0;
      const invoiceIds: string[] = [];
      let skippedZeroAmountGroups = 0;
      let excludedZeroAmountVisits = 0;
      let skippedRaceConditionGroups = 0;
      let unclaimedProducts = 0;

      const tax = await loadSnowTaxContext(
        supabase,
        [...new Set(groups.flatMap((g) => g.visits.map((v) => v.jobId)))],
        [...new Set(groups.map((g) => g.clientId))]
      );

      // Terms / PO / rep, resolved the same way the visit-completion path does
      // (complete-visit-side-effects). The snow insert used to set none of them,
      // so a Net-30 client's snow invoice got due_on_receipt with a NULL
      // due_date — which the invoice-past-due automation skips forever.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: termRows } = await (supabase as any)
        .from("clients")
        .select("id, default_terms")
        .in("id", [...new Set(groups.map((g) => g.clientId))]);
      const defaultTermsByClient = new Map<string, string | null>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((termRows ?? []) as any[]).map((c): [string, string | null] => [c.id, c.default_terms ?? null])
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orgTermsRow } = await (supabase as any)
        .from("organizations")
        .select("default_billing_terms")
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: jobMetaRows } = await (supabase as any)
        .from("crm_jobs")
        .select("id, po_number, sales_rep_id")
        .in("id", [...new Set(groups.flatMap((g) => g.visits.map((v) => v.jobId)))]);
      const jobMetaById = new Map<string, { po_number: string | null; sales_rep_id: string | null }>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((jobMetaRows ?? []) as any[]).map((j): [string, { po_number: string | null; sales_rep_id: string | null }] => [j.id, j])
      );

      for (const group of groups) {
        const subtotal = group.visits.reduce((s, v) => s + v.amountCents, 0);
        if (subtotal <= 0) {
          // Previously a silent `continue` — the caller reported "success"
          // even though nothing was billed for this client at all.
          skippedZeroAmountGroups += 1;
          continue;
        }

        // A $0 visit inside an otherwise-positive group (e.g. a misconfigured
        // rate) used to still get a line item inserted with its visit_id,
        // which permanently marks it "invoiced" in the queue at $0 — the
        // amount can never be corrected and re-billed. Leave it out of the
        // line items so it stays in the queue until its pricing is fixed.
        const billableVisits = group.visits.filter((v) => v.amountCents > 0);
        excludedZeroAmountVisits += group.visits.length - billableVisits.length;
        if (billableVisits.length === 0) continue;

        const distinctJobIds = new Set(billableVisits.map((v) => v.jobId));
        const singleJobId = distinctJobIds.size === 1 ? [...distinctJobIds][0] : null;
        // The day the invoice is made, in the org's zone — same as Create
        // Invoice (create-from-job). The storm's date is on each line instead;
        // dating the invoice the first storm made a late-billed storm's
        // invoice (and its due date) look weeks overdue on day one.
        const invoiceDate = todayInZone(orgTimeZone);
        const invoiceTerms = resolveInvoiceTerms(defaultTermsByClient.get(group.clientId), orgTermsRow?.default_billing_terms);

        // Same tax rules as every other job → invoice path
        // (complete-visit-side-effects / useCreateInvoiceFromJob): a line is
        // taxable when its job's services are, and the rate is the accepted
        // estimate's when the job came from one, else the client's default.
        // This used to hard-code tax_rate_bps 0 — snow invoices were never taxed.
        const taxRateBps = snowTaxRateBps(tax, billableVisits.map((v) => v.jobId), group.clientId);
        // Each storm visit's line, followed by the materials the crew used on
        // that storm (priced from the job's planned material, taxed by the
        // catalog product's flag). A $0 visit's materials stay queued with it.
        type DraftLine = {
          name: string;
          description: string;
          qty: number;
          rateCents: number;
          totalCents: number;
          serviceDate: string | null;
          visitId: string | null;
          productId: string | null;
          isTaxable: boolean;
          product?: SnowVisitProduct;
        };
        const draftLines: DraftLine[] = billableVisits.flatMap((v): DraftLine[] => [
          {
            name: v.description,
            description: v.description,
            qty: 1,
            rateCents: v.amountCents,
            totalCents: v.amountCents,
            serviceDate: v.serviceDate,
            visitId: v.visitId,
            productId: null,
            isTaxable: tax.taxableJobIds.has(v.jobId),
          },
          ...(v.products ?? []).map((p): DraftLine => ({
            name: p.name,
            description: p.name,
            qty: p.qty,
            rateCents: p.unitPriceCents,
            totalCents: p.totalCents,
            serviceDate: v.serviceDate,
            visitId: null,
            productId: p.productId,
            isTaxable: p.isTaxable && !tax.exemptClientIds.has(group.clientId),
            product: p,
          })),
        ]);
        const linesSubtotal = draftLines.reduce((s, l) => s + l.totalCents, 0);
        const taxableSubtotal = draftLines.reduce((s, l) => s + (l.isTaxable ? l.totalCents : 0), 0);
        const taxCents = Math.round((taxableSubtotal * taxRateBps) / 10000);
        const totalCents = linesSubtotal + taxCents;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newInvoice, error: invErr } = await (supabase as any)
          .from("crm_invoices")
          .insert({
            client_id: group.clientId,
            crm_job_id: singleJobId,
            description: group.description,
            invoice_date: invoiceDate,
            terms: invoiceTerms,
            due_date: computeDueDate(invoiceDate, invoiceTerms),
            // Only meaningful when the group is a single job.
            po_number: singleJobId ? jobMetaById.get(singleJobId)?.po_number ?? null : null,
            sales_rep_id: singleJobId ? jobMetaById.get(singleJobId)?.sales_rep_id ?? null : null,
            status: "draft",
            subtotal_cents: linesSubtotal,
            tax_rate_bps: taxRateBps,
            tax_cents: taxCents,
            total_cents: totalCents,
            balance_cents: totalCents,
            amount_paid_cents: 0,
          })
          .select("id, invoice_number")
          .single();
        if (invErr) throw invErr;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insertedLines, error: liErr } = await (supabase as any).from("crm_invoice_line_items").insert(
          draftLines.map((l, i) => ({
            invoice_id: (newInvoice as { id: string }).id,
            name: l.name,
            description: l.description,
            qty: l.qty,
            rate_cents: l.rateCents,
            total_cents: l.totalCents,
            service_date: l.serviceDate,
            visit_id: l.visitId,
            product_id: l.productId,
            is_taxable: l.isTaxable,
            sort_order: i,
          }))
        ).select("id");
        if (liErr) {
          // Soft delete (never hard delete): the half-built draft drops out of
          // every list and balance, and its visits stay in the queue since the
          // uninvoiced check ignores deleted invoices.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: discardErr } = await (supabase as any)
            .from("crm_invoices")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", (newInvoice as { id: string }).id);
          if (discardErr) throw discardErr;
          if ((liErr as { code?: string }).code === "23505") {
            // crm_invoice_line_items_visit_id_unique — one of this group's
            // visits was already invoiced by a concurrent generate call (the
            // uninvoiced-visits query this mutation's caller reads from is a
            // separate read with no lock, so two overlapping "Generate
            // Invoices" clicks can both see the same visit as billable).
            // Skip this group rather than leaving a $0-lines invoice on
            // record or crashing the whole batch — the visit is genuinely
            // now invoiced, just not by this call.
            skippedRaceConditionGroups += 1;
            continue;
          }
          throw liErr;
        }

        // Claim each material for its line — conditional on it still being
        // unbilled (or on the dead line it was freed from), so a second run
        // can't bill it again — then mark it invoiced. 'used' -> 'invoiced' is
        // between two used states, so stock isn't decremented again.
        // insertedLines is positional, same order as draftLines.
        const insertedIds = ((insertedLines ?? []) as { id: string }[]).map((r) => r.id);
        for (let i = 0; i < draftLines.length; i++) {
          const product = draftLines[i].product;
          const lineId = insertedIds[i];
          if (!product || !lineId) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let claim = (supabase as any)
            .from("crm_job_products")
            .update({ invoice_line_item_id: lineId })
            .eq("id", product.id);
          claim = product.staleLineItemId
            ? claim.eq("invoice_line_item_id", product.staleLineItemId)
            : claim.is("invoice_line_item_id", null);
          const { data: claimed, error: claimErr } = await claim.select("id");
          if (claimErr || ((claimed ?? []) as unknown[]).length === 0) {
            unclaimedProducts += 1;
            continue;
          }
          if (product.status === "used") {
            // Best-effort: the link above is what keeps it from billing twice.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)("set_job_product_status", {
              p_job_product_id: product.id,
              p_new_status: "invoiced",
            });
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invoiceNumber, error: numberErr } = await (supabase.rpc as any)(
          "assign_invoice_number",
          { p_invoice_id: (newInvoice as { id: string }).id }
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("sync_client_balance", { p_client_id: group.clientId });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // Only log the timeline row when a number was actually assigned — a
        // failed/null RPC wrote "Invoice #undefined" (the visit-completion path
        // guards the same way).
        if (!numberErr && invoiceNumber != null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("client_activity").insert({
            client_id: group.clientId,
            activity_type: "invoice",
            subject: `Invoice #${invoiceNumber}`,
            amount_cents: totalCents,
            ref_id: (newInvoice as { id: string }).id,
            ref_table: "crm_invoices",
          });
        }

        invoicesCreated += 1;
        invoiceIds.push((newInvoice as { id: string }).id);
      }

      return { invoicesCreated, invoiceIds, skippedZeroAmountGroups, excludedZeroAmountVisits, skippedRaceConditionGroups, unclaimedProducts };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snow-invoicing"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      invalidateClientBalances(qc);
    },
  });
}
