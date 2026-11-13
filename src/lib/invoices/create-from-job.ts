import { computeDueDate, resolveInvoiceTerms } from "@/lib/invoices/due-date";
import { loadPrintedSubitems, splitPrintedSubitems } from "@/lib/invoices/printed-subitems";
import {
  computeAutoInvoiceTotals,
  lineTotalCents,
  resolveAutoInvoiceTaxRateBps,
  resolveJobServiceTaxable,
} from "@/lib/invoices/auto-invoice-tax";
import { stripHtml } from "@/lib/utils/strip-html";
import { contractCoversServiceDay, type CoverageContractRow } from "@/lib/contract-billing";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";

/**
 * "Invoice a job" — shared by useCreateInvoiceFromJob (the browser, under the
 * user's session) and /api/crm/jobs/[jobId]/auto-invoice (the server, as the
 * service role, for the automatic invoice when a one-time job is completed).
 *
 * Every insert carries org_id explicitly (the job's org) and every org-level
 * read is filtered by it: under the service role my_org_id() is null and RLS
 * does not scope anything.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

// A "live" invoice is one that still bills the client: not soft-deleted and
// not void. A voided invoice no longer covers the work — re-invoicing after a
// void (e.g. cancel → reopen → complete) is legitimate. Same definition as
// trg_crm_job_visits_guard_invoiced.
export type InvoiceRef = { id: string; invoiceNumber: number | null };
type EmbeddedInvoice = { id: string; invoice_number: number | null; status: string; deleted_at: string | null } | null;
const isLiveEmbeddedInvoice = (inv: EmbeddedInvoice): inv is NonNullable<EmbeddedInvoice> =>
  !!inv && inv.deleted_at == null && inv.status !== "void";

export async function findLiveInvoiceForVisit(supabase: AnyClient, visitId: string): Promise<{ invoice: InvoiceRef | null; visitLineExists: boolean }> {
  const { data, error } = await supabase
    .from("crm_invoice_line_items")
    .select("invoice_id, crm_invoices(id, invoice_number, status, deleted_at)")
    .eq("visit_id", visitId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { invoice: null, visitLineExists: false };
  const inv = (data as { crm_invoices: EmbeddedInvoice }).crm_invoices;
  return {
    invoice: isLiveEmbeddedInvoice(inv) ? { id: inv.id, invoiceNumber: inv.invoice_number } : null,
    // crm_invoice_line_items_visit_id_unique: once any line (even on a void
    // invoice) carries the visit id, no other line may.
    visitLineExists: true,
  };
}

// .in() lists are chunked so a long-running recurring job's visit ids never
// overflow the request URL; each chunk returns at most one tagged line per
// visit, so it also stays under PostgREST's 1,000-row response cap.
const IN_CHUNK = 100;

type JobVisitRow = {
  id: string;
  status: string;
  job_service_id: string | null;
  crew_group_secondary: boolean | null;
  scheduled_date: string | null;
  qty: number | null;
  rate_cents: number | null;
  deleted_at: string | null;
};

/** Every visit of a job, deleted ones included, paged past the 1,000-row cap. */
async function fetchJobVisits(supabase: AnyClient, jobId: string): Promise<JobVisitRow[]> {
  return fetchAllRows<JobVisitRow>(() =>
    supabase
      .from("crm_job_visits")
      .select("id, status, job_service_id, crew_group_secondary, scheduled_date, qty, rate_cents, deleted_at")
      .eq("job_id", jobId)
  );
}

/** visit id -> the live invoice whose line carries that visit's tag. */
async function liveInvoicesForVisits(supabase: AnyClient, visitIds: string[]): Promise<Map<string, InvoiceRef>> {
  const out = new Map<string, InvoiceRef>();
  for (let i = 0; i < visitIds.length; i += IN_CHUNK) {
    const { data: lines, error } = await supabase
      .from("crm_invoice_line_items")
      .select("visit_id, crm_invoices(id, invoice_number, status, deleted_at)")
      .in("visit_id", visitIds.slice(i, i + IN_CHUNK));
    if (error) throw error;
    for (const l of (lines ?? []) as { visit_id: string; crm_invoices: EmbeddedInvoice }[]) {
      if (isLiveEmbeddedInvoice(l.crm_invoices)) {
        out.set(l.visit_id, { id: l.crm_invoices.id, invoiceNumber: l.crm_invoices.invoice_number });
      }
    }
  }
  return out;
}

