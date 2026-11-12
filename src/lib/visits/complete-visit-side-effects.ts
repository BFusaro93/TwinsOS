import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { stripHtml } from "@/lib/utils/strip-html";
import { notesToPlainText } from "@/lib/utils/rich-notes";
import { logger } from "@/lib/logger";
import { fireServiceVisitCompletedTriggers, fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { computeDueDate, resolveInvoiceTerms } from "@/lib/invoices/due-date";
import { contractCoversServiceDay, type CoverageContractRow } from "@/lib/contract-billing";
import {
  lineTotalCents,
  resolveAutoInvoiceTaxRateBps,
  resolveJobServiceTaxable,
} from "@/lib/invoices/auto-invoice-tax";
import { billableJobProductStatusesForVisit, visitLineAmount } from "@/lib/invoices/create-from-job";

/**
 * Everything that must happen AFTER a crm_job_visits row flips to
 * status='completed', shared by every completion path so a visit finished in
 * the field bills exactly like one marked complete from the dispatch board:
 *
 *   1. Parent-job bookkeeping — close one_time/waiting_list jobs once every
 *      sibling visit is terminal; stamp last_service_date on everything else.
 *   2. Auto-invoice (contract-less, non-snow jobs), honoring the client's
 *      invoice_frequency (daily/weekly/monthly visits fold into the period's
 *      open draft — one per client + period + sales rep + PO — via
 *      increment_invoice_totals; upon-completion bills each visit) and tax pass-through
 *      (crm_job_services.is_taxable + estimate / client default rate).
 *   3. "Visit completed — <service> (<date>)" client_activity timeline row.
 *   4. service_visit_completed / visit_completed automation triggers, driven
 *      through any immediately-due steps.
 *
 * Callers own authentication, authorization and the status flip itself.
 * The office route passes its RLS-scoped user client; the crew clock-out
 * route passes a service-role client because crew accounts have no RLS
 * access to invoice tables — in that case the caller has already proven the
 * crew owns the visit, and every read here is additionally pinned to orgId.
 *
 * Idempotency: invoicing is skipped when a crm_invoice_line_items row already
 * carries this visit's id (the first auto-invoice line of each visit is
 * tagged with visit_id — only the first, because
 * crm_invoice_line_items_visit_id_unique allows one row per visit). Legacy
 * single-visit one_time/waiting_list jobs keep their one-invoice-per-job
 * guard. Steps 1 and 4 are naturally safe to repeat; step 3 can be
 * de-duplicated with `dedupeActivity` (used by the backfill path).
 */

const log = logger.child("visit-completion");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface VisitCompletionSideEffectsArgs {
  supabase: AnyClient;
  /** Org of the visit — every lookup below is pinned to it. */
  orgId: string;
  visitId: string;
  /** Actor recorded as created_by on the activity row. */
  userId: string;
  /** Overrides the "today" used for last_service_date / invoice_date (YYYY-MM-DD).
   * Defaults to the org's calendar day, not UTC — see the resolution below. */
  today?: string;
  /** Skip the "Visit completed" row if an identical one already exists. */
  dedupeActivity?: boolean;
  /** Default true. The backfill path passes false so days-late completions don't
   * kick off follow-up sequences. */
  fireAutomations?: boolean;
}

export interface VisitCompletionSideEffectsResult {
  ok: boolean;
  jobId: string | null;
  clientId: string | null;
  invoiced: boolean;
  /** Set when invoicing was skipped, e.g. "already_invoiced", "contract", "snow", "zero_subtotal". */
  invoiceSkipReason: string | null;
  invoiceId: string | null;
  activityLogged: boolean;
  error?: string;
}

// Billing-period boundaries (inclusive, "YYYY-MM-DD") for batching auto-invoices
// under a client's weekly/monthly invoice_frequency. Computed in UTC to avoid
// server-timezone drift shifting a date across a period boundary.
function getMonthRange(dateStr: string): { start: string; end: string } {
  const [y, m] = dateStr.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function getWeekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

type VisitRow = {
  id: string;
  org_id: string | null;
  job_id: string;
  client_id: string | null;
  invoice_description: string | null;
  scheduled_date: string | null;
  status: string;
  job_service_id: string | null;
  /** Secondary crew on a multi-crew stop — billing/timeline/automations belong to the lead visit. */
  crew_group_secondary: boolean | null;
  /** What the crew typed when finishing the stop; copied onto the "Visit completed" timeline row. */
  completion_notes: string | null;
  /** Per-visit Qty / Rate set on the dispatch sheet — billed instead of the service's when a rate is set. */
  qty: number | null;
  rate_cents: number | null;
};

type JobServiceRow = {
  id: string;
  service_name: string;
  qty: number | null;
  rate_cents: number | null;
  is_taxable: boolean | null;
  invoice_desc?: string | null;
  /** false = a removed service with history, "stopped" (job-service-removal.ts) — never billed by a whole-job visit. */
  included?: boolean | null;
  crm_services: { invoice_description: string | null; is_taxable: boolean | null } | null;
};

type JobRow = {
  id: string;
  job_type: string;
  last_service_date: string | null;
  contract_id: string | null;
  client_id: string | null;
  estimate_id: string | null;
  invoice_description: string | null;
  rate_cents: number | null;
  po_number: string | null;
  sales_rep_id: string | null;
  crm_job_services: JobServiceRow[] | null;
  clients: { invoice_frequency: string | null; default_tax_rate_bps: number | null; default_terms: string | null; is_taxable: boolean | null } | null;
};

type AutoInvoiceLine = {
  name: string;
  description: string;
  qty: number;
  rate_cents: number;
  total_cents: number;
  service_date: string | null;
  is_taxable: boolean;
  // Present only for a line swept in from a job Product (materials) —
  // links the inserted invoice line back to crm_job_products so it can be
  // flipped to 'invoiced' below, same as the manual "Create Invoice" paths.
  jobProductId?: string;
  productId?: string | null;
};

export async function applyVisitCompletionSideEffects(
  args: VisitCompletionSideEffectsArgs
): Promise<VisitCompletionSideEffectsResult> {
  const { supabase, orgId, visitId, userId } = args;
  const fireAutomations = args.fireAutomations ?? true;
  // The visit's service day is the ORG's day — a crew completing work at
  // 9pm in a Pacific org must not have it invoiced under tomorrow.
  const today = args.today ?? todayInZone(await getOrgTimeZone(supabase, orgId));

  const result: VisitCompletionSideEffectsResult = {
    ok: false,
    jobId: null,
    clientId: null,
    invoiced: false,
    invoiceSkipReason: null,
    invoiceId: null,
    activityLogged: false,
  };

  const { data: visitData, error: visitErr } = await supabase
    .from("crm_job_visits")
    .select("id, org_id, job_id, client_id, invoice_description, scheduled_date, status, job_service_id, crew_group_secondary, completion_notes, qty, rate_cents")
    .eq("id", visitId)
    .eq("org_id", orgId)
    .maybeSingle();
  const visit = visitData as VisitRow | null;
  if (visitErr || !visit) {
    result.error = visitErr?.message ?? "Visit not found";
    return result;
  }
  result.jobId = visit.job_id;
  result.clientId = visit.client_id;
  const visitJobServiceId = visit.job_service_id ?? null;

  // ── 1. Parent-job bookkeeping ─────────────────────────────────────────────
  const { data: jobData } = await supabase
    .from("crm_jobs")
    .select("id, job_type, last_service_date, contract_id, client_id, estimate_id, invoice_description, rate_cents, po_number, sales_rep_id, crm_job_services(id, service_name, qty, rate_cents, is_taxable, invoice_desc, included, crm_services(invoice_description, is_taxable)), clients(invoice_frequency, default_tax_rate_bps, default_terms, is_taxable)")
    .eq("id", visit.job_id)
    .eq("org_id", orgId)
    .maybeSingle();
  const j = jobData as JobRow | null;

  // Jobs that close on completion (no more scheduled visits expected).
  // A one_time/waiting_list job can still have MORE THAN ONE visit when its
  // services were split one-visit-per-service — only close the job once every
  // sibling visit has also reached a terminal status, or a job with an
  // unfinished service gets marked "completed" the moment its FIRST service
  // visit does, which then hides that sibling visit from the dispatch board.
  const terminalTypes = new Set(["one_time", "waiting_list"]);
  const terminalVisitStatuses = new Set(["completed", "cancelled", "skipped"]);

  let allSiblingVisitsDone = true;
  if (j && terminalTypes.has(j.job_type)) {
    const { data: siblingVisits } = await supabase
      .from("crm_job_visits")
      .select("id, status, job_service_id")
      .eq("job_id", j.id)
      .is("deleted_at", null);
    const siblings = (siblingVisits ?? []) as { id: string; status: string; job_service_id: string | null }[];
    allSiblingVisitsDone = siblings.every((sv) => sv.id === visitId || terminalVisitStatuses.has(sv.status));
    // A split waiting-list job dispatches one visit per service, so a service that has
    // no visit yet is unfinished work the sibling check above cannot see.
    if (allSiblingVisitsDone) {
      const { data: jobServices } = await supabase
        .from("crm_job_services")
        .select("id, included")
        .eq("job_id", j.id);
      const wholeJobVisit = siblings.some((sv) => sv.job_service_id == null);
      const undispatched = ((jobServices ?? []) as { id: string; included: boolean | null }[])
        .filter((js) => js.included !== false)
        .some((js) => !wholeJobVisit && !siblings.some((sv) => sv.job_service_id === js.id));
      if (undispatched) allSiblingVisitsDone = false;
    }
  }

  if (j && terminalTypes.has(j.job_type) && allSiblingVisitsDone) {
    const { error: jErr } = await supabase
      .from("crm_jobs")
      .update({ status: "completed", is_complete: true })
      .eq("id", j.id);
    if (jErr) {
      result.error = jErr.message;
      return result;
    }
  } else if (j) {
    // Recurring / package / project / snow — parent job stays as-is; just stamp last service date.
    // The service happened on the visit's scheduled day, not the day someone got
    // around to marking it complete — a visit done 10/15 and closed 10/17 is a
    // 10/15 service. A future-dated visit (completed early) falls back to today,
    // and the stamp never moves backward past a later visit already recorded.
    const serviceDay = visit.scheduled_date && visit.scheduled_date <= today ? visit.scheduled_date : today;
    if (!j.last_service_date || serviceDay > j.last_service_date) {
      await supabase
        .from("crm_jobs")
        .update({ last_service_date: serviceDay })
        .eq("id", j.id);
    }
  }

  // A secondary crew on a multi-crew stop only records its own hours: the stop
  // bills once, logs one "Visit completed" row and fires its automations once,
  // all from the lead visit's completion (see 20261029000000_multi_crew_visits.sql).
  if (visit.crew_group_secondary) {
    result.invoiceSkipReason = "crew_group_secondary";
    result.ok = true;
    return result;
  }

  // ── 2. Auto-invoice ───────────────────────────────────────────────────────
  // Create a draft invoice for any completed visit whose job has no contract.
  // Jobs linked to a contract are billed on the contract's billing cycle instead.
  // Project jobs are excluded too (milestone-billed). Snow jobs are excluded — they're billed exclusively through the dedicated
  // Snow Invoicing page (per-inch/hourly rates this flat auto-invoice can't
  // compute).
  try {
    // A contract-linked job bills inside the contract price only for service
    // the contract pays for (contractCoversServiceDay): inside its term while
    // it is in force, and — once it is cancelled / expired / switched
    // inactive — only inside a cycle it already billed (the cron has stopped,
    // so anything later is billed like normal per-visit work; anything
    // earlier must NOT be billed again). A visit before the start date is not
    // covered. Draft/sent contracts count as in force: they may still be
    // signed, and billing the visit now would double-bill once they are.
    let contractCoversVisit = false;
    if (j?.contract_id) {
      const { data: contractRow } = await supabase
        .from("crm_contracts")
        .select("status, is_active, deleted_at, start_date, end_date, last_billed_date, billing_anchor_date, first_period_prorated_at, billing_frequency, billing_day_of_month, bill_month_in_advance, signed_at, created_at")
        .eq("id", j.contract_id)
        .maybeSingle();
      const c = contractRow as CoverageContractRow | null;
      const visitDay = visit.scheduled_date && visit.scheduled_date <= today ? visit.scheduled_date : today;
      contractCoversVisit = !!c && contractCoversServiceDay(c, visitDay);
    }
    if (!j) {
      result.invoiceSkipReason = "job_not_found";
    } else if (j.contract_id && contractCoversVisit) {
      result.invoiceSkipReason = "contract";
    } else if (j.job_type === "snow") {
      result.invoiceSkipReason = "snow";
    } else if (j.job_type === "project") {
      // Project jobs are billed through their milestone schedule. Auto-invoicing
      // the visit as well would bill the full line value on top of the milestones.
      result.invoiceSkipReason = "project";
    } else {
      // Idempotency: a visit that already produced an invoice line must never
      // be billed twice, whichever completion path (office, crew, backfill)
      // gets here second.
      // A line on a void / soft-deleted invoice no longer bills the client, so
      // it doesn't count (cancel -> reopen -> complete must re-invoice). The
      // unique visit_id constraint still blocks a second tagged line, so the
      // dead line's tag is released first (best-effort; if it can't be freed
      // the new line is simply left untagged).
      let tagVisit = true;
      const { data: existingLine } = await supabase
        .from("crm_invoice_line_items")
        .select("id, invoice_id, crm_invoices(status, deleted_at)")
        .eq("visit_id", visitId)
        .limit(1)
        .maybeSingle();
      if (existingLine) {
        const parent = (existingLine as unknown as {
          crm_invoices: { status: string; deleted_at: string | null } | null;
        }).crm_invoices;
        const parentLive = !!parent && parent.deleted_at == null && parent.status !== "void";
        if (parentLive) {
          result.invoiceSkipReason = "already_invoiced";
          result.invoiceId = (existingLine as { invoice_id: string }).invoice_id;
        } else {
          const { error: freeErr } = await supabase
            .from("crm_invoice_line_items")
            .update({ visit_id: null })
            .eq("id", (existingLine as { id: string }).id);
          if (freeErr) {
            log.error("could not free visit tag on dead invoice line", { visitId, error: freeErr.message });
            tagVisit = false;
          }
        }
      }

      // One-time and waiting-list jobs used to be exactly one visit, so we guarded
      // against a duplicate invoice per job — per-service visit splitting means such
      // a job can now have several visits (one per service), each completing
      // independently, so that guard is only valid for a visit with no linked
      // service (the legacy single-visit case).
      const isTerminalJobType = j.job_type === "one_time" || j.job_type === "waiting_list";
      if (!result.invoiceSkipReason && isTerminalJobType && !visitJobServiceId) {
        const { data: existingInvoice } = await supabase
          .from("crm_invoices")
          .select("id")
          .eq("crm_job_id", j.id)
          .is("deleted_at", null)
          .neq("status", "void")
          // limit(1): with two invoices on the job, maybeSingle() errors and
          // returns null data — which read as "not invoiced" and billed again.
          .limit(1)
          .maybeSingle();
        if (existingInvoice) {
          result.invoiceSkipReason = "job_already_invoiced";
          result.invoiceId = (existingInvoice as { id: string }).id;
        }
      }

      if (!result.invoiceSkipReason) {
        // A visit linked to one specific service (the per-service-split case) bills only
        // that service — otherwise every visit on a multi-service job would re-bill every
        // OTHER service too, including ones that aren't done yet. A visit covering the
        // whole job (no linked service) falls back to all of the job's services —
        // except stopped ones (included = false: removed from the job but kept
        // for their history), which a whole-job visit never bills. A visit
        // linked to a stopped service still bills that service's own line.
        const allServices: JobServiceRow[] = j.crm_job_services ?? [];
        const services = visitJobServiceId
          ? allServices.filter((s) => s.id === visitJobServiceId)
          : allServices.filter((s) => s.included !== false);
        // Rich-text editors store these as HTML ("<p>Lawn mow</p>"); invoice line
        // descriptions are plain text, so flatten before they become a line.
        const visitInvoiceDescription: string | null = visit.invoice_description ? stripHtml(visit.invoice_description) : null;
        const jobInvoiceDescription: string | null = j.invoice_description ? stripHtml(j.invoice_description) : null;
        const visitDate: string | null = visit.scheduled_date ?? null;

        // Taxability (D-12): each job service snapshots is_taxable when the job
        // is created (from the accepted estimate, or the service catalog via the
        // crm_job_services default trigger). Rows predating that column fall
        // back to the catalog flag. The rate comes from the accepted estimate
        // when the job was converted from one — so the invoice reproduces the
        // tax the client agreed to — otherwise the client's default rate.
        // Shared with useCreateInvoiceFromJob via auto-invoice-tax.ts.
        let estimateTaxRateBps: number | null = null;
        if (j.estimate_id) {
          const { data: est } = await supabase
            .from("estimates")
            .select("tax_rate_bps")
            .eq("id", j.estimate_id)
            .maybeSingle();
          estimateTaxRateBps = (est as { tax_rate_bps: number | null } | null)?.tax_rate_bps ?? null;
        }
        const taxRateBps = resolveAutoInvoiceTaxRateBps(estimateTaxRateBps, j.clients?.default_tax_rate_bps, j.clients?.is_taxable);

        // Build line items from services; fall back to a single line from job rate_cents.
        // Description precedence per line: this visit's own override, then this service's own
        // description (from the estimate line), then the job-level
        // master override (Job > Invoice Desc tab), then the service's own invoice
        // description (set in Services settings), then its plain name.
        //
        // Amount: the Rate × Qty set on this visit in the dispatch sheet
        // (crm_job_visits.rate_cents / qty — what rpt_job_visits and Job
        // Costing count) when a rate is set, else the service's rate × qty.
        // The visit override is one figure, so it applies only when the visit
        // bills a single line: its own linked service, the job's only
        // service, or the job-rate line. A whole-job visit over several
        // services bills each service at its own rate.
        const visitOverride = services.length <= 1 ? visit : null;
        const serviceLines: AutoInvoiceLine[] = services.length > 0
          ? services.map((s) => {
              const description = visitInvoiceDescription || (s.invoice_desc ? stripHtml(s.invoice_desc) : null) || jobInvoiceDescription || stripHtml(s.crm_services?.invoice_description || "") || s.service_name;
              const amount = visitLineAmount(visitOverride, { rateCents: s.rate_cents ?? 0, qty: s.qty ?? 1 });
              return {
                name: s.service_name,
                description,
                qty: amount.qty,
                rate_cents: amount.rateCents,
                total_cents: amount.totalCents,
                service_date: visitDate,
                is_taxable: resolveJobServiceTaxable(s.is_taxable, s.crm_services?.is_taxable),
              };
            })
          // The job-rate line is for a job with no services at all — a job
          // whose services were all stopped bills nothing for the visit.
          : allServices.length === 0 && (visit.rate_cents ?? j.rate_cents)
            ? (() => {
                const amount = visitLineAmount(visit, { rateCents: j.rate_cents ?? 0, qty: 1 });
                const label = visitInvoiceDescription ?? jobInvoiceDescription ?? "Service";
                return [{ name: label, description: label, qty: amount.qty, rate_cents: amount.rateCents, total_cents: amount.totalCents, service_date: visitDate, is_taxable: false }];
              })()
            : [];

        // Sweep in unresolved Products/materials the office called for on this
        // job. This auto-invoice path (fired on visit completion) used to bill
        // services only, silently leaving materials off every automatically
        // generated invoice and stuck on "Pending" forever — see the manual
        // "Create Invoice" buttons in DispatchBoard.tsx / JobDetail.tsx for the
        // same sweep. Swept at most once: each included row is flipped to
        // 'invoiced' below, so a job with several visits (or a second visit
        // appending to the same open period invoice) can't re-bill the same
        // material twice.
        //
        // 'used' is always swept, never just 'pending'. 'used' means the
        // crew recorded actual usage and inventory is already decremented, but
        // the material is still to be billed (see JobDetail.tsx's
        // BILLABLE_JOB_PRODUCT_STATUSES and
        // 20260918120000_job_products_used_status_and_crew_guard.sql). Filtering
        // 'pending' alone would re-create the bug that status split up to fix:
        // the crew confirms 10 bags of mulch, the visit completes, and the
        // material silently never reaches the customer's invoice. Flipping
        // 'used' -> 'invoiced' does NOT double-decrement stock, because
        // set_job_product_status treats both as used states.
        // Per-service visits: only sweep this visit's own service's materials (plus
        // job-level ones with no service), or the first visit to complete bills every
        // service's materials.
        //
        // Recurring and package jobs bill only what the crew recorded as
        // 'used' (billableJobProductStatusesForVisit): their 'pending' rows are
        // the office's season plan, not this visit's actual use, and they stay
        // pending — not invoiced, stock not decremented — so the crew can
        // still record real usage later. One-time / waiting-list jobs bill
        // planned materials at completion as before.
        let productQuery = supabase
          .from("crm_job_products")
          .select("id, product_id, product_name, qty, invoice_qty, unit_price_cents, visit_id")
          .eq("job_id", j.id);
        if (visitJobServiceId) {
          productQuery = productQuery.or(`job_service_id.eq.${visitJobServiceId},job_service_id.is.null`);
        }
        const { data: allProductRows } = await productQuery
          .in("status", billableJobProductStatusesForVisit(j.job_type))
          // A row already linked to a line (even if the status flip below failed)
          // is billed; sweeping it again would invoice the same material twice.
          .is("invoice_line_item_id", null)
          // Estimate sub-item products are inside the service price already.
          .is("job_service_subitem_id", null)
          .is("deleted_at", null);
        type PendingProductRow = {
          id: string;
          product_id: string | null;
          product_name: string;
          qty: number;
          invoice_qty: number | null;
          unit_price_cents: number;
          visit_id: string | null;
        };
        // A material added for one specific visit is billed with THAT visit only — otherwise
        // whichever visit completes first would invoice another day's materials. Job-level
        // rows (visit_id null) are shared by every visit, as before.
        const pendingProductRows = ((allProductRows ?? []) as PendingProductRow[]).filter(
          (r) => !r.visit_id || r.visit_id === visitId
        );
        // Selling-tax flag lives on the catalog product (product_items.is_taxable).
        // Free-text job products with no catalog link stay non-taxable. A zero
        // tax rate (tax-exempt / no rate) still yields zero tax downstream.
        const productIds = [...new Set(((pendingProductRows ?? []) as PendingProductRow[]).map((p) => p.product_id).filter((id): id is string => !!id))];
        const productTaxable = new Map<string, boolean>();
        if (productIds.length > 0) {
          const { data: taxRows } = await supabase
            .from("product_items")
            .select("id, is_taxable")
            .in("id", productIds);
          for (const t of (taxRows ?? []) as { id: string; is_taxable: boolean | null }[]) {
            productTaxable.set(t.id, t.is_taxable ?? false);
          }
        }
        const productLines: AutoInvoiceLine[] = ((pendingProductRows ?? []) as PendingProductRow[]).map((p) => {
          const billedQty = p.invoice_qty ?? p.qty;
          return {
            name: p.product_name,
            description: p.product_name,
            qty: billedQty,
            rate_cents: p.unit_price_cents,
            total_cents: lineTotalCents(p.unit_price_cents, billedQty),
            service_date: visitDate,
            is_taxable: p.product_id ? (productTaxable.get(p.product_id) ?? false) : false,
            jobProductId: p.id,
            productId: p.product_id,
          };
        });

        const lineItems: AutoInvoiceLine[] = [...serviceLines, ...productLines];
        const subtotal = lineItems.reduce((s, li) => s + li.total_cents, 0);
        const taxableSubtotal = lineItems.filter((li) => li.is_taxable).reduce((s, li) => s + li.total_cents, 0);
        const taxCents = Math.round((taxableSubtotal * taxRateBps) / 10000);

        // Tag only the FIRST line with visit_id — the unique constraint permits one
        // row per visit — which is enough for the idempotency lookup above.
        // org_id is set explicitly: its DEFAULT my_org_id() resolves to null under
        // the service-role client the crew path uses.
        const toLineRows = (invoiceId: string, sortOffset: number) =>
          lineItems.map((li, i) => ({
            org_id: orgId,
            invoice_id: invoiceId,
            name: li.name,
            description: li.description,
            qty: li.qty,
            rate_cents: li.rate_cents,
            total_cents: li.total_cents,
            service_date: li.service_date,
            is_taxable: li.is_taxable,
            product_id: li.productId ?? null,
            sort_order: sortOffset + i,
            visit_id: i === 0 && tagVisit ? visitId : null,
          }));

        // Mirrors useCreateInvoiceFromJob's productLinks step: link each
        // inserted line back to the job product it came from and flip it to
        // 'invoiced' via set_job_product_status(), which decrements
        // product_items.quantity_on_hand server-side when that product
        // tracks inventory. insertedLineItems is positional — same order as
        // toLineRows/lineItems.
        async function linkProductLines(insertedLineItems: { id: string }[] | null) {
          if (!insertedLineItems) return;
          const links = lineItems
            .map((li, i) => ({ li, insertedId: insertedLineItems[i]?.id }))
            .filter((x): x is { li: AutoInvoiceLine; insertedId: string } => !!x.li.jobProductId && !!x.insertedId);
          await Promise.all(
            links.map(async ({ li, insertedId }) => {
              // Errors must not be swallowed: an unlinked row stays 'pending' and
              // the next completed visit would bill the same material again. The
              // link write happens first and is what the sweep above keys on.
              const { error: linkErr } = await supabase
                .from("crm_job_products")
                .update({ invoice_line_item_id: insertedId })
                .eq("id", li.jobProductId as string);
              if (linkErr) {
                log.error("job product link failed", { jobProductId: li.jobProductId, error: linkErr.message });
                return;
              }
              const { error: statusErr } = await supabase.rpc("set_job_product_status", {
                p_job_product_id: li.jobProductId,
                p_new_status: "invoiced",
              });
              // e.g. insufficient stock raises; the row stays linked (so it is not
              // re-billed) but not 'invoiced', surfaced here for follow-up.
              if (statusErr) {
                log.error("job product status flip failed", { jobProductId: li.jobProductId, error: statusErr.message });
              }
            })
          );
        }

        if (subtotal <= 0) {
          result.invoiceSkipReason = "zero_subtotal";
        } else {
          // Clients billed daily/weekly/monthly get every visit of the same
          // period folded into one draft instead of one invoice per visit:
          // "daily" is one invoice per client per service day. Only
          // "upon_completion" clients get one invoice per visit.
          const invoiceFrequency: string = j.clients?.invoice_frequency ?? "daily";
          const periodDate = visitDate ?? today;
          const period = invoiceFrequency === "monthly"
            ? getMonthRange(periodDate)
            : invoiceFrequency === "weekly"
              ? getWeekRange(periodDate)
              : invoiceFrequency === "daily"
                ? { start: periodDate, end: periodDate }
                : null;
          // A batch draft is split by sales rep and PO number as well as client
          // and period: the header carries ONE rep (commission) and ONE PO, so
          // folding a second job with a different rep/PO into it credited the
          // wrong rep and printed the wrong PO.
          const salesRepId: string | null = j.sales_rep_id ?? null;
          const poNumber: string | null = j.po_number?.trim() || null;
          // Narrows a crm_invoices query to drafts of this visit's rep + PO.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sameRepAndPo = (q: any) => {
            const byRep = salesRepId ? q.eq("sales_rep_id", salesRepId) : q.is("sales_rep_id", null);
            // (Blank POs are written as null by this path, never "".)
            return poNumber ? byRep.eq("po_number", poNumber) : byRep.is("po_number", null);
          };

          let existingInvoice: { id: string } | null = null;
          if (period && j.client_id) {
            // A locked invoice (printed/manually locked for review) must not be
            // silently appended to — fall through to creating a fresh draft for
            // this period instead, same as if no open invoice existed yet.
            const openQuery = supabase
              .from("crm_invoices")
              .select("id")
              .eq("org_id", orgId)
              .eq("client_id", j.client_id)
              .eq("status", "draft")
              .eq("locked", false)
              .is("deleted_at", null)
              // Only fold into drafts this auto path itself created: job-linked,
              // never contract / project / estimate invoices, and at the same
              // tax rate (increment_invoice_totals re-taxes at the existing
              // invoice's rate).
              .not("crm_job_id", "is", null)
              .is("contract_id", null)
              .is("project_id", null)
              .is("estimate_id", null)
              .eq("tax_rate_bps", taxRateBps)
              // This auto path stamps its drafts with the period's first day.
              // Weekly/monthly drafts written before that column existed are
              // still matched by date; daily batching is new, so a daily
              // client only ever joins a stamped draft (never, say, a manual
              // invoice dated the same day).
              .or(
                invoiceFrequency === "daily"
                  ? `auto_bill_period_start.eq.${period.start}`
                  : `auto_bill_period_start.eq.${period.start},and(auto_bill_period_start.is.null,invoice_date.gte.${period.start},invoice_date.lte.${period.end})`
              );
            const { data: openInvoice } = await sameRepAndPo(openQuery)
              .order("invoice_date", { ascending: true })
              .limit(1)
              .maybeSingle();
            existingInvoice = (openInvoice as { id: string } | null) ?? null;
          }

          // Appends this visit's lines to an open period draft. A closure because two paths
          // need it: the normal "an open draft already exists" case, and the race-loser case
          // below (another completion created the period's draft between our lookup and insert).
          // Returns false when that draft is no longer an open draft by the time we write —
          // printed, sent, locked or deleted after the lookup — so the caller starts a new one.
          const appendToDraft = async (invoiceId: string): Promise<boolean> => {
            // One transaction (crm_append_auto_draft_lines): row-locks the invoice,
            // re-checks it is still an unlocked draft, inserts the lines and re-totals
            // with increment_invoice_totals (atomic increment; tax re-derived from all
            // lines at the invoice's rate). Separate writes let lines land on an invoice
            // the customer already had.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: insertedIds, error: appendErr } = await (supabase.rpc as any)("crm_append_auto_draft_lines", {
              p_invoice_id: invoiceId,
              p_lines: toLineRows(invoiceId, 0),
              p_delta_cents: subtotal,
            });
            if (appendErr) throw appendErr;
            if (insertedIds == null) return false;
            const insertedLines = (insertedIds as string[]).map((id) => ({ id }));

            // Link job products only once the totals include their lines, so a
            // failed append above never leaves a material marked invoiced.
            await linkProductLines(insertedLines);

            if (j.client_id) {
              await supabase.rpc("sync_client_balance", { p_client_id: j.client_id });
            }
            result.invoiced = true;
            result.invoiceId = invoiceId;
            return true;
          };

          const appended = existingInvoice ? await appendToDraft(existingInvoice.id) : false;
          if (!appended) {
            const { data: orgTermsRow } = await supabase
              .from("organizations")
              .select("default_billing_terms")
              .eq("id", orgId)
              .maybeSingle();
            const invoiceTerms = resolveInvoiceTerms(
              j.clients?.default_terms,
              (orgTermsRow as { default_billing_terms: string | null } | null)?.default_billing_terms,
            );
            // A batch draft collects the whole period, so it is dated the
            // period's last day (the service day for daily, Sunday of the
            // Mon–Sun week, or the month's last day) and its terms run from
            // then — dating it on the first visit made it fall due (and show
            // past due) before the period it bills had even ended. A per-visit
            // (upon-completion) invoice is dated the day it is created, in the
            // org's time zone, with its due date counted from that day; each
            // line keeps the visit's service_date.
            const newInvoiceDate = period ? period.end : today;
            // Batched clients: crm_invoices_auto_period_draft_unique allows ONE open auto draft
            // per client + period + tax rate + sales rep + PO, so two completions that both found "no draft yet" cannot
            // both create one. The header starts at zero and every visit's lines (this one included)
            // are added through increment_invoice_totals, which row-locks the invoice and re-derives
            // tax from ALL its lines — so the totals are right whichever visit's lines land first.
            const zeroHeader = !!period;
            let lostRace = false;
            const { data: newInvoice, error: invErr } = await supabase
              .from("crm_invoices")
              .insert({
                org_id: orgId,
                client_id: j.client_id,
                crm_job_id: j.id,
                sales_rep_id: j.sales_rep_id ?? null,
                description: visitInvoiceDescription ?? jobInvoiceDescription ?? "Service",
                invoice_date: newInvoiceDate,
                terms: invoiceTerms,
                due_date: computeDueDate(newInvoiceDate, invoiceTerms),
                status: "draft",
                subtotal_cents: zeroHeader ? 0 : subtotal,
                tax_rate_bps: taxRateBps,
                tax_cents: zeroHeader ? 0 : taxCents,
                total_cents: zeroHeader ? 0 : subtotal + taxCents,
                balance_cents: zeroHeader ? 0 : subtotal + taxCents,
                amount_paid_cents: 0,
                po_number: poNumber,
                auto_bill_period_start: period ? period.start : null,
              })
              .select("id, invoice_number")
              .single();
            if (invErr) {
              if (period && (invErr as { code?: string }).code === "23505") {
                // Lost the race: another completion's draft for this period committed first. Join it.
                const { data: winner } = await sameRepAndPo(
                  supabase
                    .from("crm_invoices")
                    .select("id")
                    .eq("org_id", orgId)
                    .eq("client_id", j.client_id)
                    .eq("status", "draft")
                    .eq("locked", false)
                    .is("deleted_at", null)
                    .eq("auto_bill_period_start", period.start)
                    .eq("tax_rate_bps", taxRateBps)
                )
                  .limit(1)
                  .maybeSingle();
                if (!winner) throw invErr;
                // The winner was issued in the meantime too: leave this visit for the next
                // completion / a person rather than loop.
                if (!(await appendToDraft((winner as { id: string }).id))) throw invErr;
                lostRace = true;
              } else {
                throw invErr;
              }
            }
            if (!lostRace) {
            const newInvoiceId = (newInvoice as { id: string }).id;
            let newInvoiceCreated = true;

            if (lineItems.length > 0) {
              const { data: insertedLines, error: lineErr } = await supabase
                .from("crm_invoice_line_items")
                .insert(toLineRows(newInvoiceId, 0))
                .select("id");
              if (lineErr) {
                // Header and lines are two statements — don't leave a
                // line-less draft (with full totals) behind when the lines
                // fail, e.g. a concurrent completion already claimed this
                // visit's line via crm_invoice_line_items_visit_id_unique.
                // Soft delete: no number was assigned yet, nothing refers to it.
                await supabase
                  .from("crm_invoices")
                  .update({ deleted_at: new Date().toISOString() })
                  .eq("id", newInvoiceId);
                if ((lineErr as { code?: string }).code === "23505") {
                  result.invoiceSkipReason = "already_invoiced";
                  newInvoiceCreated = false;
                } else {
                  throw lineErr;
                }
              } else {
                if (zeroHeader) {
                  const { error: incErr } = await supabase.rpc("increment_invoice_totals", {
                    p_invoice_id: newInvoiceId,
                    p_delta_cents: subtotal,
                  });
                  if (incErr) {
                    // Same rollback as the append path: no line-less/total-less draft left behind.
                    const insertedIds = ((insertedLines ?? []) as { id: string }[]).map((l) => l.id);
                    if (insertedIds.length > 0) await supabase.from("crm_invoice_line_items").delete().in("id", insertedIds);
                    await supabase.from("crm_invoices").update({ deleted_at: new Date().toISOString() }).eq("id", newInvoiceId);
                    throw incErr;
                  }
                }
                await linkProductLines(insertedLines as { id: string }[] | null);
              }
            }

            if (newInvoiceCreated && j.client_id) {
              // Auto-created invoices skip the manual "assign on save" flow, so
              // assign the number here or it stays null indefinitely.
              const { data: invoiceNumber, error: assignErr } = await supabase.rpc(
                "assign_invoice_number",
                { p_invoice_id: newInvoiceId }
              );
              if (assignErr) log.error("assign_invoice_number failed", { visitId, error: assignErr.message });

              // Sync the client's outstanding balance to include this new invoice
              await supabase.rpc("sync_client_balance", { p_client_id: j.client_id });

              // Skip logging if the number assignment failed — a broken "Invoice
              // #null" entry is worse than none; the invoice will still get a
              // correct timeline entry whenever it's next saved manually.
              if (invoiceNumber != null) {
                await supabase.from("client_activity").insert({
                  org_id: orgId,
                  client_id: j.client_id,
                  activity_type: "invoice",
                  subject: `Invoice #${invoiceNumber}`,
                  amount_cents: subtotal + taxCents,
                  ref_id: newInvoiceId,
                  ref_table: "crm_invoices",
                });
              }
            }
            if (newInvoiceCreated) {
              result.invoiced = true;
              result.invoiceId = newInvoiceId;
            }
            }
          }
        }
      }
    }
  } catch (err) {
    // Auto-invoicing is best-effort — a failure here must not swallow the
    // "Visit completed" activity-timeline entry logged just below.
    log.error("auto-invoice failed", { visitId, error: err instanceof Error ? err.message : String(err) });
    result.invoiceSkipReason = result.invoiceSkipReason ?? "error";
  }

  // ── 3. Client activity timeline ───────────────────────────────────────────
  // Include the specific service and date so this entry is useful on its own —
  // otherwise every visit across every job reads as the same bare "Visit
  // completed" with no way to tell them apart in the timeline.
  if (visit.client_id) {
    const visitService = visitJobServiceId
      ? (j?.crm_job_services ?? []).find((s) => s.id === visitJobServiceId)
      : null;
    const detailLabel: string | null = visit.invoice_description || visitService?.service_name || null;
    const visitDateLabel = visit.scheduled_date
      ? new Date(`${visit.scheduled_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
    const subject = ["Visit completed", detailLabel ? `— ${detailLabel}` : null, visitDateLabel ? `(${visitDateLabel})` : null]
      .filter(Boolean)
      .join(" ");

    let alreadyLogged = false;
    if (args.dedupeActivity) {
      const { data: existingRow } = await supabase
        .from("client_activity")
        .select("id")
        .eq("client_id", visit.client_id)
        .eq("activity_type", "job")
        .eq("ref_id", visit.job_id)
        .eq("subject", subject)
        .limit(1)
        .maybeSingle();
      alreadyLogged = !!existingRow;
    }

    if (!alreadyLogged) {
      const { error: actErr } = await supabase.from("client_activity").insert({
        org_id: orgId,
        client_id: visit.client_id,
        activity_type: "job",
        subject,
        // The crew's completion notes, so they read on the client timeline and not only in the audit trail.
        body: notesToPlainText(visit.completion_notes).trim().slice(0, 2000) || null,
        ref_id: visit.job_id,
        ref_table: "crm_jobs",
        created_by: userId,
      });
      if (actErr) log.error("activity insert failed", { visitId, error: actErr.message });
      else result.activityLogged = true;
    }
  }

  // ── 4. Automation triggers ────────────────────────────────────────────────
  // Fire any 'service_visit_completed' sequence triggers configured for the
  // service(s) this visit covered. Best-effort — an automation-enrollment
  // failure must never block the completion response.
  if (fireAutomations) {
    try {
      if (visit.client_id) {
        let serviceIds: string[] = [];
        if (visitJobServiceId) {
          const { data: js } = await supabase
            .from("crm_job_services")
            .select("service_id")
            .eq("id", visitJobServiceId)
            .maybeSingle();
          const sid = (js as { service_id: string | null } | null)?.service_id;
          if (sid) serviceIds = [sid];
        } else {
          const { data: jobServices } = await supabase
            .from("crm_job_services")
            .select("service_id")
            .eq("job_id", visit.job_id);
          serviceIds = ((jobServices ?? []) as { service_id: string | null }[])
            .map((s) => s.service_id)
            .filter((id): id is string => !!id);
        }

        const newEnrollmentIds: string[] = [];
        if (serviceIds.length > 0) {
          newEnrollmentIds.push(...await fireServiceVisitCompletedTriggers(supabase, { orgId, clientId: visit.client_id, serviceIds }));
        }
        newEnrollmentIds.push(
          ...await fireSimpleTrigger(supabase, { orgId, clientId: visit.client_id, triggerType: "visit_completed", matchValues: serviceIds })
        );

        // Drive each new enrollment through any steps due right now (e.g. an
        // email with no "wait" in front of it) instead of leaving it queued
        // for the next daily /api/automations/run cron sweep. Needs the
        // service-role client since the processor writes across tables not
        // all covered by a request's RLS-scoped session.
        if (newEnrollmentIds.length > 0) {
          const adminClient = createClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );
          for (const enrollmentId of newEnrollmentIds) {
            await processEnrollmentImmediately(adminClient, enrollmentId);
          }
        }
      }
    } catch (err) {
      log.error("automation trigger enrollment failed", { visitId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  result.ok = true;
  return result;
}
