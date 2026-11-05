import { computeDueDate, resolveInvoiceTerms } from "@/lib/invoices/due-date";
import {
  computeAutoInvoiceTotals,
  lineTotalCents,
  resolveAutoInvoiceTaxRateBps,
  resolveJobServiceTaxable,
} from "@/lib/invoices/auto-invoice-tax";
import { stripHtml } from "@/lib/utils/strip-html";

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

  const { data: visits, error: vErr } = await supabase
    .from("crm_job_visits")
    .select("id")
    .eq("job_id", jobId);
  if (vErr) throw vErr;
  const visitIds = ((visits ?? []) as { id: string }[]).map((v) => v.id);
  if (visitIds.length === 0) return null;
  const { data: lines, error: lErr } = await supabase
    .from("crm_invoice_line_items")
    .select("invoice_id, crm_invoices(id, invoice_number, status, deleted_at)")
    .in("visit_id", visitIds);
  if (lErr) throw lErr;
  const live = ((lines ?? []) as { crm_invoices: EmbeddedInvoice }[])
    .map((l) => l.crm_invoices)
    .find(isLiveEmbeddedInvoice);
  return live ? { id: live.id, invoiceNumber: live.invoice_number } : null;
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
  // Present only for line items sourced from a job Product — links the
  // invoice line back to the catalog product and flips the source
  // crm_job_products row to 'invoiced' (decrementing inventory if the
  // product tracks it) once the invoice is created.
  productId?: string | null;
  jobProductId?: string | null;
}

export interface InvoiceFromJobInput {
  jobId: string;
  /** Invoicing one visit (Dispatch Board): tags its first line with
   *  visit_id — the idempotency key every invoicing path checks — and
   *  dedupes on the visit instead of the whole job. */
  visitId?: string | null;
  clientId: string;
  description: string;
  invoiceDate: string;
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
  { jobId, visitId, clientId, description, invoiceDate, dueDate, poNumber, lineItems }: InvoiceFromJobInput
): Promise<InvoiceFromJobResult> {
  const { data: job, error: jobErr } = await supabase
    .from("crm_jobs")
    .select("org_id, sales_rep_id, job_type, estimate_id, clients(default_tax_rate_bps, default_terms, is_taxable), crm_job_services(id, is_taxable, crm_services(is_taxable))")
    .eq("id", jobId)
    .single();
  if (jobErr) throw jobErr;
  const jobRow = job as {
    org_id: string;
    sales_rep_id: string | null;
    job_type: string;
    estimate_id: string | null;
    clients: { default_tax_rate_bps: number | null; default_terms: string | null; is_taxable: boolean | null } | null;
    crm_job_services: { id: string; is_taxable: boolean | null; crm_services: { is_taxable: boolean | null } | null }[] | null;
  };
  const orgId = jobRow.org_id;

  // ── Idempotency: never bill work a live invoice already covers ──────
  let existing: InvoiceRef | null = null;
  let tagVisit = false;
  if (visitId) {
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
  const lines = lineItems.map((li) => {
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
  const terms = resolveInvoiceTerms(jobRow.clients?.default_terms, (orgRow as { default_billing_terms: string | null } | null)?.default_billing_terms);

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
          sort_order: i,
          // First line only — crm_invoice_line_items_visit_id_unique.
          visit_id: tagVisit && i === 0 ? visitId : null,
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
    .select("id, client_id, scheduled_date, invoice_description, rate_cents, crm_job_services(id, service_name, qty, rate_cents, sort_order, invoice_desc, crm_services(invoice_description))")
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
      invoice_desc: string | null;
      crm_services: { invoice_description: string | null } | null;
    }[] | null;
  };

  const { data: products, error: prodErr } = await supabase
    .from("crm_job_products")
    .select("id, product_id, product_name, qty, invoice_qty, unit_price_cents, status, invoice_line_item_id, job_service_subitem_id")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at");
  if (prodErr) throw prodErr;

  const serviceDate = j.scheduled_date ?? today;
  const services = [...(j.crm_job_services ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
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
  }[])
    .filter((p) => BILLABLE_JOB_PRODUCT_STATUSES.includes(p.status) && !p.invoice_line_item_id && !p.job_service_subitem_id)
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
    : productLineItems.length > 0
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