// Whether any live invoice already covers a job: one billed directly to it
// (crm_job_id), or a line tagged with one of its visits — per-service split
// visits and weekly/monthly period invoices bill a job's visits onto
// invoices that may carry a different (or no) crm_job_id.
export async function findLiveInvoiceCoveringJob(supabase: AnyClient, jobId: string): Promise<InvoiceRef | null> {
  const { data: direct, error } = await supabase
    .from("crm_invoices")
    .select("id, invoice_number")
    .eq("crm_job_id", jobId)
    .is("deleted_at", null)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (direct) return { id: (direct as { id: string }).id, invoiceNumber: (direct as { invoice_number: number | null }).invoice_number };

  const visits = await fetchJobVisits(supabase, jobId);
  if (visits.length === 0) return null;
  const byVisit = await liveInvoicesForVisits(supabase, visits.map((v) => v.id));
  return byVisit.values().next().value ?? null;
}

// ── What may be invoiced from a manual button ──────────────────────────────

/**
 * Thrown when a job or visit must not be invoiced from a manual Invoice
 * button or the completed-job auto-invoice: the client's contract already
 * pays for the work, or the job bills another way (project milestones, Snow
 * Invoicing). The message is written for the user.
 */
export class InvoiceBlockedError extends Error {
  readonly invoiceBlocked = true;
  constructor(message: string) {
    super(message);
    this.name = "InvoiceBlockedError";
  }
}

export function isInvoiceBlockedError(err: unknown): err is InvoiceBlockedError {
  return err instanceof Error && (err as { invoiceBlocked?: boolean }).invoiceBlocked === true;
}

const SNOW_BLOCK_MESSAGE = "Snow jobs are billed from Snow Invoicing (per storm), not from the job or a visit.";
const PROJECT_BLOCK_MESSAGE = "Project jobs are billed through the project's milestone schedule, not per job or visit.";
const CONTRACT_BLOCK_MESSAGE = "The client's contract covers this work and bills it on the contract's own cycle. Invoicing it here would bill the client twice.";

const COVERAGE_CONTRACT_COLUMNS =
  "status, is_active, deleted_at, start_date, end_date, last_billed_date, billing_anchor_date, first_period_prorated_at, billing_frequency, billing_day_of_month, bill_month_in_advance, signed_at, created_at";

/** The day a visit is billed for: its scheduled day, or today when it was
 *  done ahead of schedule — the visit auto-invoice's rule. */
function billedServiceDay(scheduledDate: string | null | undefined, today: string): string {
  return scheduledDate && scheduledDate <= today ? scheduledDate : today;
}

/**
 * Why this job (or one visit of it) must not be invoiced manually, or null
 * when it may be. Mirrors the visit auto-invoice's skips
 * (complete-visit-side-effects.ts: "contract", "snow", "project"), so a
 * manual Invoice button can never bill what completion deliberately didn't.
 */
export async function invoiceBlockReason(
  supabase: AnyClient,
  { jobId, visitId }: { jobId: string; visitId?: string | null }
): Promise<string | null> {
  const { data: job, error } = await supabase
    .from("crm_jobs")
    .select("org_id, job_type, contract_id, scheduled_date, last_service_date")
    .eq("id", jobId)
    .single();
  if (error) throw error;
  const j = job as { org_id: string; job_type: string; contract_id: string | null; scheduled_date: string | null; last_service_date: string | null };
  if (j.job_type === "snow") return SNOW_BLOCK_MESSAGE;
  if (j.job_type === "project") return PROJECT_BLOCK_MESSAGE;
  if (!j.contract_id) return null;

  const { data: contract, error: cErr } = await supabase
    .from("crm_contracts")
    .select(COVERAGE_CONTRACT_COLUMNS)
    .eq("id", j.contract_id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!contract) return null;
  const today = todayInZone(await getOrgTimeZone(supabase, j.org_id));
  let scheduled: string | null = j.last_service_date ?? j.scheduled_date;
  if (visitId) {
    const { data: v, error: vErr } = await supabase
      .from("crm_job_visits").select("scheduled_date").eq("id", visitId).maybeSingle();
    if (vErr) throw vErr;
    scheduled = (v as { scheduled_date: string | null } | null)?.scheduled_date ?? null;
  }
  return contractCoversServiceDay(contract as CoverageContractRow, billedServiceDay(scheduled, today))
    ? CONTRACT_BLOCK_MESSAGE
    : null;
}

/**
 * What one visit bills for a service: the visit's own Rate × Qty set on the
 * dispatch sheet (crm_job_visits.rate_cents / qty — the figures
 * rpt_job_visits and Job Costing use) when a rate is set, otherwise the
 * service's rate × qty. A visit qty of 0/blank counts as 1, as in the report.
 */
export function visitLineAmount(
  visit: { rate_cents?: number | null; qty?: number | null } | null | undefined,
  fallback: { rateCents: number; qty: number }
): { qty: number; rateCents: number; totalCents: number } {
  if (visit && visit.rate_cents != null) {
    const q = visit.qty != null && Number(visit.qty) > 0 ? Number(visit.qty) : 1;
    return { qty: q, rateCents: visit.rate_cents, totalCents: lineTotalCents(visit.rate_cents, q) };
  }
  return { qty: fallback.qty, rateCents: fallback.rateCents, totalCents: lineTotalCents(fallback.rateCents, fallback.qty) };
}

export interface InvoiceFromJobLine {
  name?: string;
  description: string;
  qty: number;
  rateCents: number;
  totalCents: number;
  serviceDate?: string | null;
  /** crm_job_services.id this line bills — drives is_taxable. */
  jobServiceId?: string | null;
  /** The catalog service this line bills, when known (itemized sub-item rows carry their parent's). */
  serviceId?: string | null;
  // Present only for line items sourced from a job Product — links the
  // invoice line back to the catalog product and flips the source
  // crm_job_products row to 'invoiced' (decrementing inventory if the
  // product tracks it) once the invoice is created.
  productId?: string | null;
  jobProductId?: string | null;
  /** The completed visit this line bills (completed-job remainder invoice):
   *  tags the line with visit_id, the idempotency key every path checks. */
  visitId?: string | null;
}

export interface InvoiceFromJobInput {
  jobId: string;
  /** Invoicing one visit (Dispatch Board): tags its first line with
   *  visit_id — the idempotency key every invoicing path checks — and
   *  dedupes on the visit instead of the whole job. */
  visitId?: string | null;
  clientId: string;
  description: string;
  /** Defaults to the org's today: an invoice is dated the day it is created
   *  (its lines keep their service dates), and its due date runs from then. */
  invoiceDate?: string;
  dueDate?: string;
  poNumber?: string | null;
  /** Totals and tax are derived here from these lines, exactly like the
   *  server-side visit-completion auto-invoice (auto-invoice-tax.ts):
   *  rate = accepted estimate's rate, else the client's default; only
   *  lines with a taxable jobServiceId are taxed. */
  lineItems: InvoiceFromJobLine[];
}

/** The crm_invoices row (raw), and whether a live invoice already covered the work. */
export interface InvoiceFromJobResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any;
  alreadyInvoiced: boolean;
}

export async function createInvoiceFromJob(
  supabase: AnyClient,
  userId: string | null,
  input: InvoiceFromJobInput,
  opts: { skipCoverageChecks?: boolean } = {}
): Promise<InvoiceFromJobResult> {
  const { jobId, visitId, clientId, description, dueDate, poNumber, lineItems } = input;
  // Contract-covered work, project jobs and snow jobs are never billed from
  // here — completion skips them on purpose (see invoiceBlockReason).
  if (!opts.skipCoverageChecks) {
    const blocked = await invoiceBlockReason(supabase, { jobId, visitId });
    if (blocked) throw new InvoiceBlockedError(blocked);
  }
  const { data: job, error: jobErr } = await supabase
    .from("crm_jobs")
    .select("org_id, sales_rep_id, job_type, estimate_id, invoice_terms, clients(default_tax_rate_bps, default_terms, is_taxable), crm_job_services(id, service_id, is_taxable, crm_services(is_taxable))")
    .eq("id", jobId)
    .single();
  if (jobErr) throw jobErr;
  const jobRow = job as {
    org_id: string;
    sales_rep_id: string | null;
    job_type: string;
    estimate_id: string | null;
    invoice_terms: string | null;
    clients: { default_tax_rate_bps: number | null; default_terms: string | null; is_taxable: boolean | null } | null;
    crm_job_services: { id: string; service_id: string | null; is_taxable: boolean | null; crm_services: { is_taxable: boolean | null } | null }[] | null;
  };
  const orgId = jobRow.org_id;

  // ── Idempotency: never bill work a live invoice already covers ──────
  // (Skipped only by invoiceCompletedJob's remainder invoice, which has
  // already worked out per visit what is still unbilled.)
  let existing: InvoiceRef | null = null;
  let tagVisit = false;
  if (opts.skipCoverageChecks) {
    // nothing to look up
  } else if (visitId) {
    // A secondary crew's visit on a multi-crew stop never bills on its own:
    // the stop is billed once, from the lead visit.
    const { data: grp } = await supabase
      .from("crm_job_visits").select("crew_group_id, crew_group_secondary").eq("id", visitId).maybeSingle();
    const g = grp as { crew_group_id: string | null; crew_group_secondary: boolean | null } | null;
    if (g?.crew_group_secondary && g.crew_group_id) {
      const { data: lead } = await supabase
        .from("crm_job_visits").select("id").eq("crew_group_id", g.crew_group_id)
        .eq("crew_group_secondary", false).is("deleted_at", null).maybeSingle();
      const leadFound = lead ? await findLiveInvoiceForVisit(supabase, (lead as { id: string }).id) : null;
      if (!leadFound?.invoice) {
        throw new Error("This crew shares the stop with another crew — it bills once, from the lead crew's visit. Invoice that visit instead.");
      }
      existing = leadFound.invoice;
    }
    const found = existing ? { invoice: existing, visitLineExists: true } : await findLiveInvoiceForVisit(supabase, visitId);
    existing = found.invoice;
    tagVisit = !found.visitLineExists;
    // Legacy single-visit one_time/waiting_list jobs: one invoice per job
    // (same guard as the server path).
    if (!existing && (jobRow.job_type === "one_time" || jobRow.job_type === "waiting_list")) {
      const { data: v } = await supabase
        .from("crm_job_visits").select("job_service_id").eq("id", visitId).maybeSingle();
      if (!(v as { job_service_id: string | null } | null)?.job_service_id) {
        existing = await findLiveInvoiceCoveringJob(supabase, jobId);
      }
    }
  } else {
    existing = await findLiveInvoiceCoveringJob(supabase, jobId);
  }
  if (existing) {
    const { data: row, error: rowErr } = await supabase
      .from("crm_invoices").select("*").eq("id", existing.id).single();
    if (rowErr) throw rowErr;
    return { row, alreadyInvoiced: true };
  }

  // ── Totals + tax (shared with complete-visit-side-effects.ts) ───────
  let estimateTaxRateBps: number | null = null;
  if (jobRow.estimate_id) {
    const { data: est } = await supabase
      .from("estimates").select("tax_rate_bps").eq("id", jobRow.estimate_id).maybeSingle();
    estimateTaxRateBps = (est as { tax_rate_bps: number | null } | null)?.tax_rate_bps ?? null;
  }
  const taxRateBps = resolveAutoInvoiceTaxRateBps(estimateTaxRateBps, jobRow.clients?.default_tax_rate_bps, jobRow.clients?.is_taxable);
  const svcById = new Map((jobRow.crm_job_services ?? []).map((s) => [s.id, s]));
  // Product lines take the catalog product's selling-tax flag
  // (product_items.is_taxable); a zero tax rate still yields zero tax.
  const productIds = [...new Set(lineItems.map((li) => li.productId).filter((id): id is string => !!id))];
  const productTaxable = new Map<string, boolean>();
  if (productIds.length > 0) {
    const { data: taxRows, error: taxErr } = await supabase
      .from("product_items")
      .select("id, is_taxable")
      .in("id", productIds);
    if (taxErr) throw taxErr;
    for (const t of (taxRows ?? []) as { id: string; is_taxable: boolean | null }[]) productTaxable.set(t.id, t.is_taxable ?? false);
  }
  // Sub-items flagged "On invoice" print as their own rows under the service,
  // their amount taken out of the service row so the total never changes.
  const printedBySvc = await loadPrintedSubitems(
    supabase,
    jobRow.job_type,
    [...new Set(lineItems.map((li) => li.jobServiceId).filter((id): id is string => !!id))]
  );
  const itemizedLines: InvoiceFromJobLine[] = lineItems.flatMap((li) => {
    const split = li.jobServiceId && !li.productId ? splitPrintedSubitems(li, printedBySvc.get(li.jobServiceId)) : null;
    if (!split) return [li];
    return [
      { ...li, rateCents: split.parent.rateCents, totalCents: split.parent.totalCents },
      ...split.children.map((c) => ({
        name: c.name,
        description: c.name,
        qty: c.qty,
        rateCents: c.rateCents,
        totalCents: c.totalCents,
        serviceDate: li.serviceDate,
        jobServiceId: li.jobServiceId,
        // No forced service: the invoice-line resolver files it by name (same as the visit path).
      })),
    ];
  });
  const lines = itemizedLines.map((li) => {
    const svc = li.jobServiceId ? svcById.get(li.jobServiceId) : undefined;
    const isTaxable = svc
      ? resolveJobServiceTaxable(svc.is_taxable, svc.crm_services?.is_taxable)
      : li.productId
        ? (productTaxable.get(li.productId) ?? false)
        : false;
    return {
      ...li,
      totalCents: Math.round(li.totalCents),
      isTaxable,
    };
  });
  const { subtotalCents, taxCents, totalCents } = computeAutoInvoiceTotals(lines, taxRateBps);

  // New invoices take the client's default terms, else the org's default
  // billing terms, and a due date computed from them — an explicit due date
  // from the caller still wins.
  const { data: orgRow } = await supabase
    .from("organizations").select("default_billing_terms").eq("id", orgId).maybeSingle();
  const terms = resolveInvoiceTerms(jobRow.invoice_terms || jobRow.clients?.default_terms, (orgRow as { default_billing_terms: string | null } | null)?.default_billing_terms);
  const invoiceDate = input.invoiceDate || todayInZone(await getOrgTimeZone(supabase, orgId));

  const { data, error } = await supabase
    .from("crm_invoices")
    .insert({
      org_id: orgId,
      created_by: userId,
      client_id: clientId,
      crm_job_id: jobId,
      sales_rep_id: jobRow.sales_rep_id ?? null,
      description,
      invoice_date: invoiceDate,
      terms,
      due_date: dueDate || computeDueDate(invoiceDate, terms),
      po_number: poNumber ?? null,
      status: "draft",
      subtotal_cents: subtotalCents,
      tax_rate_bps: taxRateBps,
      tax_cents: taxCents,
      total_cents: totalCents,
      balance_cents: totalCents,
    })
    .select()
    .single();
  if (error) throw error;

  const invoiceId = (data as { id: string }).id;

  if (lines.length > 0) {
    const { data: insertedLineItems, error: liError } = await supabase
      .from("crm_invoice_line_items")
      .insert(
        lines.map((li, i) => ({
          org_id: orgId,
          invoice_id: invoiceId,
          name: li.name ?? null,
          description: li.description,
          qty: li.qty,
          rate_cents: li.rateCents,
          total_cents: li.totalCents,
          service_date: li.serviceDate ?? null,
          product_id: li.productId ?? null,
          is_taxable: li.isTaxable,
          ...(li.serviceId ? { service_id: li.serviceId } : {}),
          sort_order: i,
          // One line per visit — crm_invoice_line_items_visit_id_unique.
          visit_id: li.visitId ?? (tagVisit && i === 0 ? visitId : null),
        }))
      )
      .select("id");
    if (liError) {
      // Header and lines are two statements — don't leave a line-less
      // draft carrying full totals behind (it would also satisfy every
      // duplicate check above and block the real invoice). Soft delete:
      // no number is assigned yet and nothing refers to it.
      await supabase
        .from("crm_invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", invoiceId);
      throw liError;
    }

    // Line items sourced from a job Product: link the invoice line back
    // to the job product row and flip it to 'invoiced' via
    // set_job_product_status(), which decrements product_items.quantity_on_hand
    // server-side when that product tracks inventory.
    const productLinks = lines
      .map((li, i) => ({ li, insertedId: (insertedLineItems as { id: string }[] | null)?.[i]?.id }))
      .filter((x) => x.li.jobProductId && x.insertedId);
    await Promise.all(
      productLinks.map(async ({ li, insertedId }) => {
        // Errors are thrown, not swallowed: an unlinked material stays
        // pending and would be billed again on the next invoice.
        const { error: linkErr } = await supabase
          .from("crm_job_products")
          .update({ invoice_line_item_id: insertedId })
          .eq("id", li.jobProductId);
        if (linkErr) throw linkErr;
        const { error: statusErr } = await supabase.rpc("set_job_product_status", {
          p_job_product_id: li.jobProductId,
          p_new_status: "invoiced",
        });
        if (statusErr) throw statusErr;
      })
    );
  }

  // tag the job as invoiced
  await supabase
    .from("crm_jobs")
    .update({ sub_status: "invoiced" })
    .eq("id", jobId);

  // log to client activity timeline
  await supabase.from("client_activity").insert({
    org_id: orgId,
    created_by: userId,
    client_id: clientId,
    activity_type: "invoice",
    subject: data.invoice_number != null ? `Invoice #${data.invoice_number}` : "Draft Invoice",
    amount_cents: data.total_cents ?? 0,
    ref_id: invoiceId,
    ref_table: "crm_invoices",
  });

  return { row: data, alreadyInvoiced: false };
}

/** crm_job_products statuses that still owe the client an invoice line.
 *  `used_no_invoice` and `not_used` are deliberately absent, and `invoiced`
 *  has already been billed. Shared with JobDetail.tsx's Invoice button. */
export const BILLABLE_JOB_PRODUCT_STATUSES: string[] = ["pending", "used"];

/**
 * A whole-job invoice has no single visit to bill against, so it must not pick up a
 * material that was planned for one specific visit (visit_id set) until the crew has
 * recorded it as actually used — otherwise a Pending material for tomorrow's stop gets
 * billed on today's job invoice. Job-level rows (visit_id null) are unaffected.
 */
export function isBillableOnWholeJobInvoice(p: { visit_id?: string | null; visitId?: string | null; status: string }): boolean {
  const scoped = p.visit_id ?? p.visitId ?? null;
  return !scoped || p.status === "used";
}

/**
 * Which job-product statuses a COMPLETED VISIT bills. On recurring and
 * package jobs the office plans materials ahead ("pending") for the whole
 * season, so a visit bills only what the crew recorded as actually `used`;
 * pending rows stay pending (not invoiced, stock not decremented) until the
 * crew records them. One-time and waiting-list jobs bill planned materials at
 * completion too.
 */
export function billableJobProductStatusesForVisit(jobType: string | null | undefined): string[] {
  return jobType === "recurring" || jobType === "package" ? ["used"] : BILLABLE_JOB_PRODUCT_STATUSES;
}

/**
 * The automatic invoice for a completed one-time job, built from what is in
 * the database: one line per job service (else a single job-rate line), plus
 * every still-billable job product. Mirrors what JobDetail.tsx used to send
 * from the browser, so the route can build it without trusting client amounts.
 */
export async function buildCompletedJobInvoiceInput(
  supabase: AnyClient,
  jobId: string,
  today: string
): Promise<InvoiceFromJobInput> {
  const { data: job, error: jobErr } = await supabase
    .from("crm_jobs")
    .select("id, client_id, scheduled_date, invoice_description, rate_cents, crm_job_services(id, service_name, qty, rate_cents, sort_order, included, invoice_desc, crm_services(invoice_description))")
    .eq("id", jobId)
    .single();
  if (jobErr) throw jobErr;
  const j = job as {
    id: string;
    client_id: string;
    scheduled_date: string | null;
    invoice_description: string | null;
    rate_cents: number | null;
    crm_job_services: {
      id: string;
      service_name: string | null;
      qty: number | null;
      rate_cents: number | null;
      sort_order: number | null;
      included: boolean | null;
      invoice_desc: string | null;
      crm_services: { invoice_description: string | null } | null;
    }[] | null;
  };

  const { data: products, error: prodErr } = await supabase
    .from("crm_job_products")
    .select("id, product_id, product_name, qty, invoice_qty, unit_price_cents, status, invoice_line_item_id, job_service_subitem_id, visit_id")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at");
  if (prodErr) throw prodErr;

  const serviceDate = j.scheduled_date ?? today;
  // Stopped services (included = false: removed from the job, kept for their
  // history) are never billed by a whole-job invoice.
  const hasAnyService = (j.crm_job_services ?? []).length > 0;
  const services = [...(j.crm_job_services ?? [])]
    .filter((s) => s.included !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const productLineItems: InvoiceFromJobLine[] = ((products ?? []) as {
    id: string;
    product_id: string | null;
    product_name: string;
    qty: number;
    invoice_qty: number | null;
    unit_price_cents: number;
    status: string;
    invoice_line_item_id: string | null;
    job_service_subitem_id: string | null;
    visit_id: string | null;
  }[])
    .filter((p) => BILLABLE_JOB_PRODUCT_STATUSES.includes(p.status) && !p.invoice_line_item_id && !p.job_service_subitem_id && isBillableOnWholeJobInvoice(p))
    .map((p) => {
      // Bill the invoice_qty override when set (e.g. 5 bags used, only 4
      // invoiced) — the used qty still drives the inventory decrement.
      const billedQty = Number(p.invoice_qty ?? p.qty);
      const rate = Number(p.unit_price_cents);
      return {
        name: p.product_name,
        description: p.product_name,
        qty: billedQty,
        rateCents: rate,
        totalCents: lineTotalCents(rate, billedQty),
        serviceDate,
        productId: p.product_id,
        jobProductId: p.id,
      };
    });
  const svcLineItems: InvoiceFromJobLine[] = services.length > 0
    ? services.map((s) => ({
        name: s.service_name ?? "",
        description: (s.invoice_desc ? stripHtml(s.invoice_desc) : "") || j.invoice_description || stripHtml(s.crm_services?.invoice_description || "") || s.service_name || "Service",
        qty: s.qty ?? 1,
        rateCents: s.rate_cents ?? 0,
        totalCents: lineTotalCents(s.rate_cents ?? 0, s.qty ?? 1),
        serviceDate,
        jobServiceId: s.id,
      }))
    : productLineItems.length > 0 || hasAnyService
      ? []
      : [{ name: "Service", description: j.invoice_description || "Service", qty: 1, rateCents: j.rate_cents ?? 0, totalCents: j.rate_cents ?? 0, serviceDate }];

  return {
    jobId,
    clientId: j.client_id,
    description: `Service: ${services.map((s) => s.service_name ?? "").join(", ") || "Job"}`,
    invoiceDate: today,
    lineItems: [...svcLineItems, ...productLineItems],
  };
}

export interface CompletedJobInvoiceResult {
  invoiceId: string | null;
  /** Nothing new was billed: a live invoice already covers everything billable. */
  alreadyInvoiced: boolean;
  /** Work on the job that was NOT billed and needs a person to look at it. */
  warning: string | null;
}

/**
 * The automatic invoice for a one-time job just marked Completed (Job Detail,
 * via /api/crm/jobs/[jobId]/auto-invoice).
 *
 *  - Nothing billed yet: one invoice for the whole job (every service, else
 *    the job rate, plus every still-billable product), as before.
 *  - A job-level invoice (one not tied to any of its visits) exists: the job
 *    is covered; nothing more.
 *  - Some visits already billed themselves (a job split one visit per
 *    service, each auto-invoiced as it completed): bill the REMAINDER — every
 *    completed visit with no live invoice line, at its own rate (the visit's
 *    dispatch-sheet Rate × Qty, else its service's), each line tagged with
 *    its visit, plus still-billable products. This used to answer
 *    "alreadyInvoiced" and leave the other service silently unbilled.
 *  - A service with no visit at all is never guessed at: it is reported in
 *    `warning` so someone can bill it by hand.
 *
 * Throws InvoiceBlockedError for contract-covered work (and project/snow).
 */
export async function invoiceCompletedJob(
  supabase: AnyClient,
  userId: string | null,
  jobId: string,
  today: string
): Promise<CompletedJobInvoiceResult> {
  const blocked = await invoiceBlockReason(supabase, { jobId });
  if (blocked) throw new InvoiceBlockedError(blocked);

  const visits = await fetchJobVisits(supabase, jobId);
  const invoicedByVisit = await liveInvoicesForVisits(supabase, visits.map((v) => v.id));
  const visitInvoiceIds = new Set([...invoicedByVisit.values()].map((r) => r.id));

  const { data: directRows, error: directErr } = await supabase
    .from("crm_invoices")
    .select("id, invoice_number")
    .eq("crm_job_id", jobId)
    .is("deleted_at", null)
    .neq("status", "void")
    .order("created_at", { ascending: false });
  if (directErr) throw directErr;
  // An invoice billed straight to the job that carries none of its visits'
  // tags is a whole-job invoice (Job Detail's Invoice button, or this route
  // earlier): it covers everything.
  const jobLevel = ((directRows ?? []) as { id: string }[]).find((d) => !visitInvoiceIds.has(d.id));
  if (jobLevel) return { invoiceId: jobLevel.id, alreadyInvoiced: true, warning: null };

  if (invoicedByVisit.size === 0) {
    const input = await buildCompletedJobInvoiceInput(supabase, jobId, today);
    const { row, alreadyInvoiced } = await createInvoiceFromJob(supabase, userId, input, { skipCoverageChecks: true });
    return { invoiceId: (row as { id: string }).id, alreadyInvoiced, warning: null };
  }

  const firstInvoiceId = invoicedByVisit.values().next().value?.id ?? null;
  const liveVisits = visits.filter((v) => v.deleted_at == null && !v.crew_group_secondary);
  // A billed visit that covered the whole job (no linked service) billed every service.
  if (liveVisits.some((v) => v.job_service_id == null && invoicedByVisit.has(v.id))) {
    return { invoiceId: firstInvoiceId, alreadyInvoiced: true, warning: null };
  }

  const { data: job, error: jobErr } = await supabase
    .from("crm_jobs")
    .select("id, client_id, invoice_description, crm_job_services(id, service_name, qty, rate_cents, sort_order, included, invoice_desc, crm_services(invoice_description))")
    .eq("id", jobId)
    .single();
  if (jobErr) throw jobErr;
  const j = job as {
    id: string;
    client_id: string;
    invoice_description: string | null;
    crm_job_services: {
      id: string;
      service_name: string | null;
      qty: number | null;
      rate_cents: number | null;
      sort_order: number | null;
      included: boolean | null;
      invoice_desc: string | null;
      crm_services: { invoice_description: string | null } | null;
    }[] | null;
  };
  // Stopped services (included = false) stay in the loop: a completed visit
  // linked to one still bills that service's line. They are just never
  // reported as missing a visit.
  const services = [...(j.crm_job_services ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const lines: InvoiceFromJobLine[] = [];
  const billedNames: string[] = [];
  const unbilled: string[] = [];
  for (const s of services) {
    const name = s.service_name || "Service";
    const svcVisits = liveVisits.filter((v) => v.job_service_id === s.id);
    if (svcVisits.length === 0) {
      if (s.included !== false) unbilled.push(name);
      continue;
    }
    // Skipped / cancelled visits are not billed; billed ones are done.
    for (const v of svcVisits.filter((sv) => sv.status === "completed" && !invoicedByVisit.has(sv.id))) {
      const amount = visitLineAmount(v, { rateCents: s.rate_cents ?? 0, qty: s.qty ?? 1 });
      lines.push({
        name,
        description: (s.invoice_desc ? stripHtml(s.invoice_desc) : "") || j.invoice_description || stripHtml(s.crm_services?.invoice_description || "") || name,
        qty: amount.qty,
        rateCents: amount.rateCents,
        totalCents: amount.totalCents,
        serviceDate: v.scheduled_date ?? today,
        jobServiceId: s.id,
        visitId: v.id,
      });
      billedNames.push(name);
    }
  }
  // A completed whole-job visit that never billed, next to visits that did,
  // would re-bill every service: leave it to a person.
  if (liveVisits.some((v) => v.job_service_id == null && v.status === "completed" && !invoicedByVisit.has(v.id))) {
    unbilled.push("a whole-job visit");
  }

  // Still-billable materials (one-time jobs bill planned ones too); each is
  // billed at most once — linking it below takes it out of every sweep.
  const { data: products, error: prodErr } = await supabase
    .from("crm_job_products")
    .select("id, product_id, product_name, qty, invoice_qty, unit_price_cents, status, visit_id")
    .eq("job_id", jobId)
    .in("status", BILLABLE_JOB_PRODUCT_STATUSES)
    .is("invoice_line_item_id", null)
    .is("job_service_subitem_id", null)
    .is("deleted_at", null)
    .order("created_at");
  if (prodErr) throw prodErr;
  for (const p of ((products ?? []) as { id: string; product_id: string | null; product_name: string; qty: number; invoice_qty: number | null; unit_price_cents: number; status: string; visit_id: string | null }[]).filter(isBillableOnWholeJobInvoice)) {
    const billedQty = Number(p.invoice_qty ?? p.qty);
    const rate = Number(p.unit_price_cents);
    lines.push({
      name: p.product_name,
      description: p.product_name,
      qty: billedQty,
      rateCents: rate,
      totalCents: lineTotalCents(rate, billedQty),
      serviceDate: today,
      productId: p.product_id,
      jobProductId: p.id,
    });
  }

  const warning = unbilled.length > 0
    ? `Not billed automatically: ${unbilled.join(", ")} — no completed visit was recorded for it. Add it to an invoice by hand if the work was done.`
    : null;
  if (lines.length === 0) return { invoiceId: firstInvoiceId, alreadyInvoiced: true, warning };

  const { row } = await createInvoiceFromJob(
    supabase,
    userId,
    {
      jobId,
      clientId: j.client_id,
      description: `Service: ${[...new Set(billedNames)].join(", ") || "Materials"}`,
      invoiceDate: today,
      lineItems: lines,
    },
    { skipCoverageChecks: true }
  );
  return { invoiceId: (row as { id: string }).id, alreadyInvoiced: false, warning };
}
